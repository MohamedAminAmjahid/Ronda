import type {
  Action,
  Card,
  GameEvent,
  GameState,
  PlayerId,
  PlayerState,
  Value,
} from './types'
import { resolveCapture } from './capture'
import {
  detectCombination,
  basePoints,
  resolveConflict,
  resolveContest,
} from './combinations'
import { applyEndOfDeal } from './scoring'
import { dealNextRound } from './deal'
import type { Rng } from './deck'

// ---------------------------------------------------------------------------
// Helpers immuables
// ---------------------------------------------------------------------------

function updatePlayer(
  state: GameState,
  id: PlayerId,
  patch: Partial<PlayerState>,
): GameState {
  const players: [PlayerState, PlayerState] = [
    { ...state.players[0] },
    { ...state.players[1] },
  ]
  players[id] = { ...players[id], ...patch }
  return { ...state, players }
}

function sameCard(a: Card, b: Card): boolean {
  return a.value === b.value && a.suit === b.suit
}

function cardInHand(hand: readonly Card[], card: Card): boolean {
  return hand.some(c => sameCard(c, card))
}

function removeFromHand(hand: readonly Card[], card: Card): Card[] {
  const idx = hand.findIndex(c => sameCard(c, card))
  if (idx === -1) throw new Error(`Card not in hand: ${card.value} ${card.suit}`)
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)]
}

// ---------------------------------------------------------------------------
// Gestion de la fin de tour
// ---------------------------------------------------------------------------

function advanceTurn(state: GameState, rng: Rng): GameState {
  const handsEmpty =
    state.players[0].hand.length === 0 && state.players[1].hand.length === 0

  if (!handsEmpty) {
    const next = (1 - state.currentPlayer) as PlayerId
    return { ...state, currentPlayer: next }
  }

  if (state.deck.length > 0) {
    return dealNextRound(state, rng)
  }

  return applyEndOfDeal(state, rng)
}

// ---------------------------------------------------------------------------
// Action PLAY_CARD
// ---------------------------------------------------------------------------

function applyPlayCard(
  state: GameState,
  playerId: PlayerId,
  card: Card,
  rng: Rng,
): GameState {
  if (state.phase === 'GAME_OVER') throw new Error('Game is over')
  if (state.currentPlayer !== playerId) throw new Error('Not your turn')
  if (!cardInHand(state.players[playerId].hand, card)) throw new Error('Card not in hand')

  const opponent = (1 - playerId) as PlayerId
  const lastPlayedByOpponent = state.lastPlayed[opponent]
  const player = state.players[playerId]

  const newHand = removeFromHand(player.hand, card)

  // Perte du droit à déclarer si la carte jouée faisait partie de la combo détectée
  const wasPartOfCombo =
    player.pendingCombo !== null &&
    player.pendingCombo.cards.some(c => sameCard(c, card))
  const lostRight = !player.lostComboRight && wasPartOfCombo

  // Toutes les cartes jouées dans cette redistribution (pour la validation du contre)
  const newPlayedThisRound = [...player.playedThisRound, card]

  const captureResult = resolveCapture(card, state.table, lastPlayedByOpponent)
  const newLastPlayed: [Card | null, Card | null] = [state.lastPlayed[0], state.lastPlayed[1]]
  newLastPlayed[playerId] = card

  let newState: GameState

  if (captureResult !== null) {
    const { captured, tableAfter, isCaida, isMissa } = captureResult

    let scoreBonus = 0
    if (isCaida) scoreBonus += 1
    if (isMissa) scoreBonus += 1

    const events: GameEvent[] = [
      ...(isCaida ? (['caida'] as const) : []),
      ...(isMissa ? (['missa'] as const) : []),
    ]

    const updatedPlayer: PlayerState = {
      ...player,
      hand: newHand,
      captured: [...player.captured, card, ...captured],
      score: player.score + scoreBonus,
      lostComboRight: player.lostComboRight || lostRight,
      playedThisRound: newPlayedThisRound,
      pendingCombo: detectCombination(newHand),
    }

    newState = {
      ...state,
      table: tableAfter,
      players: [
        playerId === 0 ? updatedPlayer : state.players[0],
        playerId === 1 ? updatedPlayer : state.players[1],
      ],
      lastCapture: { playerId, card },
      lastPlayed: newLastPlayed,
      lastEvents: events,
      eventSeq: events.length > 0 ? state.eventSeq + 1 : state.eventSeq,
    }
  } else {
    const updatedPlayer: PlayerState = {
      ...player,
      hand: newHand,
      lostComboRight: player.lostComboRight || lostRight,
      playedThisRound: newPlayedThisRound,
      pendingCombo: detectCombination(newHand),
    }

    newState = {
      ...state,
      table: [...state.table, card],
      players: [
        playerId === 0 ? updatedPlayer : state.players[0],
        playerId === 1 ? updatedPlayer : state.players[1],
      ],
      lastPlayed: newLastPlayed,
      lastEvents: [],
      eventSeq: state.eventSeq,
    }
  }

  return advanceTurn(newState, rng)
}

// ---------------------------------------------------------------------------
// Action DECLARE
// ---------------------------------------------------------------------------

function applyDeclare(
  state: GameState,
  playerId: PlayerId,
  combination: PlayerState['pendingCombo'],
): GameState {
  if (combination === null) throw new Error('No combination to declare')
  if (state.currentPlayer !== playerId) throw new Error('Not your turn')

  const player = state.players[playerId]
  if (player.lostComboRight) throw new Error('Lost right to declare')

  for (const c of combination.cards) {
    if (!cardInHand(player.hand, c)) throw new Error('No longer holding all combo cards')
  }

  const opponent = (1 - playerId) as PlayerId
  const opponentPlayer = state.players[opponent]

  const declareEvent: GameEvent = combination.type  // 'ronda' | 'tringa'

  if (opponentPlayer.declaredCombo !== null) {
    const { pointsA, pointsB } = resolveConflict(combination, opponentPlayer.declaredCombo)
    const myPoints = playerId === 0 ? pointsA : pointsB
    const opPoints = playerId === 0 ? pointsB : pointsA
    const opAlreadyMarked = basePoints(opponentPlayer.declaredCombo)

    let s = updatePlayer(state, playerId, {
      declaredCombo: combination,
      score: player.score + myPoints,
    })
    s = updatePlayer(s, opponent, {
      declaredCombo: null,
      score: opponentPlayer.score - opAlreadyMarked + opPoints,
    })
    return { ...s, lastEvents: [declareEvent], eventSeq: state.eventSeq + 1 }
  }

  const s = updatePlayer(state, playerId, {
    declaredCombo: combination,
    score: player.score + basePoints(combination),
  })
  return { ...s, lastEvents: [declareEvent], eventSeq: state.eventSeq + 1 }
}

// ---------------------------------------------------------------------------
// Action CONTEST
// ---------------------------------------------------------------------------

function applyContest(
  state: GameState,
  contestorId: PlayerId,
  accusedValue: Value,
): GameState {
  if (state.currentPlayer !== contestorId) throw new Error('Not your turn')

  const opponent = (1 - contestorId) as PlayerId
  const opponentPlayer = state.players[opponent]
  const contestorPlayer = state.players[contestorId]

  const { contestorDelta, wasCorrect } = resolveContest(
    accusedValue,
    opponentPlayer.playedThisRound,
    opponentPlayer.hand,
  )

  const s = wasCorrect
    ? updatePlayer(state, contestorId, { score: contestorPlayer.score + contestorDelta })
    : updatePlayer(state, contestorId, { score: Math.max(0, contestorPlayer.score + contestorDelta) })

  return { ...s, lastEvents: ['contre'], eventSeq: state.eventSeq + 1 }
}

// ---------------------------------------------------------------------------
// Réducteur principal
// ---------------------------------------------------------------------------

export function applyAction(state: GameState, action: Action, rng: Rng): GameState {
  switch (action.type) {
    case 'PLAY_CARD':
      return applyPlayCard(state, action.playerId, action.card, rng)
    case 'DECLARE':
      return applyDeclare(state, action.playerId, action.combination)
    case 'CONTEST':
      return applyContest(state, action.playerId, action.accusedValue)
  }
}

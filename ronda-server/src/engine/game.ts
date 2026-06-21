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
import { dealNextRound, CARDS_PER_REDEAL } from './deal'
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

  // On ne redistribue que si la pioche permet un tour complet (3 cartes × 2).
  // Sinon la donne se termine (les ~2 dernières cartes restent non distribuées).
  if (state.deck.length >= CARDS_PER_REDEAL) {
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

  // ── Chaîne de caídas (section 3.2) ──────────────────────────────────────
  // Une caída (capture de la dernière carte adverse, même value+suit) fait monter
  // la chaîne tant que c'est la MÊME valeur. ENTRE deux caídas, l'appât — une carte
  // de MÊME valeur posée SANS capturer — doit PRÉSERVER la chaîne : sinon Ara
  // Khamssa / Ara 7dach ne se déclencheraient jamais en jeu réel (la pose de
  // l'appât réinitialisait la chaîne). Tout autre coup brise la chaîne (null).
  const prevChain = state.caidaChain
  let caidaLevel: 0 | 1 | 2 | 3 = 0
  let newCaidaChain: GameState['caidaChain'] = null
  if (captureResult !== null && captureResult.isCaida) {
    if (prevChain !== null && prevChain.value === card.value && prevChain.level === 1) {
      caidaLevel = 2                                  // Ara Khamssa
    } else if (prevChain !== null && prevChain.value === card.value && prevChain.level === 2) {
      caidaLevel = 3                                  // Ara 7dach
    } else {
      caidaLevel = 1                                  // Ara Wahd (nouvelle chaîne)
    }
    newCaidaChain = { level: caidaLevel, value: card.value }
  } else if (captureResult === null && prevChain !== null && prevChain.value === card.value) {
    // Appât de même valeur posé sans capture → la chaîne se poursuit.
    newCaidaChain = prevChain
  }

  const caidaPoints = caidaLevel === 3 ? 11 : caidaLevel === 2 ? 5 : caidaLevel === 1 ? 1 : 0
  const caidaEvents: GameEvent[] =
    caidaLevel === 3 ? ['ara_7dach'] :
    caidaLevel === 2 ? ['ara_khamssa'] :
    caidaLevel === 1 ? ['caida'] : []

  let newState: GameState

  if (captureResult !== null) {
    const { captured, tableAfter, isMissa } = captureResult

    let scoreBonus = caidaPoints
    if (isMissa) scoreBonus += 1

    const events: GameEvent[] = [
      ...caidaEvents,
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
      caidaChain: newCaidaChain,
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
      // newCaidaChain : préservée si appât de même valeur, sinon null.
      caidaChain: newCaidaChain,
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
  // La déclaration est une annonce libre : elle n'avance pas le tour et peut
  // donc être faite même hors de son tour (le bouton Ronda/Tringa reste visible
  // côté UI quel que soit le tour courant).

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

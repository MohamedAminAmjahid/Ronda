import type { Card, GameEvent, Combination, Value } from '../engine/types'
import { resolveCapture } from '../engine/capture'
import { detectCombination, resolveContest } from '../engine/combinations'
import type { Rng } from '../engine/deck'
import { dealNextRound2v2 } from './deal2v2'
import { applyEndOfDeal2v2 } from './scoring2v2'
import { resolveCombos2v2 } from './combos2v2'
import type {
  Action2v2,
  GameState2v2,
  PlayerId2v2,
  PlayerState2v2,
  TeamState,
} from './types2v2'
import { teamOf, nextPlayer, prevPlayer } from './types2v2'

// ── Helpers immuables ─────────────────────────────────────────────────────────

function sameCard(a: Card, b: Card): boolean {
  return a.value === b.value && a.suit === b.suit
}

function cardInHand(hand: readonly Card[], card: Card): boolean {
  return hand.some((c) => sameCard(c, card))
}

function removeFromHand(hand: readonly Card[], card: Card): Card[] {
  const idx = hand.findIndex((c) => sameCard(c, card))
  if (idx === -1) throw new Error(`Card not in hand: ${card.value} ${card.suit}`)
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)]
}

type Players4 = [PlayerState2v2, PlayerState2v2, PlayerState2v2, PlayerState2v2]
type Teams2 = [TeamState, TeamState]

function withPlayer(
  players: GameState2v2['players'],
  id: PlayerId2v2,
  patch: Partial<PlayerState2v2>,
): Players4 {
  const arr: Players4 = [players[0], players[1], players[2], players[3]]
  arr[id] = { ...arr[id], ...patch }
  return arr
}

function withTeam(teams: GameState2v2['teams'], t: 0 | 1, patch: Partial<TeamState>): Teams2 {
  const arr: Teams2 = [teams[0], teams[1]]
  arr[t] = { ...arr[t], ...patch }
  return arr
}

function declaredArray(
  players: GameState2v2['players'],
): [Combination | null, Combination | null, Combination | null, Combination | null] {
  return [
    players[0].declaredCombo,
    players[1].declaredCombo,
    players[2].declaredCombo,
    players[3].declaredCombo,
  ]
}

// ── Fin de tour ─────────────────────────────────────────────────────────────────

function advanceTurn2v2(state: GameState2v2, rng: Rng): GameState2v2 {
  const handsEmpty = state.players.every((p) => p.hand.length === 0)

  if (!handsEmpty) {
    return { ...state, currentPlayer: nextPlayer(state.currentPlayer) }
  }
  if (state.deck.length > 0) {
    return dealNextRound2v2(state, rng)
  }
  return applyEndOfDeal2v2(state, rng)
}

// ── PLAY_CARD ─────────────────────────────────────────────────────────────────

function applyPlayCard2v2(
  state: GameState2v2,
  playerId: PlayerId2v2,
  card: Card,
  rng: Rng,
): GameState2v2 {
  if (state.phase === 'GAME_OVER') throw new Error('Game is over')
  if (state.currentPlayer !== playerId) throw new Error('Not your turn')
  if (!cardInHand(state.players[playerId].hand, card)) throw new Error('Card not in hand')

  const player = state.players[playerId]
  const newHand = removeFromHand(player.hand, card)

  const wasPartOfCombo =
    player.pendingCombo !== null && player.pendingCombo.cards.some((c) => sameCard(c, card))
  const lostRight = !player.lostComboRight && wasPartOfCombo
  const newPlayedThisRound = [...player.playedThisRound, card]

  // Caída : on compare à la dernière carte posée par le joueur PRÉCÉDENT (sens du jeu).
  const lastPlayedByPrev = state.lastPlayed[prevPlayer(playerId)]
  const captureResult = resolveCapture(card, state.table, lastPlayedByPrev)

  const newLastPlayed: [Card | null, Card | null, Card | null, Card | null] = [
    state.lastPlayed[0],
    state.lastPlayed[1],
    state.lastPlayed[2],
    state.lastPlayed[3],
  ]
  newLastPlayed[playerId] = card

  // ── Chaîne de caídas (traverse les équipes dans le sens du jeu) ────────────
  // L'appât de même valeur posé sans capture préserve la chaîne (cf. game.ts).
  const prevChain = state.caidaChain
  let caidaLevel: 0 | 1 | 2 | 3 = 0
  let newCaidaChain: GameState2v2['caidaChain'] = null
  if (captureResult !== null && captureResult.isCaida) {
    if (prevChain !== null && prevChain.value === card.value && prevChain.level === 1) caidaLevel = 2
    else if (prevChain !== null && prevChain.value === card.value && prevChain.level === 2) caidaLevel = 3
    else caidaLevel = 1
    newCaidaChain = { level: caidaLevel, value: card.value }
  } else if (captureResult === null && prevChain !== null && prevChain.value === card.value) {
    newCaidaChain = prevChain
  }
  const caidaPoints = caidaLevel === 3 ? 11 : caidaLevel === 2 ? 5 : caidaLevel === 1 ? 1 : 0
  const caidaEvents: GameEvent[] =
    caidaLevel === 3 ? ['ara_7dach'] :
    caidaLevel === 2 ? ['ara_khamssa'] :
    caidaLevel === 1 ? ['caida'] : []

  const team = teamOf(playerId)
  const players = withPlayer(state.players, playerId, {
    hand: newHand,
    lostComboRight: player.lostComboRight || lostRight,
    playedThisRound: newPlayedThisRound,
    pendingCombo: detectCombination(newHand),
  })

  let newState: GameState2v2

  if (captureResult !== null) {
    const { captured, tableAfter, isMissa } = captureResult
    const bonus = caidaPoints + (isMissa ? 1 : 0)
    const events: GameEvent[] = [...caidaEvents, ...(isMissa ? (['missa'] as const) : [])]

    const teams = withTeam(state.teams, team, {
      captured: [...state.teams[team].captured, card, ...captured],
      score: state.teams[team].score + bonus,
    })

    newState = {
      ...state,
      table: tableAfter,
      players,
      teams,
      lastCapture: { playerId, card },
      lastPlayed: newLastPlayed,
      caidaChain: newCaidaChain,
      lastEvents: events,
      eventSeq: events.length > 0 ? state.eventSeq + 1 : state.eventSeq,
    }
  } else {
    newState = {
      ...state,
      table: [...state.table, card],
      players,
      lastPlayed: newLastPlayed,
      caidaChain: newCaidaChain, // préservée si appât de même valeur, sinon null
      lastEvents: [],
      eventSeq: state.eventSeq,
    }
  }

  return advanceTurn2v2(newState, rng)
}

// ── DECLARE ─────────────────────────────────────────────────────────────────────

function applyDeclare2v2(
  state: GameState2v2,
  playerId: PlayerId2v2,
  combination: Combination | null,
): GameState2v2 {
  if (combination === null) throw new Error('No combination to declare')
  // Annonce libre (n'avance pas le tour) → autorisée même hors de son tour.

  const player = state.players[playerId]
  if (player.lostComboRight) throw new Error('Lost right to declare')
  for (const c of combination.cards) {
    if (!cardInHand(player.hand, c)) throw new Error('No longer holding all combo cards')
  }

  // Recalcul pur télescopique : on crédite le delta (après − avant) à chaque équipe.
  const before = declaredArray(state.players)
  const after: typeof before = [before[0], before[1], before[2], before[3]]
  after[playerId] = combination
  const [bA, bB] = resolveCombos2v2(before)
  const [aA, aB] = resolveCombos2v2(after)

  const players = withPlayer(state.players, playerId, { declaredCombo: combination })
  let teams = withTeam(state.teams, 0, { score: state.teams[0].score + (aA - bA) })
  teams = withTeam(teams, 1, { score: teams[1].score + (aB - bB) })

  const event: GameEvent = combination.type // 'ronda' | 'tringa'
  return { ...state, players, teams, lastEvents: [event], eventSeq: state.eventSeq + 1 }
}

// ── CONTEST ─────────────────────────────────────────────────────────────────────

function applyContest2v2(
  state: GameState2v2,
  contestorId: PlayerId2v2,
  accusedPlayer: PlayerId2v2,
  accusedValue: Value,
): GameState2v2 {
  if (state.currentPlayer !== contestorId) throw new Error('Not your turn')
  if (teamOf(accusedPlayer) === teamOf(contestorId)) {
    throw new Error('Cannot contest a teammate')
  }

  const accused = state.players[accusedPlayer]
  const { contestorDelta, wasCorrect } = resolveContest(
    accusedValue,
    accused.playedThisRound,
    accused.hand,
  )

  const team = teamOf(contestorId)
  const raw = state.teams[team].score + contestorDelta
  const teams = withTeam(state.teams, team, {
    score: wasCorrect ? raw : Math.max(0, raw),
  })

  return { ...state, teams, lastEvents: ['contre'], eventSeq: state.eventSeq + 1 }
}

// ── Réducteur principal ───────────────────────────────────────────────────────

export function applyAction2v2(state: GameState2v2, action: Action2v2, rng: Rng): GameState2v2 {
  switch (action.type) {
    case 'PLAY_CARD':
      return applyPlayCard2v2(state, action.playerId, action.card, rng)
    case 'DECLARE':
      return applyDeclare2v2(state, action.playerId, action.combination)
    case 'CONTEST':
      return applyContest2v2(state, action.playerId, action.accusedPlayer, action.accusedValue)
  }
}

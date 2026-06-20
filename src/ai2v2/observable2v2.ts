import type { Card, Combination, GamePhase } from '../engine/types'
import type { GameState2v2, PlayerId2v2, TeamId } from '../engine2v2/types2v2'
import { teamOf } from '../engine2v2/types2v2'

/** Ce que le bot connaît de lui-même (information complète). */
export interface ObservableSelf2v2 {
  hand: readonly Card[]
  pendingCombo: Combination | null
  declaredCombo: Combination | null
  lostComboRight: boolean
}

/** Information PUBLIQUE d'un joueur (jamais sa main ni sa combo non déclarée). */
export interface PlayerPublic2v2 {
  playerId: PlayerId2v2
  team: TeamId
  handCount: number
  declaredCombo: Combination | null
  lostComboRight: boolean
}

export interface ObservableState2v2 {
  table: readonly Card[]
  deckSize: number
  phase: GamePhase
  currentPlayer: PlayerId2v2
  dealer: PlayerId2v2
  roundNumber: number
  dealNumber: number
  isMabqach: boolean
  lastCapture: { playerId: PlayerId2v2; card: Card } | null
  /** Dernière carte posée par chaque joueur (index = PlayerId2v2). */
  lastPlayed: readonly [Card | null, Card | null, Card | null, Card | null]
  self: ObservableSelf2v2
  selfId: PlayerId2v2
  teamScores: readonly [number, number]
  teamCapturedCount: readonly [number, number]
  players: readonly [PlayerPublic2v2, PlayerPublic2v2, PlayerPublic2v2, PlayerPublic2v2]
}

/**
 * Construit la vue observable depuis le point de vue de `playerId`.
 * Les mains des 3 autres joueurs ne sont jamais exposées (handCount uniquement),
 * ni leurs combos non déclarées. Les piles capturées sont au niveau équipe.
 */
export function getObservableState2v2(
  state: GameState2v2,
  playerId: PlayerId2v2,
): ObservableState2v2 {
  const self = state.players[playerId]
  const pub = (p: PlayerId2v2): PlayerPublic2v2 => ({
    playerId: p,
    team: teamOf(p),
    handCount: state.players[p].hand.length,
    declaredCombo: state.players[p].declaredCombo,
    lostComboRight: state.players[p].lostComboRight,
  })

  return {
    table: state.table,
    deckSize: state.deck.length,
    phase: state.phase,
    currentPlayer: state.currentPlayer,
    dealer: state.dealer,
    roundNumber: state.roundNumber,
    dealNumber: state.dealNumber,
    isMabqach: state.isMabqach,
    lastCapture: state.lastCapture,
    lastPlayed: state.lastPlayed,
    self: {
      hand: self.hand,
      pendingCombo: self.pendingCombo,
      declaredCombo: self.declaredCombo,
      lostComboRight: self.lostComboRight,
    },
    selfId: playerId,
    teamScores: [state.teams[0].score, state.teams[1].score],
    teamCapturedCount: [state.teams[0].captured.length, state.teams[1].captured.length],
    players: [pub(0), pub(1), pub(2), pub(3)],
  }
}

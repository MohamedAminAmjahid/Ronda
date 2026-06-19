import type {
  Card,
  Combination,
  GamePhase,
  GameState,
  PlayerId,
} from '../engine/types'

/** Ce que le bot connaît de lui-même (information complète). */
export interface ObservableSelf {
  hand: readonly Card[]
  captured: readonly Card[]
  score: number
  pendingCombo: Combination | null
  declaredCombo: Combination | null
  lostComboRight: boolean
}

/**
 * Ce que le bot peut observer de l'adversaire (information masquée).
 * La main et le contenu de la combo non déclarée sont intentionnellement absents.
 * Le bot doit déduire les paires cachées depuis sa propre mémoire (memory.currentHandPlays).
 */
export interface ObservableOpponent {
  handCount: number
  capturedCount: number
  score: number
  declaredCombo: Combination | null
  lostComboRight: boolean
}

export interface ObservableState {
  table: readonly Card[]
  deckSize: number
  self: ObservableSelf
  opponent: ObservableOpponent
  currentPlayer: PlayerId
  dealer: PlayerId
  phase: GamePhase
  roundNumber: number
  dealNumber: number
  isMabqach: boolean
  lastCapture: { playerId: PlayerId; card: Card } | null
  /** Dernière carte posée par chacun des deux joueurs (index = PlayerId). */
  lastPlayed: readonly [Card | null, Card | null]
}

/**
 * Construit la vue observable depuis le point de vue de `botId`.
 * L'adversaire n'expose jamais sa main ni sa combo potentielle non déclarée.
 */
export function getObservableState(state: GameState, botId: PlayerId): ObservableState {
  const opp = (1 - botId) as PlayerId
  const self = state.players[botId]
  const opponent = state.players[opp]

  return {
    table: state.table,
    deckSize: state.deck.length,
    self: {
      hand: self.hand,
      captured: self.captured,
      score: self.score,
      pendingCombo: self.pendingCombo,
      declaredCombo: self.declaredCombo,
      lostComboRight: self.lostComboRight,
    },
    opponent: {
      handCount: opponent.hand.length,
      capturedCount: opponent.captured.length,
      score: opponent.score,
      declaredCombo: opponent.declaredCombo,
      lostComboRight: opponent.lostComboRight,
    },
    currentPlayer: state.currentPlayer,
    dealer: state.dealer,
    phase: state.phase,
    roundNumber: state.roundNumber,
    dealNumber: state.dealNumber,
    isMabqach: state.isMabqach,
    lastCapture: state.lastCapture,
    lastPlayed: state.lastPlayed,
  }
}

import type { Card, Value, Combination, GameEvent, GamePhase } from '../engine/types'

// ── Identités joueurs / équipes ───────────────────────────────────────────────

export type PlayerId2v2 = 0 | 1 | 2 | 3
export type TeamId = 0 | 1 // Équipe A = joueurs 0 & 2, Équipe B = joueurs 1 & 3

/** Équipe d'un joueur : 0&2 → A (0), 1&3 → B (1). */
export const teamOf = (p: PlayerId2v2): TeamId => (p % 2) as TeamId
/** Joueur suivant dans le sens du jeu (anti-horaire : 0→3→2→1→0). */
export const nextPlayer = (p: PlayerId2v2): PlayerId2v2 => ((p + 3) % 4) as PlayerId2v2
/** Joueur précédent dans le sens du jeu (celui qui vient de jouer avant `p`). */
export const prevPlayer = (p: PlayerId2v2): PlayerId2v2 => ((p + 1) % 4) as PlayerId2v2

// ── États ─────────────────────────────────────────────────────────────────────

/** Un joueur : main + combos. Les cartes capturées et le score sont dans TeamState. */
export interface PlayerState2v2 {
  hand: readonly Card[]
  pendingCombo: Combination | null
  declaredCombo: Combination | null
  lostComboRight: boolean
  playedThisRound: readonly Card[]
}

/** Une équipe : pile de cartes capturées commune + score. */
export interface TeamState {
  captured: readonly Card[]
  score: number
}

export interface CaidaChain {
  level: 1 | 2 | 3
  value: Value
}

export interface GameState2v2 {
  players: readonly [PlayerState2v2, PlayerState2v2, PlayerState2v2, PlayerState2v2]
  teams: readonly [TeamState, TeamState]
  table: readonly Card[]
  deck: readonly Card[]
  currentPlayer: PlayerId2v2
  dealer: PlayerId2v2
  phase: GamePhase // 'PLAYING' | 'DEAL_END' | 'GAME_OVER'
  dealNumber: number
  roundNumber: number
  isMabqach: boolean
  lastCapture: { playerId: PlayerId2v2; card: Card } | null
  lastPlayed: readonly [Card | null, Card | null, Card | null, Card | null]
  caidaChain: CaidaChain | null
  /** Carte laissée par une caída (reste 1 tour) — cf. GameState 1v1. */
  pendingCaidaCard: { card: Card; playerId: PlayerId2v2 } | null
  lastEvents: readonly GameEvent[]
  eventSeq: number
}

// ── Actions ─────────────────────────────────────────────────────────────────────

export interface PlayCardAction2v2 {
  type: 'PLAY_CARD'
  playerId: PlayerId2v2
  card: Card
}

export interface DeclareAction2v2 {
  type: 'DECLARE'
  playerId: PlayerId2v2
  combination: Combination
}

export interface ContestAction2v2 {
  type: 'CONTEST'
  playerId: PlayerId2v2 // le contesteur
  accusedPlayer: PlayerId2v2 // l'adversaire accusé (doit être dans l'équipe adverse)
  accusedValue: Value
}

export type Action2v2 = PlayCardAction2v2 | DeclareAction2v2 | ContestAction2v2

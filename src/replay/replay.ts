import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Card, GameEvent, GamePhase, GameState, PlayerId, Value } from '../engine/types'

// Système de replay : on enregistre, pour chaque coup, l'action jouée et une
// image (frame) allégée de l'état résultant. Les 5 dernières parties sont
// persistées dans AsyncStorage.

const KEY = 'ronda_last_replay'
const MAX_REPLAYS = 5

// ── Types ───────────────────────────────────────────────────────────────────

/** Action enregistrée dans le journal de partie. */
export type GameAction =
  | { type: 'START' }
  | { type: 'DEAL' }
  | { type: 'PLAY_CARD'; playerId: PlayerId; card: Card }
  | { type: 'DECLARE'; playerId: PlayerId; value: Value }
  | { type: 'CONTEST'; playerId: PlayerId; value: Value }
  | { type: 'MOVE' }   // coup générique (parties en ligne, action non détaillée)

/** Image allégée de l'état à un instant donné (pour l'affichage du replay). */
export interface ReplayFrame {
  table: Card[]
  hands: [Card[], Card[]]
  capturedCounts: [number, number]
  scores: [number, number]
  currentPlayer: PlayerId
  deckCount: number
  lastPlayed: [Card | null, Card | null]
  events: GameEvent[]
  dealNumber: number
  phase: GamePhase
}

export interface ReplayStep {
  action: GameAction
  frame: ReplayFrame
}

export interface Replay {
  id: string
  date: number
  online: boolean
  steps: ReplayStep[]
  finalScores: [number, number]
  winner: PlayerId | null
}

// ── Construction ────────────────────────────────────────────────────────────

function copy(c: Card): Card { return { suit: c.suit, value: c.value } }
function copyOrNull(c: Card | null): Card | null { return c ? copy(c) : null }

/** Construit une frame allégée à partir d'un GameState. */
export function frameFromState(gs: GameState): ReplayFrame {
  return {
    table: gs.table.map(copy),
    hands: [gs.players[0].hand.map(copy), gs.players[1].hand.map(copy)],
    capturedCounts: [gs.players[0].captured.length, gs.players[1].captured.length],
    scores: [gs.players[0].score, gs.players[1].score],
    currentPlayer: gs.currentPlayer,
    deckCount: gs.deck.length,
    lastPlayed: [copyOrNull(gs.lastPlayed[0]), copyOrNull(gs.lastPlayed[1])],
    events: [...gs.lastEvents],
    dealNumber: gs.dealNumber,
    phase: gs.phase,
  }
}

/** Assemble un Replay à partir de ses étapes. `now` = timestamp (injecté). */
export function buildReplay(steps: ReplayStep[], online: boolean, now: number): Replay {
  const last = steps[steps.length - 1]?.frame
  const finalScores: [number, number] = last ? last.scores : [0, 0]
  const winner: PlayerId | null =
    finalScores[0] === finalScores[1] ? null : (finalScores[0] > finalScores[1] ? 0 : 1)
  return { id: String(now), date: now, online, steps, finalScores, winner }
}

// ── Persistance ─────────────────────────────────────────────────────────────

export async function loadReplays(): Promise<Replay[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Replay[]) : []
  } catch {
    return []
  }
}

export async function loadLatestReplay(): Promise<Replay | null> {
  const all = await loadReplays()
  return all[0] ?? null
}

/** Sauvegarde un replay en tête de liste (max 5 conservés). */
export async function saveReplay(replay: Replay): Promise<void> {
  try {
    const all = await loadReplays()
    const next = [replay, ...all].slice(0, MAX_REPLAYS)
    await AsyncStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // stockage indisponible — sans effet
  }
}

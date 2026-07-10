import { useSyncExternalStore } from 'react'
import type { Room } from 'colyseus.js'
import { spectateByCode } from './client'

// Vue « lecture seule » de l'état public d'une RondaRoom (spectateur). On lit
// directement le state Colyseus public (table, joueurs, tour) — les mains ne
// sont jamais exposées, on n'affiche que des compteurs (dos de cartes).

interface RawCard { value: number; suit: string }
interface RawPlayer { pseudo: string; seat: number; handCount: number; score: number; connected: boolean }
interface RawState {
  code: string; phase: string; currentSeat: number; dealNumber: number
  table:   { forEach: (cb: (c: RawCard) => void) => void }
  players: { forEach: (cb: (p: RawPlayer) => void) => void }
}

export interface SpectatePlayer { pseudo: string; seat: number; handCount: number; score: number; connected: boolean }

export interface SpectateSnapshot {
  status:         'idle' | 'connecting' | 'watching' | 'ended' | 'error'
  code:           string | null
  phase:          string
  currentSeat:    number
  dealNumber:     number
  table:          RawCard[]
  players:        SpectatePlayer[]   // triés par siège (0 puis 1)
  spectatorCount: number
  cheer:          { emoji: string; targetSeat: number; id: number } | null
  error:          string | null
}

const EMPTY: SpectateSnapshot = {
  status: 'idle', code: null, phase: 'WAITING', currentSeat: 0, dealNumber: 0,
  table: [], players: [], spectatorCount: 0, cheer: null, error: null,
}

let snapshot: SpectateSnapshot = EMPTY
let room: Room | null = null
let cheerCounter = 0
const listeners = new Set<() => void>()

function set(patch: Partial<SpectateSnapshot>): void {
  snapshot = { ...snapshot, ...patch }
  for (const l of listeners) l()
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
export function getSnapshot(): SpectateSnapshot { return snapshot }

function readState(state: RawState): void {
  const players: SpectatePlayer[] = []
  state.players.forEach((p) => players.push({
    pseudo: p.pseudo, seat: p.seat, handCount: p.handCount, score: p.score, connected: p.connected,
  }))
  players.sort((a, b) => a.seat - b.seat)
  const table: RawCard[] = []
  state.table.forEach((c) => table.push({ value: c.value, suit: c.suit }))
  const ended = state.phase === 'GAME_OVER' || state.phase === 'ABORTED'
  set({
    code: state.code, phase: state.phase, currentSeat: state.currentSeat,
    dealNumber: state.dealNumber, players, table,
    status: ended ? 'ended' : 'watching',
  })
}

export async function startSpectate(code: string, pseudo = 'Spectateur'): Promise<void> {
  stopSpectate()
  set({ ...EMPTY, status: 'connecting' })
  try {
    const r = await spectateByCode(code, pseudo)
    room = r
    r.onStateChange((st: unknown) => readState(st as RawState))
    try { readState(r.state as unknown as RawState) } catch { /* état pas encore prêt */ }
    r.onMessage('spectator_count', (m: { count: number }) => set({ spectatorCount: m.count }))
    r.onMessage('cheer', (m: { emoji: string; targetSeat: number }) =>
      set({ cheer: { emoji: m.emoji, targetSeat: m.targetSeat, id: ++cheerCounter } }))
    r.onMessage('game_over', () => set({ status: 'ended' }))
    r.onLeave(() => { room = null; if (snapshot.status !== 'ended') set({ status: 'ended' }) })
    r.onError((_c: number, msg?: string) => set({ status: 'error', error: msg ?? 'Erreur serveur.' }))
    set({ status: 'watching' })
  } catch (e) {
    set({ status: 'error', error: (e as Error).message || 'Partie introuvable.' })
  }
}

export function stopSpectate(): void {
  try { room?.leave() } catch { /* déjà fermée */ }
  room = null
  snapshot = EMPTY
}

/** Envoie un emoji de soutien (relayé à tous par le serveur). */
export function sendCheer(emoji: string, targetSeat: number): void {
  try { room?.send('cheer', { emoji, targetSeat }) } catch { /* room fermée */ }
}

export function useSpectate(): SpectateSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

import type { Room } from 'colyseus.js'
import { createDiJoujLobby, joinByCode } from './client'
import { attachRoom } from './storeDiJouj'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DjLobbySlot {
  sessionId: string
  pseudo:    string
  isAdmin:   boolean
  isBot:     boolean
  connected: boolean
  seat:      number
}

export type LobbyPhase = 'idle' | 'connecting' | 'waiting' | 'playing' | 'error'

export interface LobbyDjSnapshot {
  phase:       LobbyPhase
  code:        string | null
  playerCount: 2 | 4
  slots:       DjLobbySlot[]
  mySessionId: string | null
  error:       string | null
}

// ── Singleton store ───────────────────────────────────────────────────────────

let snapshot: LobbyDjSnapshot = {
  phase:       'idle',
  code:        null,
  playerCount: 2,
  slots:       [],
  mySessionId: null,
  error:       null,
}

const listeners = new Set<() => void>()
let room: Room | null = null
let navigateFn: ((path: string) => void) | null = null

function set(patch: Partial<LobbyDjSnapshot>): void {
  snapshot = { ...snapshot, ...patch }
  for (const l of listeners) l()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot(): LobbyDjSnapshot {
  return snapshot
}

// ── Wire room ─────────────────────────────────────────────────────────────────

function wireRoom(r: Room, pseudo: string): void {
  room = r

  const mySessionId = r.sessionId
  set({ mySessionId })

  // Sync lobby state from Colyseus schema
  r.onStateChange((state: {
    code?: string
    phase?: string
    playerCount?: number
    slots?: Map<string, { pseudo: string; isAdmin: boolean; isBot: boolean; connected: boolean; seat: number }>
  }) => {
    const slots: DjLobbySlot[] = []
    if (state.slots) {
      state.slots.forEach((s, sid) => {
        slots.push({
          sessionId: sid,
          pseudo:    s.pseudo,
          isAdmin:   s.isAdmin,
          isBot:     s.isBot,
          connected: s.connected,
          seat:      s.seat,
        })
      })
    }
    set({
      code:        state.code ?? snapshot.code,
      playerCount: (state.playerCount === 4 ? 4 : 2) as 2 | 4,
      slots,
    })
  })

  r.onMessage('game_start', () => {
    // Transfer room to the game store, then navigate
    attachRoom(r)
    room = null  // lobby store no longer owns the room
    set({ phase: 'playing' })
    if (navigateFn) navigateFn('/dijouj-online')
  })

  r.onMessage('error', (p: { message: string }) => set({ error: p.message }))

  r.onLeave(() => {
    if (snapshot.phase !== 'playing') set({ phase: 'error', error: 'Connexion perdue.' })
    room = null
  })

  r.onError((_code, message) =>
    set({ phase: 'error', error: message ?? 'Erreur serveur.' }),
  )
}

// ── Actions ───────────────────────────────────────────────────────────────────

export function registerNavigate(fn: (path: string) => void): void {
  navigateFn = fn
}

async function connect(factory: () => Promise<Room>, pseudo: string): Promise<void> {
  leaveLobby()
  set({ phase: 'connecting', error: null })
  try {
    const r = await factory()
    wireRoom(r, pseudo)
    set({ phase: 'waiting', code: (r.state as { code?: string })?.code ?? null })
  } catch (e) {
    set({ phase: 'error', error: (e as Error).message || 'Connexion impossible.' })
  }
}

export function createLobby(pseudo: string): Promise<void> {
  return connect(() => createDiJoujLobby(pseudo), pseudo)
}

export async function joinLobbyByCode(pseudo: string, code: string): Promise<void> {
  return connect(() => joinByCode(pseudo, code), pseudo)
}

export function setPlayerCount(count: 2 | 4): void {
  room?.send('set_player_count', { count })
}

export function startGame(): void {
  room?.send('start_game')
}

export function leaveLobby(): void {
  room?.leave()
  room = null
  set({
    phase:       'idle',
    code:        null,
    playerCount: 2,
    slots:       [],
    mySessionId: null,
    error:       null,
  })
}

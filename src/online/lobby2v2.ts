import type { Room } from 'colyseus.js'
import type { Card, Combination, GameEvent, Value } from '../engine/types'
import type { PlayerId2v2 } from '../engine2v2/types2v2'
import { createLobby2v2, joinByCode } from './client'

// ── Types ────────────────────────────────────────────────────────────────────

export interface LobbySlotView {
  key: string
  pseudo: string
  team: number // -1 = non choisie, 0 = A, 1 = B
  isAdmin: boolean
  isBot: boolean
  connected: boolean
  seat: number
}

export interface Server2v2GameState {
  seat: PlayerId2v2
  phase: 'PLAYING' | 'DEAL_END' | 'GAME_OVER'
  currentSeat: PlayerId2v2
  dealer: PlayerId2v2
  deckCount: number
  dealNumber: number
  roundNumber: number
  isMabqach: boolean
  table: Card[]
  lastPlayed: [Card | null, Card | null, Card | null, Card | null]
  lastCapture: { playerId: PlayerId2v2; card: Card } | null
  lastEvents: GameEvent[]
  eventSeq: number
  teams: [{ score: number; capturedCount: number }, { score: number; capturedCount: number }]
  players: { seat: PlayerId2v2; pseudo: string; isBot: boolean; team: 0 | 1; handCount: number; declaredCombo: Combination | null; playedThisRound: Card[] }[]
  you: {
    hand: Card[]
    pendingCombo: Combination | null
    declaredCombo: Combination | null
    lostComboRight: boolean
    playedThisRound: Card[]
  }
}

export type LobbyStatus = 'idle' | 'connecting' | 'lobby' | 'playing' | 'disconnected'

export interface Lobby2v2Snapshot {
  status: LobbyStatus
  code: string | null
  mySessionId: string | null
  slots: LobbySlotView[]
  game: Server2v2GameState | null
  gameOver: { aborted: boolean; winnerTeam?: number | null; winnerPseudo?: string | null; scores?: [number, number] } | null
  error: string | null
}

// ── Store singleton ─────────────────────────────────────────────────────────────

const AUTO_CONTINUE_MS = 3000

let snapshot: Lobby2v2Snapshot = {
  status: 'idle',
  code: null,
  mySessionId: null,
  slots: [],
  game: null,
  gameOver: null,
  error: null,
}

const listeners = new Set<() => void>()
let room: Room | null = null
let continueTimer: ReturnType<typeof setTimeout> | null = null

function set(patch: Partial<Lobby2v2Snapshot>): void {
  snapshot = { ...snapshot, ...patch }
  for (const l of listeners) l()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export function getSnapshot(): Lobby2v2Snapshot {
  return snapshot
}

function clearContinueTimer(): void {
  if (continueTimer) { clearTimeout(continueTimer); continueTimer = null }
}

type LobbyStateLike = {
  code?: string
  phase?: string
  slots?: { forEach: (cb: (slot: Record<string, unknown>, key: string) => void) => void }
}

function readSlots(state: LobbyStateLike): LobbySlotView[] {
  const out: LobbySlotView[] = []
  state.slots?.forEach((slot, key) => {
    out.push({
      key,
      pseudo: String(slot.pseudo ?? ''),
      team: Number(slot.team ?? -1),
      isAdmin: Boolean(slot.isAdmin),
      isBot: Boolean(slot.isBot),
      connected: Boolean(slot.connected),
      seat: Number(slot.seat ?? -1),
    })
  })
  return out
}

function wireRoom(r: Room): void {
  room = r

  r.onStateChange((state: LobbyStateLike) => {
    set({
      code: state.code ?? snapshot.code,
      slots: readSlots(state),
      // La phase 'PLAYING' est confirmée par le 1er game_state ; ici on ne touche
      // pas au status si on est déjà en jeu.
    })
  })

  r.onMessage('game_start', () => { /* le game_state suivant fera passer en 'playing' */ })

  r.onMessage('game_state', (payload: Server2v2GameState) => {
    set({ game: payload, status: 'playing' })
  })

  r.onMessage('deal_end', () => {
    clearContinueTimer()
    continueTimer = setTimeout(() => send('continue_deal'), AUTO_CONTINUE_MS)
  })

  r.onMessage('game_over', (payload: Lobby2v2Snapshot['gameOver']) => {
    set({ gameOver: payload })
    if (payload?.aborted) set({ status: 'disconnected', error: 'Partie annulée.' })
  })

  r.onMessage('error', (p: { message: string }) => set({ error: p.message }))

  r.onLeave(() => {
    clearContinueTimer()
    if (snapshot.game?.phase !== 'GAME_OVER') set({ status: 'disconnected' })
    room = null
  })
  r.onError((_code, message) => set({ status: 'disconnected', error: message ?? 'Erreur serveur.' }))
}

async function connect(factory: () => Promise<Room>): Promise<void> {
  reset()
  set({ status: 'connecting', error: null })
  try {
    const r = await factory()
    wireRoom(r)
    set({ status: 'lobby', mySessionId: r.sessionId, code: (r.state as LobbyStateLike)?.code ?? null })
  } catch (e) {
    set({ status: 'disconnected', error: (e as Error).message || 'Connexion impossible.' })
  }
}

// ── Actions ─────────────────────────────────────────────────────────────────────

export function connectLobby(pseudo: string, code?: string): Promise<void> {
  return connect(() => (code ? joinByCode(pseudo, code) : createLobby2v2(pseudo)))
}
export function chooseTeam(team: 0 | 1): void {
  room?.send('choose_team', { team })
}
export function startGame(): void {
  room?.send('start_game')
}
export function send(type: string, payload?: unknown): void {
  room?.send(type, payload)
}
export function leave(): void {
  clearContinueTimer()
  room?.leave()
  room = null
  reset()
}
export function reset(): void {
  set({
    status: 'idle', code: null, mySessionId: null, slots: [], game: null, gameOver: null, error: null,
  })
}

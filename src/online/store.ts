import type { Room } from 'colyseus.js'
import type { Card, Combination, GameEvent, PlayerId, Value } from '../engine/types'
import { joinOrCreate, createPrivate, joinByCode, getClient } from './client'
import { setActiveRoom, clearActiveRoom } from '../profile/profile'

// ── Types des messages serveur ─────────────────────────────────────────────────

export interface ServerGameState {
  seat: PlayerId
  code: string
  phase: 'WAITING' | 'PLAYING' | 'DEAL_END' | 'GAME_OVER' | 'ABORTED'
  currentSeat: PlayerId
  dealer: PlayerId
  deckCount: number
  dealNumber: number
  roundNumber: number
  isMabqach: boolean
  table: Card[]
  lastPlayed: [Card | null, Card | null]
  lastCapture: { playerId: PlayerId; card: Card } | null
  lastEvents: GameEvent[]
  eventSeq: number
  you: {
    hand: Card[]
    capturedCount: number
    score: number
    pendingCombo: Combination | null
    declaredCombo: Combination | null
    lostComboRight: boolean
    playedThisRound: Card[]
  }
  opponent: {
    pseudo: string
    handCount: number
    capturedCount: number
    score: number
    declaredCombo: Combination | null
    lostComboRight: boolean
  }
}

export interface GameOverPayload {
  aborted: boolean
  winnerSeat?: PlayerId | null
  winnerPseudo?: string | null
  scores?: [number, number]
  reason?: string
}

export interface DealEndPayload {
  scores: [number, number]
  captured: [number, number]
  dealNumber: number
}

export type ConnectionStatus = 'idle' | 'connecting' | 'waiting' | 'playing' | 'disconnected'

export interface OnlineSnapshot {
  status: ConnectionStatus
  roomCode: string | null
  mySeat: PlayerId | null
  server: ServerGameState | null
  opponentDisconnected: boolean
  gameOver: GameOverPayload | null
  dealEnd: DealEndPayload | null
  error: string | null
}

// ── Store singleton ─────────────────────────────────────────────────────────────

const AUTO_CONTINUE_MS = 3000

let snapshot: OnlineSnapshot = {
  status: 'idle',
  roomCode: null,
  mySeat: null,
  server: null,
  opponentDisconnected: false,
  gameOver: null,
  dealEnd: null,
  error: null,
}

const listeners = new Set<() => void>()
let room: Room | null = null
let continueTimer: ReturnType<typeof setTimeout> | null = null

function set(patch: Partial<OnlineSnapshot>): void {
  snapshot = { ...snapshot, ...patch }
  for (const l of listeners) l()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot(): OnlineSnapshot {
  return snapshot
}

function clearContinueTimer(): void {
  if (continueTimer) {
    clearTimeout(continueTimer)
    continueTimer = null
  }
}

function wireRoom(r: Room): void {
  room = r

  // Le code de partie vient du schéma Colyseus (RondaRoom.state.code), qui se
  // synchronise APRÈS le join. On le lit donc ici, et non au moment de connect()
  // (où r.state.code est encore vide). En partie privée, aucun game_state n'arrive
  // tant que l'adversaire n'a pas rejoint → c'est la seule source du code.
  r.onStateChange((state: { code?: string }) => {
    if (state?.code && state.code !== snapshot.roomCode) {
      set({ roomCode: state.code })
    }
  })

  r.onMessage('game_state', (payload: ServerGameState) => {
    const patch: Partial<OnlineSnapshot> = {
      server: payload,
      mySeat: payload.seat,
      roomCode: payload.code,
    }
    if (payload.phase === 'PLAYING') {
      patch.status = 'playing'
      patch.dealEnd = null
      // Partie en cours → mémorise pour reconnexion après sortie accidentelle.
      setActiveRoom({
        roomId: r.roomId,
        roomType: 'ronda',
        code: payload.code,
        reconnectionToken: r.reconnectionToken,
      })
    } else if (payload.phase === 'GAME_OVER') {
      patch.status = 'playing' // GameScreen affiche l'écran fin de partie depuis phase
      clearActiveRoom() // fin normale → plus rien à reprendre
    }
    set(patch)
  })

  r.onMessage('deal_end', (payload: DealEndPayload) => {
    set({ dealEnd: payload })
    // Auto-confirmation après 3 s (le serveur attend le « OK » des deux joueurs).
    clearContinueTimer()
    continueTimer = setTimeout(() => send('continue_deal'), AUTO_CONTINUE_MS)
  })

  r.onMessage('game_over', (payload: GameOverPayload) => {
    clearActiveRoom()
    set({ gameOver: payload })
    if (payload.aborted) set({ status: 'disconnected', error: 'Partie annulée (adversaire absent).' })
  })

  r.onMessage('opponent_disconnected', () => set({ opponentDisconnected: true }))
  r.onMessage('opponent_reconnected', () => set({ opponentDisconnected: false }))
  r.onMessage('error', (p: { message: string }) => set({ error: p.message }))

  r.onLeave(() => {
    clearContinueTimer()
    // Si la partie n'est pas finie, on signale la déconnexion.
    if (snapshot.status !== 'playing' || (snapshot.server?.phase !== 'GAME_OVER')) {
      set({ status: 'disconnected' })
    }
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
    // En attente du 2e joueur jusqu'au 1er game_state en phase PLAYING.
    set({ status: 'waiting', roomCode: (r.state as { code?: string })?.code ?? null })
  } catch (e) {
    set({ status: 'disconnected', error: (e as Error).message || 'Connexion impossible.' })
  }
}

// ── Actions exposées ─────────────────────────────────────────────────────────

export function connectQuick(pseudo: string): Promise<void> {
  return connect(() => joinOrCreate(pseudo))
}
export function connectCreate(pseudo: string): Promise<void> {
  return connect(() => createPrivate(pseudo))
}
export function connectByCode(pseudo: string, code: string): Promise<void> {
  return connect(() => joinByCode(pseudo, code))
}

/** Reconnexion à une partie en cours via le jeton Colyseus (room.reconnectionToken). */
export async function reconnect(reconnectionToken: string): Promise<void> {
  reset()
  set({ status: 'connecting', error: null })
  try {
    const r = await getClient().reconnect(reconnectionToken)
    wireRoom(r)
    set({ status: 'waiting', roomCode: (r.state as { code?: string })?.code ?? null })
  } catch (e) {
    set({ status: 'disconnected', error: (e as Error).message || 'Reconnexion impossible.' })
    throw e
  }
}

export function send(type: string, payload?: unknown): void {
  room?.send(type, payload)
}

export function leave(): void {
  clearContinueTimer()
  clearActiveRoom() // départ volontaire → pas de reprise (l'adversaire gagne côté serveur)
  room?.leave()
  room = null
  reset()
}

/** Réinitialise le snapshot (sans toucher aux listeners). */
export function reset(): void {
  set({
    status: 'idle',
    roomCode: null,
    mySeat: null,
    server: null,
    opponentDisconnected: false,
    gameOver: null,
    dealEnd: null,
    error: null,
  })
}

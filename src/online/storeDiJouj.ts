import type { Room } from 'colyseus.js'
import type { Suit, Value, PendingEffect } from '../engine-dijouj/types'
import { joinDiJoujQuick, createDiJoujPrivate, joinByCode } from './client'
import { addGold } from '../profile/profile'

// ── Types des messages serveur ────────────────────────────────────────────────

export interface DjServerCard {
  suit:  string
  value: number
}

export interface DjOpponent {
  pseudo:    string
  handCount: number
  seat:      number
  connected: boolean
  isBot:     boolean
}

export interface DjServerState {
  seat:          number
  phase:         'WAITING' | 'PLAYING' | 'GAME_OVER' | 'ABORTED'
  currentPlayer: number
  deckCount:     number
  topCard:       DjServerCard | null
  chosenSuit:    Suit | null
  pendingEffect: PendingEffect
  you:           { hand: DjServerCard[] }
  opponents:     DjOpponent[]
  isOver:        boolean
  winnerId:      number | null
}

export interface DjGameOverPayload {
  aborted:       boolean
  winnerSeat?:   number | null
  winnerPseudo?: string | null
  goldWon?:      number
  reason?:       string
}

export type ConnectionStatus = 'idle' | 'connecting' | 'waiting' | 'playing' | 'disconnected'

export interface ChatMessage {
  id: number
  username: string
  text: string
}

export interface DjSnapshot {
  status:               ConnectionStatus
  roomCode:             string | null
  mySeat:               number | null
  bet:                  number
  server:               DjServerState | null
  opponentDisconnected: boolean
  gameOver:             DjGameOverPayload | null
  error:                string | null
  chatMessages:         ChatMessage[]
  autoSkip:             { playerId: number; pseudo: string } | null
}

// ── Store singleton ────────────────────────────────────────────────────────────

let djChatCounter = 0

let snapshot: DjSnapshot = {
  status:               'idle',
  roomCode:             null,
  mySeat:               null,
  bet:                  0,
  server:               null,
  opponentDisconnected: false,
  gameOver:             null,
  error:                null,
  chatMessages:         [],
  autoSkip:             null,
}

const listeners = new Set<() => void>()
let room: Room | null = null

function set(patch: Partial<DjSnapshot>): void {
  snapshot = { ...snapshot, ...patch }
  for (const l of listeners) l()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot(): DjSnapshot {
  return snapshot
}

function wireRoom(r: Room): void {
  room = r

  r.onStateChange((state: { code?: string }) => {
    if (state?.code && state.code !== snapshot.roomCode) {
      set({ roomCode: state.code })
    }
  })

  r.onMessage('game_state', (payload: DjServerState) => {
    const patch: Partial<DjSnapshot> = {
      server: payload,
      mySeat: payload.seat,
    }
    if (payload.phase === 'PLAYING' || payload.phase === 'GAME_OVER') {
      patch.status = 'playing'
    }
    // Check if any opponent is disconnected
    const anyDisconnected = payload.opponents.some(o => !o.connected && !o.isBot)
    patch.opponentDisconnected = anyDisconnected
    set(patch)
  })

  r.onMessage('game_over', (payload: DjGameOverPayload) => {
    set({ gameOver: payload })
    if (payload.aborted) {
      set({ status: 'disconnected', error: 'Partie annulée (adversaire absent).' })
    }
    // Créditer l'or gagné si le joueur local a gagné
    if (!payload.aborted && payload.goldWon && payload.goldWon > 0) {
      const mySeat = snapshot.mySeat
      if (mySeat !== null && payload.winnerSeat === mySeat) {
        addGold(payload.goldWon)
      }
    }
  })

  r.onMessage('opponent_disconnected', () => set({ opponentDisconnected: true }))
  r.onMessage('opponent_reconnected',  () => set({ opponentDisconnected: false }))
  r.onMessage('error', (p: { message: string }) => set({ error: p.message }))
  r.onMessage('chat', (p: { username: string; text: string }) => {
    set({ chatMessages: [...snapshot.chatMessages, { id: djChatCounter++, username: p.username, text: p.text }] })
  })
  r.onMessage('auto_skip', (p: { playerId: number; pseudo: string }) => {
    set({ autoSkip: p })
    setTimeout(() => set({ autoSkip: null }), 1500)
  })

  r.onLeave(() => {
    if (snapshot.status !== 'playing' || snapshot.server?.phase !== 'GAME_OVER') {
      set({ status: 'disconnected' })
    }
    room = null
  })

  r.onError((_code, message) =>
    set({ status: 'disconnected', error: message ?? 'Erreur serveur.' }),
  )
}

async function connect(factory: () => Promise<Room>): Promise<void> {
  reset()
  set({ status: 'connecting', error: null })
  try {
    const r = await factory()
    wireRoom(r)
    set({ status: 'waiting', roomCode: (r.state as { code?: string })?.code ?? null })
  } catch (e) {
    set({ status: 'disconnected', error: (e as Error).message || 'Connexion impossible.' })
  }
}

// ── Actions exposées ──────────────────────────────────────────────────────────

export function connectDiJoujQuick(pseudo: string, bet = 0): Promise<void> {
  set({ bet })
  return connect(() => joinDiJoujQuick(pseudo, bet))
}

export function connectDiJoujPrivate(pseudo: string): Promise<void> {
  return connect(() => createDiJoujPrivate(pseudo))
}
/** Crée une room privée Di Jouj pour une partie entre amis (hôte). */
export function connectDiJoujFriendHost(pseudo: string, bet = 0): Promise<void> {
  set({ bet })
  return connect(() => createDiJoujPrivate(pseudo))
}
/** Rejoint une room Di Jouj privée par code (invité). */
export function connectDiJoujFriendGuest(pseudo: string, code: string, bet = 0): Promise<void> {
  set({ bet })
  return connect(() => joinByCode(pseudo, code))
}

/** Transfert d'une room déjà connectée (depuis le lobby). */
export function attachRoom(r: Room): void {
  reset()
  wireRoom(r)
  set({
    status:   'playing',
    roomCode: (r.state as { code?: string })?.code ?? null,
    error:    null,
  })
}

export function send(type: string, payload?: unknown): void {
  room?.send(type, payload)
}

export function leave(): void {
  room?.leave()
  room = null
  reset()
}

export function reset(): void {
  set({
    status:               'idle',
    roomCode:             null,
    mySeat:               null,
    bet:                  0,
    server:               null,
    opponentDisconnected: false,
    gameOver:             null,
    error:                null,
    chatMessages:         [],
    autoSkip:             null,
  })
}

export function sendChat(text: string): void {
  try {
    send('chat', { text })
  } catch (e) {
    console.error('[chat] send error:', e)
  }
}

export type { Suit, Value }

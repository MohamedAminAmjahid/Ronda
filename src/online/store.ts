import type { Room } from 'colyseus.js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getAuth } from 'firebase/auth'
import { firebaseApp } from '../firebase/config'
import type { Card, Combination, GameEvent, PlayerId, Value } from '../engine/types'
import {
  joinOrCreate, createPrivate, joinByCode, joinTournamentMatch, getClient,
  reportMatchWin, TOURNAMENT_ADVANCE_KEY,
} from './client'
import { invalidateLeaderboard } from './leaderboardCache'
import { setActiveRoom, clearActiveRoom, addGold } from '../profile/profile'

/** Contexte transmis par TournamentScreen.tsx (via OnlineScreen) quand la
 * partie qu'on rejoint est un match de bracket, pas une invitation classique. */
export interface TournamentContext {
  matchId: string
  opponentUid: string
  isFinal: boolean
}

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
  goldWon?: number
  scores?: [number, number]
  reason?: string
}

export interface DealEndPayload {
  scores: [number, number]
  captured: [number, number]
  dealNumber: number
}

export type ConnectionStatus = 'idle' | 'connecting' | 'waiting' | 'playing' | 'disconnected'

export interface ChatMessage {
  id: number
  username: string
  text: string
}

export interface OnlineSnapshot {
  status: ConnectionStatus
  roomCode: string | null
  mySeat: PlayerId | null
  bet: number
  server: ServerGameState | null
  opponentDisconnected: boolean
  gameOver: GameOverPayload | null
  dealEnd: DealEndPayload | null
  error: string | null
  chatMessages: ChatMessage[]
  /** Présent uniquement pour un match issu du bracket d'un tournoi. */
  tournament: TournamentContext | null
}

// ── Store singleton ─────────────────────────────────────────────────────────────

const AUTO_CONTINUE_MS = 3000

let chatCounter = 0

let snapshot: OnlineSnapshot = {
  status: 'idle',
  roomCode: null,
  mySeat: null,
  bet: 0,
  server: null,
  opponentDisconnected: false,
  gameOver: null,
  dealEnd: null,
  error: null,
  chatMessages: [],
  tournament: null,
}

const listeners = new Set<() => void>()
const voiceListeners = new Set<(data: unknown) => void>()  // signaux WebRTC (chat vocal)
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
    if (payload.aborted) {
      set({ status: 'disconnected', error: 'Partie annulée (adversaire absent).' })
    } else {
      if (payload.goldWon && payload.goldWon > 0) {
        const mySeat = snapshot.mySeat
        if (mySeat !== null && payload.winnerSeat === mySeat) {
          addGold(payload.goldWon)
        }
      }
      // Partie en ligne (vraie Room, addWageredGold déjà appelé côté serveur)
      // qui se conclut avec une mise, gagnée ou perdue : le classement hebdo
      // a changé dans les deux cas (le gagnant, moi ou l'adversaire, vient d'y
      // être crédité) → invalide pour forcer un refetch au prochain affichage.
      if (snapshot.bet > 0) invalidateLeaderboard()

      // Match de tournoi : rapporte le résultat vu de mon côté (double-
      // confirmation côté serveur — l'autre joueur fait le même appel du
      // sien ; le bracket n'avance que si les deux concordent).
      const tournament = snapshot.tournament
      if (tournament && payload.winnerSeat != null) {
        const myUid = getAuth(firebaseApp).currentUser?.uid ?? null
        const mySeat = snapshot.mySeat
        if (myUid && mySeat !== null) {
          const iWon = payload.winnerSeat === mySeat
          const winnerUid = iWon ? myUid : tournament.opponentUid
          const loserUid = iWon ? tournament.opponentUid : myUid
          void reportMatchWin(tournament.matchId, winnerUid, loserUid).catch((e) => {
            console.error('[tournament] reportMatchWin:', e)
          })
          // Notif « tu avances / tu es champion » affichée par TournamentScreen
          // au prochain focus — lu puis effacé là-bas (voir TOURNAMENT_ADVANCE_KEY).
          if (iWon) {
            void AsyncStorage.setItem(TOURNAMENT_ADVANCE_KEY, JSON.stringify({
              matchId: tournament.matchId, isFinal: tournament.isFinal, goldWon: payload.goldWon ?? 0,
            })).catch(() => {})
          }
        }
      }
    }
  })

  r.onMessage('opponent_disconnected', () => set({ opponentDisconnected: true }))
  r.onMessage('opponent_reconnected', () => set({ opponentDisconnected: false }))
  r.onMessage('error', (p: { message: string }) => set({ error: p.message }))
  r.onMessage('chat', (p: { username: string; text: string }) => {
    set({ chatMessages: [...snapshot.chatMessages, { id: chatCounter++, username: p.username, text: p.text }] })
  })
  // Signalisation WebRTC (chat vocal) relayée par le serveur → abonnés locaux.
  r.onMessage('voice_signal', (data: unknown) => { for (const l of voiceListeners) l(data) })

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

async function connect(
  factory: () => Promise<Room>, bet = 0, label = 'quick', tournament: TournamentContext | null = null,
): Promise<void> {
  reset()
  // bet (et tournament) sont passés APRÈS reset() (qui les remet à 0/null)
  // pour survivre pendant le matchmaking → bet remboursable si on annule
  // avant le début, tournament nécessaire pour reportMatchWin à la fin.
  set({ status: 'connecting', error: null, bet, tournament })
  try {
    const r = await factory()
    console.log('[matchmaking] mode:', label, 'roomId:', r.roomId)
    wireRoom(r)
    // En attente du 2e joueur jusqu'au 1er game_state en phase PLAYING.
    set({ status: 'waiting', roomCode: (r.state as { code?: string })?.code ?? null })
  } catch (e) {
    // Échec de connexion : la partie n'a jamais commencé → rembourser la mise.
    if (bet > 0) addGold(bet)
    set({ status: 'disconnected', error: (e as Error).message || 'Connexion impossible.', bet: 0 })
  }
}

// ── Actions exposées ─────────────────────────────────────────────────────────

export function connectQuick(pseudo: string, bet = 0): Promise<void> {
  return connect(() => joinOrCreate(pseudo, bet), bet, 'quick')
}
export function connectCreate(pseudo: string): Promise<void> {
  return connect(() => createPrivate(pseudo), 0, 'friend-host')
}
export function connectByCode(pseudo: string, code: string): Promise<void> {
  return connect(() => joinByCode(pseudo, code), 0, 'friend-guest')
}
/** Crée une room privée Ronda pour une partie entre amis (hôte). */
export function connectFriendHost(pseudo: string, bet = 0): Promise<void> {
  return connect(() => createPrivate(pseudo), bet, 'friend-host')
}
/** Rejoint une room privée Ronda par code (invité). */
export function connectFriendGuest(pseudo: string, code: string, bet = 0): Promise<void> {
  return connect(() => joinByCode(pseudo, code), bet, 'friend-guest')
}
/**
 * Rejoint (ou crée) un match de tournoi : voir joinTournamentMatch pour le
 * détail de l'appariement automatique par tournamentMatchId côté serveur.
 */
export function connectTournamentMatch(
  pseudo: string, matchId: string, opponentUid: string, isFinal: boolean, uid?: string,
): Promise<void> {
  return connect(
    () => joinTournamentMatch(pseudo, matchId, uid), 0, 'tournament',
    { matchId, opponentUid, isFinal },
  )
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

// ── Chat vocal (signalisation WebRTC via Colyseus) ──────────────────────────────
export function sendVoiceSignal(data: unknown): void { room?.send('voice_signal', data) }
export function subscribeVoiceSignal(cb: (data: unknown) => void): () => void {
  voiceListeners.add(cb)
  return () => { voiceListeners.delete(cb) }
}
/** Transport de signalisation stable à passer au VoiceButton. */
export const voiceTransport = { send: sendVoiceSignal, subscribe: subscribeVoiceSignal }

export function leave(refundBet = true): void {
  clearContinueTimer()
  clearActiveRoom() // départ volontaire → pas de reprise (l'adversaire gagne côté serveur)
  // Remboursement : on quitte le matchmaking AVANT le début de la partie → rendre la mise.
  // refundBet=false quand on bascule sur un bot : la mise suit dans la partie bot.
  if (refundBet && (snapshot.status === 'waiting' || snapshot.status === 'connecting') && snapshot.bet > 0) {
    addGold(snapshot.bet)
  }
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
    bet: 0,
    server: null,
    opponentDisconnected: false,
    gameOver: null,
    dealEnd: null,
    error: null,
    chatMessages: [],
    tournament: null,
  })
}

export function sendChat(text: string): void {
  try {
    send('chat', { text })
  } catch (e) {
    console.error('[chat] send error:', e)
  }
}

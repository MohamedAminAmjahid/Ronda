import { useState, useSyncExternalStore, useCallback } from 'react'
import type { Card, Combination, GameState, PlayerId, PlayerState, Value } from '../engine/types'
import type { GameView } from '../game/useRondaGame'
import {
  subscribe,
  getSnapshot,
  connectQuick,
  connectCreate,
  connectByCode,
  sendChat,
  send,
  leave,
  type ServerGameState,
  type ConnectionStatus,
  type ChatMessage,
} from './store'

const PLACEHOLDER: Card = { value: 1, suit: 'oros' }
const fill = (n: number): Card[] => Array.from({ length: Math.max(0, n) }, () => PLACEHOLDER)

function emptyPlayer(): PlayerState {
  return {
    hand: [],
    captured: [],
    score: 0,
    pendingCombo: null,
    declaredCombo: null,
    lostComboRight: false,
    playedThisRound: [],
  }
}

function emptyState(): GameState {
  return {
    deck: [],
    table: [],
    players: [emptyPlayer(), emptyPlayer()],
    currentPlayer: 0,
    dealer: 0,
    phase: 'PLAYING',
    roundNumber: 0,
    dealNumber: 0,
    isMabqach: false,
    lastCapture: null,
    caidaChain: null,
    pendingCaidaCard: null,
    lastPlayed: [null, null],
    lastEvents: [],
    eventSeq: 0,
  }
}

/**
 * Reconstruit un GameState « toi = joueur 0 » depuis l'état serveur, afin de
 * réutiliser GameScreen tel quel (qui traite HUMAN_ID = 0 comme l'utilisateur).
 * La main de l'adversaire est masquée (cartes fictives, seul le nombre compte).
 */
function buildGameState(s: ServerGameState): GameState {
  const mine = s.seat
  const opp = (1 - mine) as PlayerId

  const you: PlayerState = {
    hand: s.you.hand,
    captured: fill(s.you.capturedCount),
    score: s.you.score,
    pendingCombo: s.you.pendingCombo,
    declaredCombo: s.you.declaredCombo,
    lostComboRight: s.you.lostComboRight,
    playedThisRound: s.you.playedThisRound,
  }
  const other: PlayerState = {
    hand: fill(s.opponent.handCount),
    captured: fill(s.opponent.capturedCount),
    score: s.opponent.score,
    pendingCombo: null,
    declaredCombo: s.opponent.declaredCombo,
    lostComboRight: s.opponent.lostComboRight,
    playedThisRound: [],
  }

  const phase: GameState['phase'] =
    s.phase === 'GAME_OVER' ? 'GAME_OVER' : s.phase === 'DEAL_END' ? 'DEAL_END' : 'PLAYING'

  return {
    deck: fill(s.deckCount),
    table: s.table,
    players: [you, other],
    currentPlayer: s.currentSeat === mine ? 0 : 1,
    dealer: s.dealer === mine ? 0 : 1,
    phase,
    roundNumber: s.roundNumber,
    dealNumber: s.dealNumber,
    isMabqach: s.isMabqach,
    lastCapture: s.lastCapture
      ? { playerId: (s.lastCapture.playerId === mine ? 0 : 1) as PlayerId, card: s.lastCapture.card }
      : null,
    caidaChain: null,
    pendingCaidaCard: null,
    lastPlayed: [s.lastPlayed[mine], s.lastPlayed[opp]],
    lastEvents: s.lastEvents ?? [],
    eventSeq: s.eventSeq ?? 0,
  }
}

export interface OnlineExtras {
  connectionStatus: ConnectionStatus
  roomCode: string | null
  opponentDisconnected: boolean
  error: string | null
  connectQuick: (pseudo: string) => Promise<void>
  connectCreate: (pseudo: string) => Promise<void>
  connectByCode: (pseudo: string, code: string) => Promise<void>
}

/**
 * Hook miroir de useRondaGame, connecté au serveur. Retourne la MÊME interface
 * (appPhase, view, callbacks…) pour que GameScreen le consomme à l'identique,
 * plus des champs « online » (statut de connexion, code, overlay déconnexion).
 */
export function useOnlineGame() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [isCaptureAnimating, setCaptureAnimating] = useState(false)

  const gs = snap.server ? buildGameState(snap.server) : emptyState()
  const isHumanTurn = gs.currentPlayer === 0 && gs.phase === 'PLAYING'
  const me = gs.players[0]

  const view: GameView = {
    state: gs,
    humanId: 0,
    botId: 1,
    isHumanTurn,
    canDeclare:
      me.pendingCombo !== null && me.declaredCombo === null && !me.lostComboRight,
    canContest: false, // contre en ligne : v2 (le serveur valide déjà côté moteur)
    contestValue: null,
    isGameOver: gs.phase === 'GAME_OVER',
    isDealEnd: gs.phase === 'DEAL_END',
    isBotThinking: false,
    isCaptureAnimating,
    lastEvent: gs.lastEvents.length > 0 ? { events: gs.lastEvents, id: gs.eventSeq } : null,
  }

  // Callbacks — envoient au serveur (jamais de dispatch local autoritaire).
  const playCard = useCallback((card: Card) => send('play_card', { card }), [])
  const declare = useCallback((combination: Combination) => send('declare', { combination }), [])
  const contest = useCallback((accusedValue: Value) => send('contest', { accusedValue }), [])
  const nextDeal = useCallback(() => send('continue_deal'), [])
  const startGame = useCallback((_firstDealer: PlayerId) => {}, []) // pas de rituel en ligne
  const newGame = useCallback(() => leave(), [])

  return {
    appPhase: 'IN_GAME' as const,
    view,
    setCaptureAnimating,
    startGame,
    nextDeal,
    playCard,
    declare,
    contest,
    newGame,
    // ── Extras online ──
    connectionStatus: snap.status,
    roomCode: snap.roomCode,
    opponentName: snap.server?.opponent.pseudo ?? null,
    opponentDisconnected: snap.opponentDisconnected,
    error: snap.error,
    chatMessages: snap.chatMessages as ChatMessage[],
    sendChatMsg: sendChat,
    connectQuick,
    connectCreate,
    connectByCode,
  }
}

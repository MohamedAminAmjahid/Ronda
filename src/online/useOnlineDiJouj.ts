import { useSyncExternalStore, useCallback } from 'react'
import { usePlayOnlineQuest } from '../quests/useQuests'
import type { GameState, Card, Suit, Value, PendingEffect } from '../engine-dijouj/types'
import {
  subscribe,
  getSnapshot,
  connectDiJoujQuick,
  connectDiJoujPrivate,
  sendChat,
  send,
  leave,
  type DjServerState,
  type DjOpponent,
  type ConnectionStatus,
  type DjGameOverPayload,
  type ChatMessage,
} from './storeDiJouj'

// ── Reconstruction du GameState depuis l'état serveur ────────────────────────

const PLACEHOLDER: Card = { suit: 'oros', value: 1 }

function buildDjState(s: DjServerState): GameState {
  const mySeat = s.seat
  const pc     = 1 + s.opponents.length  // total players

  const myHand: Card[] = s.you.hand.map(c => ({
    suit:  c.suit as Suit,
    value: c.value as Value,
  }))

  // Build players array rotated so "me = index 0"
  // Server seat order: 0..pc-1. My seat is mySeat.
  // Rotated index for server seat s: (s - mySeat + pc) % pc
  const players = new Array(pc)
  players[0] = { id: 0, hand: myHand }

  for (const opp of s.opponents) {
    const rotated = (opp.seat - mySeat + pc) % pc
    players[rotated] = {
      id:   rotated,
      hand: Array.from({ length: Math.max(0, opp.handCount) }, () => PLACEHOLDER),
    }
  }

  const topCard: Card | null = s.topCard
    ? { suit: s.topCard.suit as Suit, value: s.topCard.value as Value }
    : null

  const drawPile: Card[] = Array.from(
    { length: Math.max(0, s.deckCount) },
    () => PLACEHOLDER,
  )

  const currentPlayerId = (s.currentPlayer - mySeat + pc) % pc

  const winnerId: number | null =
    s.winnerId === null ? null : (s.winnerId - mySeat + pc) % pc

  return {
    players,
    drawPile,
    discardPile:     topCard ? [topCard] : [],
    currentPlayerId,
    chosenSuit:      s.chosenSuit,
    pendingEffect:   s.pendingEffect as PendingEffect,
    isOver:          s.isOver,
    winnerId,
  }
}

function makeEmptyState(pc: number): GameState {
  return {
    players:         Array.from({ length: pc }, (_, i) => ({ id: i, hand: [] })),
    drawPile:        [],
    discardPile:     [],
    currentPlayerId: 0,
    chosenSuit:      null,
    pendingEffect:   null,
    isOver:          false,
    winnerId:        null,
  }
}

const EMPTY_DJ_STATE: GameState = makeEmptyState(2)

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface OnlineDjExtras {
  connectionStatus:     ConnectionStatus
  roomCode:             string | null
  opponents:            DjOpponent[]
  opponentDisconnected: boolean
  gameOver:             DjGameOverPayload | null
  error:                string | null
  connectQuick:         (pseudo: string) => Promise<void>
  connectPrivate:       (pseudo: string) => Promise<void>
}

export function useOnlineDiJouj() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  usePlayOnlineQuest(snap.status === 'playing')

  const srv    = snap.server
  const mySeat = snap.mySeat ?? 0

  const state: GameState = srv ? buildDjState(srv) : EMPTY_DJ_STATE

  const isHumanTurn = !state.isOver && state.currentPlayerId === 0 && snap.status === 'playing'

  const playCard = useCallback((card: Card, chosenSuit?: Suit) => {
    send('play_card', { card, chosenSuit })
  }, [])

  const draw = useCallback(() => {
    send('draw_card')
  }, [])

  const restart = useCallback(() => {
    leave()
  }, [])

  // Rotated opponents (exclude self, order by rotated index)
  const opponents: DjOpponent[] = srv
    ? srv.opponents.map(o => ({
        ...o,
        // Keep server seat for reference; UI uses rotated positions
      }))
    : []

  // Primary opponent (first in rotated order) for backward compat
  const primaryOpponent = opponents[0] ?? null

  return {
    state,
    isHumanTurn,
    isBotThinking: !state.isOver && state.currentPlayerId !== 0 && snap.status === 'playing',
    isAutoSkipping: false,
    isDrawPause:    false,
    isGameOver:     state.isOver,
    winner:         state.winnerId,
    mySeat,
    playCard,
    draw,
    restart,
    // ── Extras en ligne ──
    connectionStatus:     snap.status,
    roomCode:             snap.roomCode,
    isQuick:              snap.isQuick,
    bet:                  snap.bet,
    opponents,
    opponentPseudo:       primaryOpponent?.pseudo ?? null,
    opponentDisconnected: snap.opponentDisconnected,
    gameOver:             snap.gameOver,
    error:                snap.error,
    chatMessages:         snap.chatMessages as ChatMessage[],
    sendChatMsg:          sendChat,
    autoSkip:             snap.autoSkip,
    playerForfeited:      snap.playerForfeited,
    connectQuick:         connectDiJoujQuick,
    connectPrivate:       connectDiJoujPrivate,
  }
}

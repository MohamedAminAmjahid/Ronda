import { useState, useEffect, useCallback, useRef } from 'react'
import type { GameState, Card, Suit } from '../engine-dijouj/types'
import { createInitialState } from '../engine-dijouj/deal'
import { applyPlayCard, applyDraw } from '../engine-dijouj/game'
import { botPlay } from '../ai-dijouj/bot'

export const DJ_HUMAN_ID = 0
export const DJ_BOT_ID   = 1

const BOT_DELAY_MS    = 1500
const AUTO_SKIP_MS    = 1100

export function useDiJoujGame() {
  const [state, setState] = useState<GameState>(() =>
    createInitialState(2, Math.random),
  )
  const [isBotThinking, setIsBotThinking] = useState(false)
  const [isDrawPause, setIsDrawPause]     = useState(false)
  const drawPauseTid = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Guard pour éviter que l'effet ne se déclenche deux fois sur le même tour bot
  const botActed = useRef(false)

  const isHumanTurn = !state.isOver && state.currentPlayerId === DJ_HUMAN_ID

  // ── Auto-skip : résolution automatique quand l'humain n'a pas de contre ──

  const isAutoSkipping = Boolean(
    isHumanTurn &&
    state.pendingEffect &&
    (state.pendingEffect.type === 'draw2'
      ? !state.players[DJ_HUMAN_ID].hand.some(c => c.value === 2)
      : !state.players[DJ_HUMAN_ID].hand.some(c => c.value === 1)),
  )

  useEffect(() => {
    if (!isAutoSkipping) return
    const tid = setTimeout(
      () => setState(s => applyDraw(s, DJ_HUMAN_ID)),
      AUTO_SKIP_MS,
    )
    return () => clearTimeout(tid)
  }, [isAutoSkipping])

  // ── Boucle bot ────────────────────────────────────────────────────────────

  useEffect(() => {
    // Réinitialise le verrou quand c'est le tour de l'humain
    if (state.isOver || state.currentPlayerId !== DJ_BOT_ID) {
      botActed.current = false
      return
    }
    if (botActed.current) return   // déjà lancé pour ce tour

    botActed.current = true
    setIsBotThinking(true)

    const tid = setTimeout(() => {
      setState(s => {
        if (s.currentPlayerId !== DJ_BOT_ID || s.isOver) return s

        const action = botPlay(s, DJ_BOT_ID)

        if (action.type === 'draw') {
          return applyDraw(s, DJ_BOT_ID)
        }

        return applyPlayCard(s, DJ_BOT_ID, action.card, action.chosenSuit)
      })
      setIsBotThinking(false)
    }, BOT_DELAY_MS)

    return () => {
      clearTimeout(tid)
      setIsBotThinking(false)
    }
  }, [state.currentPlayerId, state.isOver])

  // ── Callbacks humain ──────────────────────────────────────────────────────

  const playCard = useCallback(
    (card: Card, chosenSuit?: Suit) => {
      if (!isHumanTurn) return
      setState(s => applyPlayCard(s, DJ_HUMAN_ID, card, chosenSuit))
    },
    [isHumanTurn],
  )

  const draw = useCallback(() => {
    if (!isHumanTurn) return
    setState(s => applyDraw(s, DJ_HUMAN_ID))
    clearTimeout(drawPauseTid.current)
    setIsDrawPause(true)
    drawPauseTid.current = setTimeout(() => setIsDrawPause(false), 800)
  }, [isHumanTurn])

  const restart = useCallback(() => {
    botActed.current = false
    setIsBotThinking(false)
    clearTimeout(drawPauseTid.current)
    setIsDrawPause(false)
    setState(createInitialState(2, Math.random))
  }, [])

  return {
    state,
    isHumanTurn,
    isBotThinking,
    isAutoSkipping,
    isDrawPause,
    playCard,
    draw,
    isGameOver: state.isOver,
    winner:     state.winnerId,
    restart,
  }
}

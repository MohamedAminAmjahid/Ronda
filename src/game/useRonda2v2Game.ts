import { useReducer, useCallback, useEffect, useRef, useState } from 'react'
import {
  applyAction2v2,
  createInitialState2v2,
  startNewDeal2v2,
} from '../engine2v2/index2v2'
import type {
  Action2v2,
  GameState2v2,
  PlayerId2v2,
} from '../engine2v2/types2v2'
import { teamOf } from '../engine2v2/types2v2'
import type { Card, Combination, GameEvent, Value } from '../engine/types'
import type { Rng } from '../engine/deck'
import { getObservableState2v2 } from '../ai2v2/observable2v2'
import { chooseAction2v2 } from '../ai2v2/bot2v2'
import { createMemory2v2, updateMemory2v2 } from '../ai2v2/memory2v2'
import type { AiMemory2v2 } from '../ai2v2/memory2v2'

// ── Identités fixes ─────────────────────────────────────────────────────────

export const HUMAN_ID_2V2: PlayerId2v2 = 0
export const BOT_IDS_2V2: PlayerId2v2[] = [1, 2, 3]

// ── RNG dérivé d'un seed — reducer pur (cf. useRondaGame) ────────────────────

function makeLcg(initialSeed: number): { rng: Rng; getSeed: () => number } {
  let s = (initialSeed >>> 0) || 1
  return {
    rng() {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      return s / 0x100000000
    },
    getSeed: () => s,
  }
}

// ── Vue dérivée ──────────────────────────────────────────────────────────────

export interface GameView2v2 {
  state: GameState2v2
  humanId: PlayerId2v2
  /** C'est le tour de l'humain et la phase est PLAYING. */
  isHumanTurn: boolean
  /** Scores cumulés [équipe A, équipe B]. */
  teamScores: readonly [number, number]
  /** Nombre de cartes capturées [équipe A, équipe B]. */
  teamCapturedCount: readonly [number, number]
  /** L'humain peut déclarer sa combo (bouton Ronda / Tringa visible). */
  canDeclare: boolean
  /** Adversaires ayant révélé une paire contestable cette manche (vide si aucun). */
  contestTargets: readonly { player: PlayerId2v2; value: Value }[]
  isGameOver: boolean
  /** La donne est terminée, décompte effectué — afficher l'écran résultat. */
  isDealEnd: boolean
  /** Un bot est en train de « réfléchir » (délai avant son coup). */
  isBotThinking: boolean
  /** Une animation de capture est en cours — le jeu est gelé. */
  isCaptureAnimating: boolean
  /** Événements de la dernière action (id change à chaque occurrence). */
  lastEvent: { events: readonly GameEvent[]; id: number } | null
}

function toView(gs: GameState2v2): GameView2v2 {
  const isHumanTurn = gs.currentPlayer === HUMAN_ID_2V2 && gs.phase === 'PLAYING'
  const h = gs.players[HUMAN_ID_2V2]
  return {
    state: gs,
    humanId: HUMAN_ID_2V2,
    isHumanTurn,
    teamScores: [gs.teams[0].score, gs.teams[1].score],
    teamCapturedCount: [gs.teams[0].captured.length, gs.teams[1].captured.length],
    canDeclare:
      isHumanTurn &&
      h.pendingCombo !== null &&
      h.declaredCombo === null &&
      !h.lostComboRight,
    contestTargets: [], // surchargé au retour du hook (dépend de la mémoire)
    isGameOver: gs.phase === 'GAME_OVER',
    isDealEnd: gs.phase === 'DEAL_END',
    isBotThinking: false,      // surchargés au retour du hook (états transitoires)
    isCaptureAnimating: false,
    lastEvent:
      gs.lastEvents.length > 0
        ? { events: gs.lastEvents, id: gs.eventSeq }
        : null,
  }
}

// ── Reducer pur ──────────────────────────────────────────────────────────────

type RS = { gs: GameState2v2; seed: number }

type RA =
  | { kind: 'ACT'; action: Action2v2 }
  | { kind: 'NEW'; seed: number; firstDealer: PlayerId2v2 }
  | { kind: 'CONTINUE_DEAL' }

function reduce(s: RS, a: RA): RS {
  switch (a.kind) {
    case 'ACT': {
      const { rng, getSeed } = makeLcg(s.seed)
      const gs = applyAction2v2(s.gs, a.action, rng)
      return { gs, seed: getSeed() }
    }
    case 'NEW': {
      const { rng, getSeed } = makeLcg(a.seed)
      const gs = createInitialState2v2(rng, a.firstDealer)
      return { gs, seed: getSeed() }
    }
    case 'CONTINUE_DEAL': {
      const { rng, getSeed } = makeLcg(s.seed)
      const gs = startNewDeal2v2(
        {
          scores: [s.gs.teams[0].score, s.gs.teams[1].score],
          // Donneur tourne dans le sens du jeu (anti-horaire) : (dealer + 3) % 4.
          dealer: ((s.gs.dealer + 3) % 4) as PlayerId2v2,
          dealNumber: s.gs.dealNumber + 1,
        },
        rng,
      )
      return { gs, seed: getSeed() }
    }
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export type AppPhase2v2 = 'RITUAL_PICKER' | 'IN_GAME'

const freshMemories = (): [AiMemory2v2, AiMemory2v2, AiMemory2v2, AiMemory2v2] => [
  createMemory2v2(),
  createMemory2v2(),
  createMemory2v2(),
  createMemory2v2(),
]

export function useRonda2v2Game() {
  const [appPhase, setAppPhase] = useState<AppPhase2v2>('RITUAL_PICKER')

  const [s, dispatch] = useReducer(reduce, undefined, (): RS => {
    const { rng, getSeed } = makeLcg(1)
    return { gs: createInitialState2v2(rng, 0), seed: getSeed() }
  })

  const [isBotThinking, setIsBotThinking] = useState(false)
  const [isCaptureAnimating, setIsCaptureAnimating] = useState(false)

  // Une mémoire IA par joueur (index = PlayerId2v2). Tous voient chaque action.
  const memsRef = useRef<[AiMemory2v2, AiMemory2v2, AiMemory2v2, AiMemory2v2]>(freshMemories())

  /** Met à jour les 4 mémoires avec l'état courant + l'action observée. */
  const recordForAll = (
    gs: GameState2v2,
    played?: { byPlayer: PlayerId2v2; card: Card },
    contest?: { byPlayer: PlayerId2v2; value: Value },
  ) => {
    for (const p of [0, 1, 2, 3] as PlayerId2v2[]) {
      memsRef.current[p] = updateMemory2v2(
        memsRef.current[p],
        getObservableState2v2(gs, p),
        played,
        contest && contest.byPlayer === p ? contest.value : undefined,
      )
    }
  }

  // ── Boucle bots (joueurs 1, 2, 3) ──────────────────────────────────────────
  useEffect(() => {
    if (appPhase !== 'IN_GAME') return
    if (isCaptureAnimating) return
    const gs = s.gs
    const pid = gs.currentPlayer
    if (pid === HUMAN_ID_2V2 || gs.phase !== 'PLAYING') return

    // Rafraîchit la mémoire du bot courant avec l'état visible actuel.
    memsRef.current[pid] = updateMemory2v2(memsRef.current[pid], getObservableState2v2(gs, pid))

    setIsBotThinking(true)
    const delay = Math.random() * 1000 + 1500 // 1500–2500 ms

    const tid = setTimeout(() => {
      const obs = getObservableState2v2(gs, pid)
      const action = chooseAction2v2(obs, pid, 'medium', memsRef.current[pid])

      if (action.type === 'PLAY_CARD') {
        recordForAll(gs, { byPlayer: pid, card: action.card })
      } else if (action.type === 'CONTEST') {
        recordForAll(gs, undefined, { byPlayer: pid, value: action.accusedValue })
      }

      setIsBotThinking(false)
      dispatch({ kind: 'ACT', action })
    }, delay)

    return () => {
      clearTimeout(tid)
      setIsBotThinking(false)
    }
  }, [s.gs, appPhase, isCaptureAnimating])

  // ── Callbacks humain ──────────────────────────────────────────────────────

  const playCard = useCallback((card: Card) => {
    recordForAll(s.gs, { byPlayer: HUMAN_ID_2V2, card })
    dispatch({ kind: 'ACT', action: { type: 'PLAY_CARD', playerId: HUMAN_ID_2V2, card } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.gs])

  const declare = useCallback((combination: Combination) => {
    dispatch({ kind: 'ACT', action: { type: 'DECLARE', playerId: HUMAN_ID_2V2, combination } })
  }, [])

  const contest = useCallback((accusedPlayer: PlayerId2v2, accusedValue: Value) => {
    recordForAll(s.gs, undefined, { byPlayer: HUMAN_ID_2V2, value: accusedValue })
    dispatch({
      kind: 'ACT',
      action: { type: 'CONTEST', playerId: HUMAN_ID_2V2, accusedPlayer, accusedValue },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.gs])

  const startGame = useCallback((firstDealer: PlayerId2v2) => {
    memsRef.current = freshMemories()
    dispatch({ kind: 'NEW', seed: Date.now(), firstDealer })
    setAppPhase('IN_GAME')
  }, [])

  const nextDeal = useCallback(() => {
    dispatch({ kind: 'CONTINUE_DEAL' })
  }, [])

  const newGame = useCallback(() => {
    memsRef.current = freshMemories()
    setAppPhase('RITUAL_PICKER')
  }, [])

  // Cibles de contre : adversaires (équipe opposée à l'humain) ayant révélé ≥2
  // cartes de même valeur cette manche, non encore contestées ni déclarées.
  const computeContestTargets = (): { player: PlayerId2v2; value: Value }[] => {
    const gs = s.gs
    const isHumanTurn = gs.currentPlayer === HUMAN_ID_2V2 && gs.phase === 'PLAYING'
    if (!isHumanTurn) return []
    const mem = memsRef.current[HUMAN_ID_2V2]
    const targets: { player: PlayerId2v2; value: Value }[] = []
    for (const adv of [1, 3] as PlayerId2v2[]) {
      if (teamOf(adv) === teamOf(HUMAN_ID_2V2)) continue
      const plays = mem.currentHandPlays[adv]
      const counts = new Map<Value, number>()
      for (const c of plays) counts.set(c.value, (counts.get(c.value) ?? 0) + 1)
      for (const [value, n] of counts) {
        if (n < 2) continue
        if (mem.contestedValues.has(value)) continue
        if (gs.players[adv].declaredCombo?.value === value) continue
        targets.push({ player: adv, value })
      }
    }
    return targets
  }

  return {
    appPhase,
    view: { ...toView(s.gs), isBotThinking, isCaptureAnimating, contestTargets: computeContestTargets() },
    setCaptureAnimating: setIsCaptureAnimating,
    startGame,
    nextDeal,
    playCard,
    declare,
    contest,
    newGame,
  }
}

export { teamOf }

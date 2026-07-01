import { useReducer, useCallback, useEffect, useRef, useState } from 'react'
import { applyAction, createInitialState, startNewDeal } from '../engine'
import type { Card, Combination, GameEvent, GameState, PlayerId, Value } from '../engine/types'
import type { Rng } from '../engine/deck'
import type { Action } from '../engine/types'
import { getObservableState } from '../ai/observable'
import { chooseAction } from '../ai/bot'
import { chooseActionHard } from '../ai/botHard'
import { getDifficulty } from './difficulty'
import { createMemory, updateMemory } from '../ai/memory'
import type { AiMemory } from '../ai/memory'
import { frameFromState, buildReplay, saveReplay, type GameAction, type ReplayStep } from '../replay/replay'

// ── Identités fixes ─────────────────────────────────────────────────────────

export const HUMAN_ID: PlayerId = 0
export const BOT_ID: PlayerId = 1

// ── RNG dérivé d'un seed — reducer pur ──────────────────────────────────────

/**
 * Crée un LCG (Numerical Recipes) à partir d'un seed entier.
 * Retourne { rng, getSeed } : après N appels à rng(), getSeed() renvoie
 * le seed courant pour le persister dans l'état sans garder de closure mutable.
 *
 * Pourquoi cette forme et pas un closure directement dans l'état ?
 * React StrictMode double-invoque les reducers. Un RNG mutable en état
 * produirait des valeurs différentes entre les deux invocations, cassant
 * la règle de pureté. Ici l'état ne stocke qu'un nombre (seed) ;
 * le reducer reconstruit un RNG frais à chaque réduction → pur et StrictMode-safe.
 */
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

/** Tout ce dont l'UI a besoin pour afficher l'écran de jeu. */
export interface GameView {
  state: GameState
  humanId: PlayerId
  botId: PlayerId
  /** C'est le tour de l'humain et la phase est PLAYING. */
  isHumanTurn: boolean
  /**
   * L'humain peut déclarer sa combo (bouton Ronda / Tringa visible).
   * Faux si déjà déclaré ou si le droit a été perdu.
   */
  canDeclare: boolean
  /**
   * L'humain peut contester la combo adverse (bouton Contre visible).
   * Vrai si l'adversaire vient de révéler ≥2 cartes de même valeur cette manche.
   */
  canContest: boolean
  /** Valeur à contester si canContest (sinon null). */
  contestValue: Value | null
  isGameOver: boolean
  /** La donne est terminée, décompte effectué — afficher l'écran résultat. */
  isDealEnd: boolean
  /** Le bot est en train de « réfléchir » (délai avant son coup). */
  isBotThinking: boolean
  /** Une animation de capture est en cours — le jeu est gelé. */
  isCaptureAnimating: boolean
  /**
   * Événements produits par la dernière action (caída, missa, ronda…).
   * `id` change à chaque nouvelle occurrence — permet de retrigger useEffect
   * même pour deux caídas consécutives.
   * null si aucun événement remarquable.
   */
  lastEvent: { events: readonly GameEvent[]; id: number } | null
}

function toView(gs: GameState): GameView {
  const isHumanTurn = gs.currentPlayer === HUMAN_ID && gs.phase === 'PLAYING'
  const h = gs.players[HUMAN_ID]
  return {
    state: gs,
    humanId: HUMAN_ID,
    botId: BOT_ID,
    isHumanTurn,
    canDeclare:
      h.pendingCombo !== null &&
      h.declaredCombo === null &&
      !h.lostComboRight,
    canContest: false,    // surchargé au retour du hook (dépend de la mémoire)
    contestValue: null,
    isGameOver: gs.phase === 'GAME_OVER',
    isDealEnd: gs.phase === 'DEAL_END',
    isBotThinking: false,      // surchargés au retour du hook (états React transitoires)
    isCaptureAnimating: false,
    lastEvent:
      gs.lastEvents.length > 0
        ? { events: gs.lastEvents, id: gs.eventSeq }
        : null,
  }
}

// ── Reducer pur ──────────────────────────────────────────────────────────────

type RS = { gs: GameState; seed: number; steps: ReplayStep[] }

type RA =
  | { kind: 'ACT'; action: Action }
  | { kind: 'NEW'; seed: number; firstDealer: PlayerId }
  | { kind: 'CONTINUE_DEAL' }

/** Convertit une action moteur en action de journal (replay). */
function toGameAction(action: Action): GameAction {
  switch (action.type) {
    case 'PLAY_CARD': return { type: 'PLAY_CARD', playerId: action.playerId, card: action.card }
    case 'DECLARE':   return { type: 'DECLARE', playerId: action.playerId, value: action.combination.value }
    case 'CONTEST':   return { type: 'CONTEST', playerId: action.playerId, value: action.accusedValue }
  }
}

function reduce(s: RS, a: RA): RS {
  switch (a.kind) {
    case 'ACT': {
      const { rng, getSeed } = makeLcg(s.seed)
      const gs = applyAction(s.gs, a.action, rng)
      const step: ReplayStep = { action: toGameAction(a.action), frame: frameFromState(gs) }
      return { gs, seed: getSeed(), steps: [...s.steps, step] }
    }
    case 'NEW': {
      const { rng, getSeed } = makeLcg(a.seed)
      const gs = createInitialState(rng, a.firstDealer)
      return { gs, seed: getSeed(), steps: [{ action: { type: 'START' }, frame: frameFromState(gs) }] }
    }
    case 'CONTINUE_DEAL': {
      const { rng, getSeed } = makeLcg(s.seed)
      const gs = startNewDeal(
        {
          scores: [s.gs.players[0].score, s.gs.players[1].score],
          dealer: (1 - s.gs.dealer) as PlayerId,
          dealNumber: s.gs.dealNumber + 1,
        },
        rng,
      )
      const step: ReplayStep = { action: { type: 'DEAL' }, frame: frameFromState(gs) }
      return { gs, seed: getSeed(), steps: [...s.steps, step] }
    }
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/** Phase applicative — hors du reducer (pas de partie avant startGame). */
export type AppPhase = 'RITUAL_PICKER' | 'IN_GAME'

export function useRondaGame() {
  const [appPhase, setAppPhase] = useState<AppPhase>('RITUAL_PICKER')

  // État du jeu — le state initial est un placeholder ; la vraie partie commence
  // seulement quand startGame() dispatche 'NEW' avec le bon donneur.
  const [s, dispatch] = useReducer(reduce, undefined, (): RS => {
    const { rng, getSeed } = makeLcg(1)
    return { gs: createInitialState(rng, 0), seed: getSeed(), steps: [] }
  })

  // Le bot « réfléchit » pendant son délai aléatoire (2–3 s) avant de jouer.
  const [isBotThinking, setIsBotThinking] = useState(false)

  // Gel du jeu pendant l'animation de capture (piloté par GameScreen).
  const [isCaptureAnimating, setIsCaptureAnimating] = useState(false)

  // AiMemory persiste entre les renders sans déclencher de re-render
  const memRef = useRef<AiMemory>(createMemory())

  // ── Sauvegarde du replay en fin de partie ─────────────────────────────────
  const replaySavedRef = useRef(false)
  useEffect(() => {
    if (s.gs.phase === 'GAME_OVER') {
      if (!replaySavedRef.current) {
        replaySavedRef.current = true
        void saveReplay(buildReplay(s.steps, false, Date.now()))
      }
    } else {
      replaySavedRef.current = false
    }
  }, [s.gs.phase, s.steps])

  // ── Boucle bot ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (appPhase !== 'IN_GAME') return          // pas de bot pendant les rituels
    if (isCaptureAnimating) return              // jeu gelé pendant l'animation de capture
    const gs = s.gs
    if (gs.currentPlayer !== BOT_ID || gs.phase !== 'PLAYING') return

    const obs = getObservableState(gs, BOT_ID)

    // Met à jour la mémoire avec l'état visible actuel
    memRef.current = updateMemory(memRef.current, obs)

    // Délai « humain » aléatoire entre 2000 et 3000 ms.
    setIsBotThinking(true)
    const delay = Math.random() * 1000 + 2000

    const tid = setTimeout(() => {
      const diff = getDifficulty()
      const action = diff === 'hard'
        ? chooseActionHard(gs, obs, BOT_ID, memRef.current, Math.random)
        : chooseAction(obs, BOT_ID, diff, memRef.current)

      // Si le bot joue une carte, on l'enregistre dans la mémoire
      if (action.type === 'PLAY_CARD') {
        memRef.current = updateMemory(
          memRef.current,
          obs,
          { byPlayer: BOT_ID, card: action.card },
        )
      }
      // Si le bot conteste, on enregistre la valeur contestée
      if (action.type === 'CONTEST') {
        memRef.current = updateMemory(
          memRef.current,
          obs,
          undefined,
          action.accusedValue,
        )
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

  const playCard = useCallback(
    (card: Card) => {
      // Enregistre la carte jouée par l'humain dans la mémoire du bot
      const obs = getObservableState(s.gs, BOT_ID)
      memRef.current = updateMemory(
        memRef.current,
        obs,
        { byPlayer: HUMAN_ID, card },
      )
      dispatch({ kind: 'ACT', action: { type: 'PLAY_CARD', playerId: HUMAN_ID, card } })
    },
    [s.gs],
  )

  const declare = useCallback(
    (combination: Combination) =>
      dispatch({ kind: 'ACT', action: { type: 'DECLARE', playerId: HUMAN_ID, combination } }),
    [],
  )

  const contest = useCallback(
    (accusedValue: Value) => {
      // Enregistre la valeur contestée pour ne pas re-proposer le bouton.
      const obs = getObservableState(s.gs, BOT_ID)
      memRef.current = updateMemory(memRef.current, obs, undefined, accusedValue)
      dispatch({ kind: 'ACT', action: { type: 'CONTEST', playerId: HUMAN_ID, accusedValue } })
    },
    [s.gs],
  )

  // Fenêtre de contre : l'adversaire (bot) vient de révéler ≥2 cartes de même
  // valeur dans la manche courante (info publique, lue dans la mémoire).
  const computeContest = (): { canContest: boolean; contestValue: Value | null } => {
    const gs = s.gs
    const isHumanTurn = gs.currentPlayer === HUMAN_ID && gs.phase === 'PLAYING'
    const last = gs.lastPlayed[BOT_ID]
    if (!isHumanTurn || last === null) return { canContest: false, contestValue: null }
    const plays = memRef.current.currentHandPlays[BOT_ID]
    const count = plays.filter(c => c.value === last.value).length
    const alreadyContested = memRef.current.contestedValues.has(last.value)
    const alreadyDeclared = gs.players[BOT_ID].declaredCombo?.value === last.value
    if (count >= 2 && !alreadyContested && !alreadyDeclared) {
      return { canContest: true, contestValue: last.value }
    }
    return { canContest: false, contestValue: null }
  }

  /** Lance la partie avec le donneur déterminé par le rituel. */
  const startGame = useCallback((firstDealer: PlayerId) => {
    memRef.current = createMemory()
    dispatch({ kind: 'NEW', seed: Date.now(), firstDealer })
    setAppPhase('IN_GAME')
  }, [])

  /** Confirme la fin de donne et démarre la suivante. */
  const nextDeal = useCallback(() => {
    dispatch({ kind: 'CONTINUE_DEAL' })
  }, [])

  /** Revient à l'écran de sélection du rituel (puis menu). */
  const newGame = useCallback(() => {
    memRef.current = createMemory()
    setAppPhase('RITUAL_PICKER')
  }, [])

  return {
    appPhase,
    view: { ...toView(s.gs), isBotThinking, isCaptureAnimating, ...computeContest() },
    setCaptureAnimating: setIsCaptureAnimating,
    startGame,
    nextDeal,
    playCard,
    declare,
    contest,
    newGame,
  }
}

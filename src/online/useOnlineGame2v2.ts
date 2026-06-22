import { useState, useCallback, useSyncExternalStore } from 'react'
import type { Card, Combination, Value } from '../engine/types'
import type { GameState2v2, PlayerId2v2, PlayerState2v2, TeamState } from '../engine2v2/types2v2'
import type { GameView2v2 } from '../game/useRonda2v2Game'
import { subscribe, getSnapshot, send, leave, type Server2v2GameState } from './lobby2v2'

const PLACEHOLDER: Card = { value: 1, suit: 'oros' }
const fill = (n: number): Card[] => Array.from({ length: Math.max(0, n) }, () => PLACEHOLDER)

// Ordre de jeu (anti-horaire) : nextPlayer = (p+3)%4 → cycle [0,3,2,1].
const CYCLE = [0, 3, 2, 1]
const CYCLE_POS: Record<number, number> = { 0: 0, 3: 1, 2: 2, 1: 3 }

/**
 * Tables de correspondance sièges serveur ↔ sièges locaux, telles que MON siège
 * devienne le local 0 (en bas), mon coéquipier le local 2 (en haut) et les
 * adversaires les locaux 1 et 3 — en préservant l'ordre du tour et les équipes.
 */
function seatMaps(mySeat: number): { toLocal: number[]; toServer: number[] } {
  const toLocal = [0, 0, 0, 0]
  const toServer = [0, 0, 0, 0]
  for (let s = 0; s < 4; s++) {
    const local = CYCLE[(CYCLE_POS[s] - CYCLE_POS[mySeat] + 4) % 4]
    toLocal[s] = local
    toServer[local] = s
  }
  return { toLocal, toServer }
}

function emptyPlayer(): PlayerState2v2 {
  return { hand: [], pendingCombo: null, declaredCombo: null, lostComboRight: false, playedThisRound: [] }
}

function emptyState(): GameState2v2 {
  return {
    players: [emptyPlayer(), emptyPlayer(), emptyPlayer(), emptyPlayer()],
    teams: [{ captured: [], score: 0 }, { captured: [], score: 0 }],
    table: [],
    deck: [],
    currentPlayer: 0,
    dealer: 0,
    phase: 'PLAYING',
    roundNumber: 0,
    dealNumber: 0,
    isMabqach: false,
    lastCapture: null,
    caidaChain: null,
    pendingCaidaCard: null,
    lastPlayed: [null, null, null, null],
    lastEvents: [],
    eventSeq: 0,
  }
}

/** Reconstruit un GameState2v2 « toi = local 0 » depuis l'état serveur. */
function buildState(g: Server2v2GameState): GameState2v2 {
  const my = g.seat
  const myTeam = (my % 2) as 0 | 1
  const { toLocal } = seatMaps(my)

  const players = [emptyPlayer(), emptyPlayer(), emptyPlayer(), emptyPlayer()]
  for (let s = 0 as PlayerId2v2; s < 4; s = (s + 1) as PlayerId2v2) {
    const local = toLocal[s]
    if (s === my) {
      players[local] = {
        hand: g.you.hand,
        pendingCombo: g.you.pendingCombo,
        declaredCombo: g.you.declaredCombo,
        lostComboRight: g.you.lostComboRight,
        playedThisRound: g.you.playedThisRound,
      }
    } else {
      const pub = g.players.find((p) => p.seat === s)
      players[local] = {
        hand: fill(pub?.handCount ?? 0),
        pendingCombo: null,
        declaredCombo: pub?.declaredCombo ?? null,
        lostComboRight: false,
        playedThisRound: pub?.playedThisRound ?? [],
      }
    }
  }

  const teams: [TeamState, TeamState] = [
    { score: g.teams[myTeam].score, captured: fill(g.teams[myTeam].capturedCount) },
    { score: g.teams[(1 - myTeam) as 0 | 1].score, captured: fill(g.teams[(1 - myTeam) as 0 | 1].capturedCount) },
  ]

  const lastPlayed: [Card | null, Card | null, Card | null, Card | null] = [null, null, null, null]
  for (let s = 0; s < 4; s++) lastPlayed[toLocal[s]] = g.lastPlayed[s]

  return {
    players: players as [PlayerState2v2, PlayerState2v2, PlayerState2v2, PlayerState2v2],
    teams,
    table: g.table,
    deck: fill(g.deckCount),
    currentPlayer: toLocal[g.currentSeat] as PlayerId2v2,
    dealer: toLocal[g.dealer] as PlayerId2v2,
    phase: g.phase,
    roundNumber: g.roundNumber,
    dealNumber: g.dealNumber,
    isMabqach: g.isMabqach,
    lastCapture: g.lastCapture
      ? { playerId: toLocal[g.lastCapture.playerId] as PlayerId2v2, card: g.lastCapture.card }
      : null,
    caidaChain: null,
    pendingCaidaCard: null,
    lastPlayed,
    lastEvents: g.lastEvents ?? [],
    eventSeq: g.eventSeq ?? 0,
  }
}

/**
 * Hook in-game 2v2 en ligne — miroir de useRonda2v2Game (même interface), alimenté
 * par le store du lobby. Reconstruit l'état « toi = joueur 0 » et envoie les coups
 * au serveur.
 */
export function useOnlineGame2v2() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [isCaptureAnimating, setCaptureAnimating] = useState(false)
  // Valeurs déjà contestées par l'humain, clé incluant la manche pour expirer
  // automatiquement à la redistribution (pas de reset explicite nécessaire).
  const [contested, setContested] = useState<ReadonlySet<string>>(new Set())

  const gs = snap.game ? buildState(snap.game) : emptyState()
  const me = gs.players[0]
  const isHumanTurn = gs.currentPlayer === 0 && gs.phase === 'PLAYING'
  const roundKey = `${gs.dealNumber}:${gs.roundNumber}`

  // Cibles de contre : adversaires (locaux 1 et 3) ayant révélé ≥2 cartes de même
  // valeur cette manche, non déjà déclarées ni déjà contestées par l'humain.
  // Mêmes données publiques que le solo (playedThisRound), envoyées par le serveur.
  const contestTargets: { player: PlayerId2v2; value: Value }[] = []
  if (isHumanTurn) {
    for (const adv of [1, 3] as PlayerId2v2[]) {
      const counts = new Map<Value, number>()
      for (const c of gs.players[adv].playedThisRound) {
        counts.set(c.value, (counts.get(c.value) ?? 0) + 1)
      }
      for (const [value, n] of counts) {
        if (n < 2) continue
        if (gs.players[adv].declaredCombo?.value === value) continue
        if (contested.has(`${roundKey}:${adv}:${value}`)) continue
        contestTargets.push({ player: adv, value })
      }
    }
  }

  const view: GameView2v2 = {
    state: gs,
    humanId: 0,
    isHumanTurn,
    teamScores: [gs.teams[0].score, gs.teams[1].score],
    teamCapturedCount: [gs.teams[0].captured.length, gs.teams[1].captured.length],
    canDeclare: me.pendingCombo !== null && me.declaredCombo === null && !me.lostComboRight,
    contestTargets,
    isGameOver: gs.phase === 'GAME_OVER',
    isDealEnd: gs.phase === 'DEAL_END',
    isBotThinking: false,
    isCaptureAnimating,
    lastEvent: gs.lastEvents.length > 0 ? { events: gs.lastEvents, id: gs.eventSeq } : null,
  }

  const playCard = useCallback((card: Card) => send('play_card', { card }), [])
  const declare = useCallback((combination: Combination) => send('declare', { combination }), [])
  const contest = useCallback(
    (accusedPlayer: PlayerId2v2, accusedValue: Value) => {
      const my = snap.game?.seat ?? 0
      const { toServer } = seatMaps(my)
      setContested((prev) =>
        new Set(prev).add(`${roundKey}:${accusedPlayer}:${accusedValue}`),
      )
      send('contest', { accusedPlayer: toServer[accusedPlayer], accusedValue })
    },
    [snap.game?.seat, roundKey],
  )
  const nextDeal = useCallback(() => send('continue_deal'), [])
  const startGame = useCallback((_firstDealer: PlayerId2v2) => {}, [])
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
  }
}

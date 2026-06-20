import { createDeck, shuffle, type Rng } from '../engine/deck'
import { detectCombination } from '../engine/combinations'
import { isTableValid } from '../engine/deal'
import type { GameState2v2, PlayerId2v2, PlayerState2v2, TeamState } from './types2v2'
import { nextPlayer } from './types2v2'

function emptyPlayer(): PlayerState2v2 {
  return {
    hand: [],
    pendingCombo: null,
    declaredCombo: null,
    lostComboRight: false,
    playedThisRound: [],
  }
}

/** Crée l'état initial d'une toute nouvelle partie 2v2. */
export function createInitialState2v2(rng: Rng, firstDealer: PlayerId2v2 = 0): GameState2v2 {
  return startNewDeal2v2({ scores: [0, 0], dealer: firstDealer, dealNumber: 0 }, rng)
}

interface DealContext2v2 {
  scores: [number, number]
  dealer: PlayerId2v2
  dealNumber: number
}

/**
 * Nouvelle donne : 3 cartes à chacun des 4 joueurs (12) + 4 sur la table.
 * Pioche restante = 40 − 16 = 24 (exactement 2 redistributions de 12).
 * Boucle jusqu'à une table valide (pas de doublon, pas de suite de 3+).
 */
export function startNewDeal2v2(ctx: DealContext2v2, rng: Rng): GameState2v2 {
  const { scores, dealer, dealNumber } = ctx

  let shuffled = shuffle(createDeck(), rng)
  while (!isTableValid(shuffled.slice(12, 16))) {
    shuffled = shuffle(createDeck(), rng)
  }

  const table = shuffled.slice(12, 16)
  const deck = shuffled.slice(16)

  const mk = (from: number): PlayerState2v2 => {
    const h = shuffled.slice(from, from + 3)
    return { ...emptyPlayer(), hand: h, pendingCombo: detectCombination(h) }
  }
  const players: [PlayerState2v2, PlayerState2v2, PlayerState2v2, PlayerState2v2] = [
    mk(0), mk(3), mk(6), mk(9),
  ]

  const teams: [TeamState, TeamState] = [
    { captured: [], score: scores[0] },
    { captured: [], score: scores[1] },
  ]

  return {
    players,
    teams,
    table,
    deck,
    currentPlayer: nextPlayer(dealer), // le joueur après le donneur ouvre
    dealer,
    phase: 'PLAYING',
    dealNumber,
    roundNumber: 0,
    isMabqach: deck.length === 0,
    lastCapture: null,
    lastPlayed: [null, null, null, null],
    caidaChain: null,
    lastEvents: [],
    eventSeq: 0,
  }
}

/** Redistribue 3 cartes à chaque joueur depuis la pioche (manche suivante). */
export function dealNextRound2v2(state: GameState2v2, rng: Rng): GameState2v2 {
  if (state.deck.length === 0) return state

  const deck = [...state.deck]
  const players = [
    state.players[0],
    state.players[1],
    state.players[2],
    state.players[3],
  ] as [PlayerState2v2, PlayerState2v2, PlayerState2v2, PlayerState2v2]

  for (let p = 0; p < 4; p++) {
    const cards = deck.splice(0, 3)
    players[p] = {
      ...players[p],
      hand: cards,
      pendingCombo: detectCombination(cards),
      declaredCombo: null,
      lostComboRight: false,
      playedThisRound: [],
    }
  }

  return {
    ...state,
    deck,
    players,
    currentPlayer: nextPlayer(state.dealer),
    roundNumber: state.roundNumber + 1,
    isMabqach: deck.length === 0,
    lastPlayed: [null, null, null, null],
    caidaChain: null, // la redistribution coupe toute chaîne de caída
  }
}

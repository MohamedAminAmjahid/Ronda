import type { Card, GameState, PlayerId, PlayerState } from './types'
import { createDeck, shuffle, type Rng } from './deck'
import { detectCombination } from './combinations'
import { ESCALIER_SEQUENCE } from './capture'

/**
 * Cartes nécessaires pour une redistribution complète (3 par joueur × 2 joueurs).
 * En dessous de ce seuil, plus de redistribution possible → fin de donne, et la
 * redistribution courante est la dernière (Mab9ach). Comme la pioche initiale
 * (32) n'est pas multiple de 6, ~2 cartes restent non distribuées en fin de donne.
 */
export const CARDS_PER_REDEAL = 6

/**
 * Valide les 4 cartes posées sur la table au DÉBUT d'une donne.
 * Deux contraintes (uniquement pour la distribution initiale) :
 *   1. Pas de doublon de valeur.
 *   2. Pas de suite de 3+ valeurs consécutives dans l'ordre escalier
 *      (1-2-3-4-5-6-7-10-11-12). Une suite de 2 est tolérée.
 */
export function isTableValid(table: readonly Card[]): boolean {
  const values = table.map(c => c.value)

  // 1. Pas de doublon
  if (new Set(values).size !== values.length) return false

  // 2. Pas de suite de 3+ consécutives (positions adjacentes dans l'escalier)
  const indices = values
    .map(v => ESCALIER_SEQUENCE.indexOf(v))
    .sort((a, b) => a - b)

  let run = 1
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1] + 1) {
      run++
      if (run >= 3) return false
    } else {
      run = 1
    }
  }

  return true
}

function emptyPlayer(score: number): PlayerState {
  return {
    hand: [],
    captured: [],
    score,
    pendingCombo: null,
    declaredCombo: null,
    lostComboRight: false,
    playedThisRound: [],
  }
}

/**
 * Crée l'état initial d'une toute nouvelle partie.
 * @param firstDealer  Donneur de la première donne (issu du pile ou face).
 *                     Par défaut 0 (joueur humain) pour la compatibilité des tests.
 */
export function createInitialState(rng: Rng, firstDealer: PlayerId = 0): GameState {
  return startNewDeal(
    { scores: [0, 0], dealer: firstDealer, dealNumber: 0 },
    rng,
  )
}

interface DealContext {
  scores: [number, number]
  dealer: PlayerId
  dealNumber: number
}

/** Rebat et redistribue pour une nouvelle donne, en conservant les scores. */
export function startNewDeal(ctx: DealContext, rng: Rng): GameState {
  const { scores, dealer, dealNumber } = ctx

  // Distribution initiale : 4 cartes à chaque joueur, AUCUNE sur la table.
  // Pioche restante = 40 - 8 = 32. (isTableValid ne s'applique pas : table vide.)
  const shuffled = shuffle(createDeck(), rng)

  const nonDealer = (1 - dealer) as PlayerId

  const nonDealerHand = shuffled.slice(0, 4)
  const dealerHand = shuffled.slice(4, 8)
  const deck = shuffled.slice(8)

  const players: [PlayerState, PlayerState] = [
    emptyPlayer(scores[0]),
    emptyPlayer(scores[1]),
  ]
  players[nonDealer] = {
    ...players[nonDealer],
    hand: nonDealerHand,
    pendingCombo: detectCombination(nonDealerHand),
  }
  players[dealer] = {
    ...players[dealer],
    hand: dealerHand,
    pendingCombo: detectCombination(dealerHand),
  }

  return {
    deck,
    table: [],
    players,
    currentPlayer: nonDealer,
    dealer,
    phase: 'PLAYING',
    roundNumber: 0,
    dealNumber,
    isMabqach: deck.length < CARDS_PER_REDEAL, // jamais vrai au début (32 cartes)
    lastCapture: null,
    caidaChain: null,
    lastPlayed: [null, null],
    lastEvents: [],
    eventSeq: 0,
  }
}

/**
 * Redistribue 3 cartes à chaque joueur depuis la pioche.
 */
export function dealNextRound(state: GameState, rng: Rng): GameState {
  if (state.deck.length === 0) return state

  const deck = [...state.deck]
  const nonDealer = (1 - state.dealer) as PlayerId

  const nonDealerCards = deck.splice(0, 3)
  const dealerCards = deck.splice(0, 3)

  const players: [PlayerState, PlayerState] = [
    { ...state.players[0] },
    { ...state.players[1] },
  ]
  players[nonDealer] = {
    ...players[nonDealer],
    hand: nonDealerCards,
    pendingCombo: detectCombination(nonDealerCards),
    declaredCombo: null,
    lostComboRight: false,
    playedThisRound: [],
  }
  players[state.dealer] = {
    ...players[state.dealer],
    hand: dealerCards,
    pendingCombo: detectCombination(dealerCards),
    declaredCombo: null,
    lostComboRight: false,
    playedThisRound: [],
  }

  return {
    ...state,
    deck,
    players,
    currentPlayer: (1 - state.dealer) as PlayerId,
    roundNumber: state.roundNumber + 1,
    // Dernière redistribution (Mab9ach) : la pioche restante ne permet plus
    // un tour complet (3 cartes × 2 joueurs).
    isMabqach: deck.length < CARDS_PER_REDEAL,
    lastPlayed: [null, null],
    caidaChain: null,   // la redistribution coupe toute chaîne de caída
  }
}

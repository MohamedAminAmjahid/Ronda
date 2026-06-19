import type { Card, GameState, PlayerId, PlayerState } from './types'
import { createDeck, shuffle, type Rng } from './deck'
import { detectCombination } from './combinations'

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
  const shuffled = shuffle(createDeck(), rng)

  const nonDealer = (1 - dealer) as PlayerId

  const nonDealerHand = shuffled.slice(0, 3)
  const dealerHand = shuffled.slice(3, 6)
  const table = shuffled.slice(6, 10)
  const deck = shuffled.slice(10)

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
    table,
    players,
    currentPlayer: nonDealer,
    dealer,
    phase: 'PLAYING',
    roundNumber: 0,
    dealNumber,
    isMabqach: deck.length === 0,
    lastCapture: null,
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
    isMabqach: deck.length === 0,
    lastPlayed: [null, null],
  }
}

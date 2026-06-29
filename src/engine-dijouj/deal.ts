import type { Card, GameState } from './types'
import type { Rng } from './deck'
import { createDeck, shuffle } from './deck'

function isSpecial(c: Card): boolean {
  return c.value === 1 || c.value === 2 || (c.value === 7 && c.suit === 'oros')
}

/**
 * Crée l'état initial : playerCount joueurs × 7 cartes, reste = pioche,
 * 1 carte retournée en défausse.
 *
 * La première carte de la défausse ne peut pas être spéciale (As/1, 2, 7 de Oros).
 * Si la carte tirée est spéciale : remise dans la pioche, mélange, nouvelle tentative.
 */
export function createInitialState(playerCount: number, rng: Rng): GameState {
  let deck = shuffle(createDeck(), rng)

  const players = Array.from({ length: playerCount }, (_, id) => ({
    id,
    hand: deck.splice(0, 7),
  }))

  // Tire la première carte de défausse ; remet et remélange si spéciale
  let startCard = deck.pop()!
  while (isSpecial(startCard)) {
    deck.push(startCard)
    deck = shuffle(deck, rng)
    startCard = deck.pop()!
  }

  return {
    players,
    drawPile:        deck,
    discardPile:     [startCard],
    currentPlayerId: 0,
    chosenSuit:      null,
    pendingEffect:   null,
    isOver:          false,
    winnerId:        null,
  }
}

import type { Card, GameState } from './types'
import type { Rng } from './deck'
import { createDeck, shuffle } from './deck'

function isSpecial(c: Card): boolean {
  return c.value === 1 || c.value === 2 || (c.value === 7 && c.suit === 'oros')
}

export function createInitialState(playerCount: number, rng: Rng): GameState {
  let deck = shuffle(createDeck(), rng)

  const players = Array.from({ length: playerCount }, (_, id) => ({
    id,
    hand: deck.splice(0, 7),
  }))

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

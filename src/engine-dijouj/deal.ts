import type { GameState } from './types'
import type { Rng } from './deck'
import { createDeck, shuffle } from './deck'

/**
 * Crée l'état initial : playerCount joueurs × 7 cartes, reste = pioche,
 * 1 carte retournée en défausse (jamais le 7 de Oros pour éviter la sélection de couleur).
 */
export function createInitialState(playerCount: number, rng: Rng): GameState {
  const deck = shuffle(createDeck(), rng)

  const players = Array.from({ length: playerCount }, (_, id) => ({
    id,
    hand: deck.splice(0, 7),
  }))

  // Cherche la première carte qui n'est pas le 7 de Oros comme première défausse
  let startIdx = deck.findIndex(c => !(c.value === 7 && c.suit === 'oros'))
  if (startIdx === -1) startIdx = 0
  const [startCard] = deck.splice(startIdx, 1)

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

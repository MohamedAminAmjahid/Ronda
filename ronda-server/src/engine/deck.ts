import type { Card, Suit, Value } from './types'

const SUITS: Suit[] = ['oros', 'copas', 'espadas', 'bastos']
const VALUES: Value[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]

export function createDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ value, suit })
    }
  }
  return deck
}

export type Rng = () => number

/** Fisher-Yates shuffle avec générateur injectable pour tests déterministes */
export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

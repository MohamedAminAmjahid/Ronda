import type { Card, Suit, Value } from './types'

export type Rng = () => number

export const SUITS:  readonly Suit[]  = ['oros', 'copas', 'espadas', 'bastos']
export const VALUES: readonly Value[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]

/** Crée les 40 cartes espagnoles (sans 8 ni 9). */
export function createDeck(): Card[] {
  return SUITS.flatMap(suit => VALUES.map(value => ({ suit, value })))
}

/** Mélange en place (Fisher-Yates) avec un RNG injecté. */
export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

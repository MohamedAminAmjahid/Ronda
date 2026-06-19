import type { Card, Combination, CombinationType, Value } from './types'

/** Détecte la meilleure combinaison dans une main (tringa prioritaire). */
export function detectCombination(hand: readonly Card[]): Combination | null {
  const byValue = new Map<Value, Card[]>()
  for (const card of hand) {
    const arr = byValue.get(card.value) ?? []
    arr.push(card)
    byValue.set(card.value, arr)
  }

  let best: Combination | null = null

  for (const [value, cards] of byValue) {
    if (cards.length >= 3) {
      const combo: Combination = { type: 'tringa', value, cards: cards.slice(0, 3) }
      if (!best || combinationStrength(combo) > combinationStrength(best)) {
        best = combo
      }
    } else if (cards.length >= 2) {
      const combo: Combination = { type: 'ronda', value, cards: cards.slice(0, 2) }
      if (!best || combinationStrength(combo) > combinationStrength(best)) {
        best = combo
      }
    }
  }

  return best
}

/** Valeur numérique de la force d'une combinaison pour comparaison. */
export function combinationStrength(c: Combination): number {
  // tringa > ronda, à type égal la valeur de carte est le tiebreaker
  const typeBonus = c.type === 'tringa' ? 10000 : 0
  return typeBonus + c.value
}

/** Points de base d'une combinaison (avant conflit). */
export function basePoints(c: Combination): number {
  return c.type === 'tringa' ? 5 : 1
}

export interface ConflictResult {
  winner: 0 | 1       // index dans [comboA, comboB]
  pointsA: number
  pointsB: number
}

/**
 * Résout le conflit quand les deux joueurs déclarent.
 * Le gagnant prend la totalité des points (les siens + ceux de l'adversaire).
 */
export function resolveConflict(comboA: Combination, comboB: Combination): ConflictResult {
  const sA = combinationStrength(comboA)
  const sB = combinationStrength(comboB)
  const totalPoints = basePoints(comboA) + basePoints(comboB)

  if (sA >= sB) {
    return { winner: 0, pointsA: totalPoints, pointsB: 0 }
  } else {
    return { winner: 1, pointsA: 0, pointsB: totalPoints }
  }
}

/**
 * Résolution du contre-ronda.
 *
 * Le contesteur accuse `accusedValue`. On valide que l'adversaire a bien joué
 * au moins 2 cartes de cette valeur **issues de la même main distribuée**.
 * "même main" = cartes dans `playedFromCombo` de l'adversaire.
 *
 * Retourne les deltas de score [deltaContesteur, deltaAdversaire].
 */
export function resolveContest(
  accusedValue: Value,
  opponentPlayedThisRound: readonly Card[],
  opponentHand: readonly Card[],
): { contestorDelta: number; opponentDelta: number; wasCorrect: boolean } {
  // Compter les cartes de cette valeur dans les cartes jouées de la main
  const playedOfValue = opponentPlayedThisRound.filter(c => c.value === accusedValue)
  // + celles encore en main (non jouées)
  const inHandOfValue = opponentHand.filter(c => c.value === accusedValue)

  const totalSameHand = playedOfValue.length + inHandOfValue.length

  if (totalSameHand >= 2) {
    // Contre correct : l'adversaire avait caché une ronda
    return { contestorDelta: 1, opponentDelta: 0, wasCorrect: true }
  } else {
    // Contre à tort : le contesteur perd 1 point
    return { contestorDelta: -1, opponentDelta: 0, wasCorrect: false }
  }
}

import type { Card, PlayerId, Value } from '../engine/types'
import { createDeck } from '../engine/deck'
import { ESCALIER_SEQUENCE } from '../engine/capture'
import type { ObservableState } from './observable'

function cardKey(c: Card): string {
  return `${c.value}:${c.suit}`
}

export interface AiMemory {
  /** Toutes les cartes vues depuis le début de la donne courante. */
  seenCards: ReadonlySet<string>
  /**
   * Cartes jouées par chaque joueur depuis la dernière redistribution.
   * Index = PlayerId. Réinitialisé à chaque nouvelle redistribution.
   * Sert à détecter les rondas cachées (pour le contre).
   */
  currentHandPlays: readonly [readonly Card[], readonly Card[]]
  /**
   * Valeurs déjà contestées dans la redistribution courante.
   * Empêche le bot de contester deux fois la même valeur.
   */
  contestedValues: ReadonlySet<Value>
  lastDealNumber: number
  lastRoundNumber: number
}

export function createMemory(): AiMemory {
  return {
    seenCards: new Set(),
    currentHandPlays: [[], []],
    contestedValues: new Set(),
    lastDealNumber: -1,
    lastRoundNumber: -1,
  }
}

/**
 * Met à jour la mémoire après chaque action observable.
 *
 * @param playedCard  Si la dernière action était PLAY_CARD, la carte et l'auteur.
 * @param contestedValue  Si la dernière action était CONTEST émis par ce bot, la valeur contestée.
 */
export function updateMemory(
  memory: AiMemory,
  newObs: ObservableState,
  playedCard?: { byPlayer: PlayerId; card: Card },
  contestedValue?: Value,
): AiMemory {
  const dealChanged = newObs.dealNumber > memory.lastDealNumber
  const roundChanged = !dealChanged && newObs.roundNumber > memory.lastRoundNumber

  // Reset selon la frontière détectée
  let seen = dealChanged ? new Set<string>() : new Set<string>(memory.seenCards)
  let plays: [Card[], Card[]] =
    dealChanged || roundChanged
      ? [[], []]
      : [
          [...memory.currentHandPlays[0]],
          [...memory.currentHandPlays[1]],
        ]
  let contested: Set<Value> =
    dealChanged || roundChanged
      ? new Set()
      : new Set(memory.contestedValues)

  // Ajouter toutes les cartes actuellement visibles
  for (const c of newObs.table) seen.add(cardKey(c))
  for (const c of newObs.self.hand) seen.add(cardKey(c))
  for (const c of newObs.self.captured) seen.add(cardKey(c))
  if (newObs.self.declaredCombo) {
    for (const c of newObs.self.declaredCombo.cards) seen.add(cardKey(c))
  }
  if (newObs.opponent.declaredCombo) {
    for (const c of newObs.opponent.declaredCombo.cards) seen.add(cardKey(c))
  }

  // Enregistrer la carte jouée
  if (playedCard) {
    seen.add(cardKey(playedCard.card))
    plays[playedCard.byPlayer] = [...plays[playedCard.byPlayer], playedCard.card]
  }

  // Enregistrer la valeur contestée (évite la double-contestation)
  if (contestedValue !== undefined) {
    contested = new Set([...contested, contestedValue])
  }

  return {
    seenCards: seen,
    currentHandPlays: plays,
    contestedValues: contested,
    lastDealNumber: newObs.dealNumber,
    lastRoundNumber: newObs.roundNumber,
  }
}

/** Cartes non encore vues = main adverse + pioche. */
export function unknownCards(memory: AiMemory): Card[] {
  return createDeck().filter(c => !memory.seenCards.has(cardKey(c)))
}

/**
 * Estimation en [0, 1] de la probabilité que l'adversaire ait une ronda
 * strictement plus haute que `myValue`.
 *
 * Heuristique : compte le nombre de valeurs V > myValue pour lesquelles
 * au moins 2 cartes restent inconnues (potentiellement une paire chez l'adversaire).
 */
export function estimatePHigherRonda(memory: AiMemory, myValue: Value): number {
  const unknowns = unknownCards(memory)
  const higherValues = ESCALIER_SEQUENCE.filter(v => v > myValue)
  if (higherValues.length === 0) return 0

  let dangerCount = 0
  for (const v of higherValues) {
    const count = unknowns.filter(c => c.value === v).length
    if (count >= 2) dangerCount++
  }

  return dangerCount / higherValues.length
}

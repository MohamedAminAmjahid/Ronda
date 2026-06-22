import type { Card } from '../engine/types'
import type { CaptureResult } from '../engine/capture'
import { ESCALIER_SEQUENCE } from '../engine/capture'
import type { ObservableState } from './observable'
import type { AiMemory } from './memory'
import { unknownCards } from './memory'
import type { Difficulty } from './bot'

/**
 * Score heuristique d'un coup selon §1 de AI-STRATEGY.md.
 * captureResult = null → coup sans capture (défausse sur la table).
 */
export function scoreMove(
  card: Card,
  captureResult: CaptureResult | null,
  obs: ObservableState,
  memory: AiMemory,
  difficulty: Difficulty,
): number {
  let score = 0

  if (captureResult !== null) {
    const { captured, isCaida, isMissa } = captureResult
    score += 1.0 * captured.length
    if (isCaida) score += 3.0
    if (isMissa) score += 2.5
    score += 0.3 * captured.filter(c => c.value === 11 || c.value === 12).length
    score += endgameAdjustment(card, captureResult, obs)
  } else {
    if (difficulty === 'medium') {
      score -= discardRisk(card, obs, memory)
    } else {
      score -= 0.5
    }
    score += endgameAdjustment(card, null, obs)
  }

  score -= comboProtectionPenalty(card, obs)

  return score
}

/**
 * Pénalité pour ne pas casser une combinaison qu'on détient encore mais qu'on
 * n'a pas (encore) déclarée. Si le bot a décidé de dissimuler sa ronda (§2 de
 * AI-STRATEGY.md), jouer l'une de ses cartes détruit définitivement le droit de
 * la déclarer plus tard : on évite donc de poser une carte de la combo tant
 * qu'on a un autre choix. La pénalité reste modérée pour qu'une caída/missa
 * franche puisse tout de même justifier de la casser.
 */
export function comboProtectionPenalty(card: Card, obs: ObservableState): number {
  const combo = obs.self.pendingCombo
  if (combo === null || obs.self.declaredCombo !== null || obs.self.lostComboRight) {
    return 0
  }
  const isComboCard = combo.cards.some(
    c => c.value === card.value && c.suit === card.suit,
  )
  return isComboCard ? 2.0 : 0
}

/**
 * Risque de défausser `card` sur la table (nourrit l'adversaire).
 * Plus élevé si la valeur a encore beaucoup d'exemplaires non vus,
 * ou si la carte crée un escalier exploitable sur la table.
 */
export function discardRisk(
  card: Card,
  obs: ObservableState,
  memory: AiMemory,
): number {
  const unknowns = unknownCards(memory)
  const unseenCount = unknowns.filter(c => c.value === card.value).length

  const idx = ESCALIER_SEQUENCE.indexOf(card.value)
  const prevVal = idx > 0 ? ESCALIER_SEQUENCE[idx - 1] : null
  const nextVal = idx < ESCALIER_SEQUENCE.length - 1 ? ESCALIER_SEQUENCE[idx + 1] : null

  const createsChain = obs.table.some(
    c => c.value === prevVal || c.value === nextVal,
  )

  let risk = unseenCount * 0.5
  if (createsChain) risk += 1.0

  return risk
}

/**
 * Ajustement en fin de donne (Mab9ach) pour le donneur.
 * S'applique uniquement quand c'est la dernière carte du donneur.
 */
export function endgameAdjustment(
  card: Card,
  captureResult: CaptureResult | null,
  obs: ObservableState,
): number {
  if (
    !obs.isMabqach ||
    obs.self.hand.length !== 1 ||
    obs.currentPlayer !== obs.dealer
  ) {
    return 0
  }

  // Dernier coup du donneur
  if (captureResult === null) return -10  // aucune prise → -5 pts
  if (card.value === 12) return 8         // Rey → +5 pts
  if (card.value === 1) return -8         // As → -5 pts
  return 0
}

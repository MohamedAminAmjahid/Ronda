import type { Action, Card, Combination, PlayerId, Value } from '../engine/types'
import { resolveCapture } from '../engine/capture'
import type { ObservableState } from './observable'
import type { AiMemory } from './memory'
import { estimatePHigherRonda } from './memory'
import { scoreMove } from './evaluate'

export type Difficulty = 'easy' | 'medium' | 'hard'

/** Seuil en dessous duquel le bot moyen déclare sa ronda malgré le risque. */
const DECLARE_THRESHOLD = 0.25

// ---------------------------------------------------------------------------
// Décision de déclaration (§2)
// ---------------------------------------------------------------------------

function shouldDeclare(
  combo: Combination,
  difficulty: Difficulty,
  memory: AiMemory,
): boolean {
  if (combo.type === 'tringa') return true
  if (difficulty === 'easy') return true
  // Moyen : déclare si la probabilité d'une ronda adversaire plus haute est faible
  return estimatePHigherRonda(memory, combo.value) < DECLARE_THRESHOLD
}

// ---------------------------------------------------------------------------
// Meilleure carte à jouer (§1)
// ---------------------------------------------------------------------------

function chooseBestCard(
  obs: ObservableState,
  botId: PlayerId,
  difficulty: Difficulty,
  memory: AiMemory,
): Action {
  const opponent = (1 - botId) as PlayerId
  const lastOppPlayed = obs.lastPlayed[opponent]

  let bestCard: Card = obs.self.hand[0]
  let bestScore = -Infinity

  for (const card of obs.self.hand) {
    const captureResult = resolveCapture(card, obs.table, lastOppPlayed)
    const s = scoreMove(card, captureResult, obs, memory, difficulty)
    if (s > bestScore) {
      bestScore = s
      bestCard = card
    }
  }

  return { type: 'PLAY_CARD', playerId: botId, card: bestCard }
}

// ---------------------------------------------------------------------------
// Point d'entrée principal (§ Fonction principale)
// ---------------------------------------------------------------------------

/**
 * Choisit l'action du bot pour ce tour.
 *
 * Ordre de décision :
 * 1. CONTEST — si l'adversaire vient de révéler une ronda dissimulée (§3)
 * 2. DECLARE — si le bot a une combo à annoncer (§2), AVANT tout choix de carte
 * 3. PLAY_CARD — meilleure carte selon l'heuristique (§1)
 *
 * Le bot ne lit jamais obs.opponent.hand (inexistant par construction).
 */
export function chooseAction(
  obs: ObservableState,
  botId: PlayerId,
  difficulty: Difficulty,
  memory: AiMemory,
): Action {
  const opponent = (1 - botId) as PlayerId

  // ------------------------------------------------------------------
  // 1. Contre ?
  // Fenêtre : début du tour du bot, après que l'adversaire vient de jouer.
  // La décision s'appuie sur memory.currentHandPlays (observation publique),
  // jamais sur un champ caché de l'adversaire.
  // ------------------------------------------------------------------
  const lastOppCard = obs.lastPlayed[opponent]
  if (lastOppCard !== null) {
    const oppPlays = memory.currentHandPlays[opponent]
    const sameValueCount = oppPlays.filter(c => c.value === lastOppCard.value).length
    const alreadyContested = memory.contestedValues.has(lastOppCard.value as Value)
    const alreadyDeclared = obs.opponent.declaredCombo?.value === lastOppCard.value

    if (sameValueCount >= 2 && !alreadyContested && !alreadyDeclared) {
      return {
        type: 'CONTEST',
        playerId: botId,
        accusedValue: lastOppCard.value as Value,
      }
    }
  }

  // ------------------------------------------------------------------
  // 2. Déclarer ?
  // Garde-fou : cette décision est prise AVANT que chooseBestCard ne puisse
  // sélectionner une carte de la combo, évitant la perte accidentelle du droit.
  // ------------------------------------------------------------------
  const combo = obs.self.pendingCombo
  if (combo !== null && obs.self.declaredCombo === null && !obs.self.lostComboRight) {
    if (shouldDeclare(combo, difficulty, memory)) {
      return { type: 'DECLARE', playerId: botId, combination: combo }
    }
  }

  // ------------------------------------------------------------------
  // 3. Jouer la meilleure carte
  // ------------------------------------------------------------------
  return chooseBestCard(obs, botId, difficulty, memory)
}

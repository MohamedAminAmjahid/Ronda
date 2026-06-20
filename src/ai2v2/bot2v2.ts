import type { Card, Combination } from '../engine/types'
import { resolveCapture, type CaptureResult } from '../engine/capture'
import type { Action2v2, PlayerId2v2 } from '../engine2v2/types2v2'
import { prevPlayer, teamOf } from '../engine2v2/types2v2'
import type { ObservableState2v2 } from './observable2v2'
import type { AiMemory2v2 } from './memory2v2'
import { toMemory1v1 } from './memory2v2'
import type { ObservableState, ObservableSelf, ObservableOpponent } from '../ai/observable'
import { unknownCards, estimatePHigherRonda } from '../ai/memory'
import { scoreMove } from '../ai/evaluate'
import type { Difficulty } from '../ai/bot'

/** Le bot coéquipier (équipe A avec le joueur humain 0). */
const TEAMMATE_ID: PlayerId2v2 = 2
/** Seuil de déclaration d'une ronda (identique au 1v1). */
const DECLARE_THRESHOLD = 0.25

// ── Projection vers les interfaces 1v1 (pour réutiliser evaluate/memory) ──────
// scoreMove/discardRisk/endgameAdjustment ne lisent que table, isMabqach,
// self.hand, et l'égalité currentPlayer===dealer. On projette donc une vue 1v1
// où currentPlayer=0 et dealer=0 ssi c'est au donneur de jouer.

function toObs1v1(obs: ObservableState2v2): ObservableState {
  const isDealerTurn = obs.currentPlayer === obs.dealer
  const self: ObservableSelf = {
    hand: obs.self.hand,
    captured: [],
    score: 0,
    pendingCombo: obs.self.pendingCombo,
    declaredCombo: obs.self.declaredCombo,
    lostComboRight: obs.self.lostComboRight,
  }
  const opponent: ObservableOpponent = {
    handCount: 0,
    capturedCount: 0,
    score: 0,
    declaredCombo: null,
    lostComboRight: false,
  }
  return {
    table: obs.table,
    deckSize: obs.deckSize,
    self,
    opponent,
    currentPlayer: 0,
    dealer: isDealerTurn ? 0 : 1,
    phase: obs.phase,
    roundNumber: obs.roundNumber,
    dealNumber: obs.dealNumber,
    isMabqach: obs.isMabqach,
    lastCapture: null,
    lastPlayed: [null, null],
  }
}

// ── Heuristique coéquipier (joueur 2) ─────────────────────────────────────────
// Pénalité −1.5 sur une capture « plate » de faible valeur (≤6) si la même
// valeur est encore dans les cartes inconnues (potentiellement chez le partenaire).
// On capture toujours en cas de caída / missa / escalier (≥2 cartes) ou valeur ≥10.

function teammateAdjustment(
  captureResult: CaptureResult | null,
  obs: ObservableState2v2,
  playerId: PlayerId2v2,
  memory: AiMemory2v2,
): number {
  if (playerId !== TEAMMATE_ID) return 0
  if (captureResult === null) return 0
  const { captured, isCaida, isMissa } = captureResult
  if (isCaida || isMissa) return 0
  if (captured.length !== 1) return 0 // escalier → toujours prendre
  const v = captured[0].value
  if (v >= 10 || v > 6) return 0 // valeur haute → toujours prendre

  const stillUnknown = unknownCards(toMemory1v1(memory)).some(c => c.value === v)
  return stillUnknown ? -1.5 : 0
}

// ── Choix de carte ───────────────────────────────────────────────────────────

function chooseBestCard2v2(
  obs: ObservableState2v2,
  playerId: PlayerId2v2,
  difficulty: Difficulty,
  memory: AiMemory2v2,
): Action2v2 {
  const lastByPrev = obs.lastPlayed[prevPlayer(playerId)]
  const obs1 = toObs1v1(obs)
  const mem1 = toMemory1v1(memory)

  let bestCard: Card = obs.self.hand[0]
  let bestScore = -Infinity

  for (const card of obs.self.hand) {
    const captureResult = resolveCapture(card, obs.table, lastByPrev)
    const s =
      scoreMove(card, captureResult, obs1, mem1, difficulty) +
      teammateAdjustment(captureResult, obs, playerId, memory)
    if (s > bestScore) {
      bestScore = s
      bestCard = card
    }
  }

  return { type: 'PLAY_CARD', playerId, card: bestCard }
}

// ── Déclaration (identique au 1v1 pour les 3 bots) ────────────────────────────

function shouldDeclare2v2(
  combo: Combination,
  difficulty: Difficulty,
  memory: AiMemory2v2,
): boolean {
  if (combo.type === 'tringa') return true
  if (difficulty === 'easy') return true
  return estimatePHigherRonda(toMemory1v1(memory), combo.value) < DECLARE_THRESHOLD
}

// ── Point d'entrée ─────────────────────────────────────────────────────────────

/**
 * Choisit l'action d'un bot 2v2. Les 3 bots (joueurs 1, 2, 3) utilisent cette
 * fonction ; seul le joueur 2 applique l'heuristique coéquipier.
 *
 * Ordre : CONTEST (joueur précédent uniquement) → DECLARE → PLAY_CARD.
 */
export function chooseAction2v2(
  obs: ObservableState2v2,
  playerId: PlayerId2v2,
  difficulty: Difficulty,
  memory: AiMemory2v2,
): Action2v2 {
  // 1. Contre — fenêtre limitée au joueur précédent (toujours un adversaire,
  //    les équipes alternant 0-1-2-3).
  const prev = prevPlayer(playerId)
  const lastPrevCard = obs.lastPlayed[prev]
  if (lastPrevCard !== null && teamOf(prev) !== teamOf(playerId)) {
    const prevPlays = memory.currentHandPlays[prev]
    const sameValueCount = prevPlays.filter(c => c.value === lastPrevCard.value).length
    const alreadyContested = memory.contestedValues.has(lastPrevCard.value)
    const alreadyDeclared = obs.players[prev].declaredCombo?.value === lastPrevCard.value

    if (sameValueCount >= 2 && !alreadyContested && !alreadyDeclared) {
      return {
        type: 'CONTEST',
        playerId,
        accusedPlayer: prev,
        accusedValue: lastPrevCard.value,
      }
    }
  }

  // 2. Déclarer (avant tout choix de carte, pour ne pas perdre le droit).
  const combo = obs.self.pendingCombo
  if (combo !== null && obs.self.declaredCombo === null && !obs.self.lostComboRight) {
    if (shouldDeclare2v2(combo, difficulty, memory)) {
      return { type: 'DECLARE', playerId, combination: combo }
    }
  }

  // 3. Jouer la meilleure carte.
  return chooseBestCard2v2(obs, playerId, difficulty, memory)
}

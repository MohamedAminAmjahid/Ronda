import type { Card, GameState, PlayerId } from './types'
import type { Rng } from './deck'

/**
 * Bonus Mab9ach selon la dernière prise du donneur.
 * Retourne `[bonusDonneur, bonusAdversaire]` :
 *  - Rey (12)        → [+5, 0]   (donneur)
 *  - As (1)          → [-5, 0]   (donneur)
 *  - aucune prise    → [0, +5]   (adversaire — pas de points négatifs au donneur)
 *  - autre valeur    → [0, 0]
 */
export function mabqachBonus(lastCaptureCard: Card | null): [number, number] {
  if (lastCaptureCard === null) return [0, 5]   // donneur ne prend rien → +5 adversaire
  if (lastCaptureCard.value === 12) return [5, 0] // Rey → +5 donneur
  if (lastCaptureCard.value === 1) return [-5, 0] // As → -5 donneur
  return [0, 0]                                   // autre valeur
}

/** Bonus de décompte : +1 par carte au-dessus de 20. Égalité 20-20 → 0 pour les deux. */
export function cardCountBonus(capturedA: number, capturedB: number): [number, number] {
  if (capturedA === capturedB) return [0, 0]  // égalité (cas 20-20)
  const bonusA = capturedA > 20 ? capturedA - 20 : 0
  const bonusB = capturedB > 20 ? capturedB - 20 : 0
  return [bonusA, bonusB]
}

export function isGameOver(scores: [number, number]): boolean {
  return scores[0] >= 41 || scores[1] >= 41
}

export function winner(scores: [number, number]): PlayerId | null {
  if (scores[0] >= 41) return 0
  if (scores[1] >= 41) return 1
  return null
}

/**
 * Applique le décompte de fin de donne (section 5.2 + 5.1 Mab9ach).
 * - Attribue les cartes restantes de la table au dernier qui a capturé.
 * - Calcule le bonus Mab9ach pour le donneur.
 * - Calcule le bonus de décompte (>20 cartes).
 * - Retourne le nouvel état avec phase DEAL_END ou GAME_OVER.
 */
export function applyEndOfDeal(state: GameState, _rng: Rng): GameState {
  // 1. Donner les cartes restantes de la table au dernier captureur
  let players = state.players.map(p => ({ ...p })) as [
    ReturnType<typeof Object.assign>,
    ReturnType<typeof Object.assign>,
  ]

  // On travaille avec des tableaux mutables localement
  let p0 = { ...state.players[0], captured: [...state.players[0].captured] }
  let p1 = { ...state.players[1], captured: [...state.players[1].captured] }

  if (state.lastCapture !== null && state.table.length > 0) {
    const lc = state.lastCapture.playerId
    if (lc === 0) {
      p0.captured = [...p0.captured, ...state.table]
    } else {
      p1.captured = [...p1.captured, ...state.table]
    }
  }

  // 2. Bonus Mab9ach : crédité au donneur et/ou à l'adversaire selon la prise.
  const dealerCapture =
    state.lastCapture?.playerId === state.dealer
      ? state.lastCapture.card
      : null
  const [mabDealer, mabOpponent] = mabqachBonus(dealerCapture)
  if (state.dealer === 0) {
    p0.score += mabDealer
    p1.score += mabOpponent
  } else {
    p1.score += mabDealer
    p0.score += mabOpponent
  }

  // 3. Bonus de décompte
  const [bA, bB] = cardCountBonus(p0.captured.length, p1.captured.length)
  p0.score += bA
  p1.score += bB

  const newScores: [number, number] = [p0.score, p1.score]

  if (isGameOver(newScores)) {
    return {
      ...state,
      table: [],
      players: [p0, p1],
      phase: 'GAME_OVER',
      lastEvents: [],
    }
  }

  // 4. Pause en DEAL_END : l'UI affiche l'écran résultat ; c'est l'action
  //    CONTINUE_DEAL (useRondaGame) qui appellera startNewDeal ensuite.
  return {
    ...state,
    table: [],
    players: [p0, p1],
    phase: 'DEAL_END',
    lastEvents: [],
  }
}

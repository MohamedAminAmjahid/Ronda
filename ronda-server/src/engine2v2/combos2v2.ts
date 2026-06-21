import type { Combination } from '../engine/types'
import { combinationStrength, basePoints } from '../engine/combinations'
import { teamOf, type PlayerId2v2 } from './types2v2'

/**
 * Résolution des combinaisons à 4 joueurs (RULES-2V2 §7 + §12.2).
 *
 * La combinaison la plus haute parmi les 4 joueurs rafle TOUS les points
 * déclarés (y compris ceux des coéquipiers ET des adversaires). L'équipe du
 * gagnant marque la somme des `basePoints` de toutes les combos déclarées ;
 * l'autre équipe marque 0.
 *
 * - Cross-équipe : Tringa(0) + Ronda(1) + Ronda(3) → A = 5+1+1 = 7, B = 0.
 * - Même équipe : Ronda7(2) + Ronda3(0) → A = 1+1 = 2, B = 0 (cf. §7.2).
 *
 * En cas d'égalité de force (deux combos de même type ET valeur), le joueur
 * d'indice le plus petit l'emporte (déterministe, comme le `>=` du 1v1).
 *
 * @param declared combinaison déclarée par chaque joueur (null si aucune)
 * @returns [pointsÉquipeA, pointsÉquipeB]
 */
export function resolveCombos2v2(
  declared: readonly [
    Combination | null,
    Combination | null,
    Combination | null,
    Combination | null,
  ],
): [number, number] {
  let bestPlayer = -1
  let bestStrength = -1
  let totalPoints = 0

  for (let p = 0; p < 4; p++) {
    const c = declared[p]
    if (!c) continue
    totalPoints += basePoints(c)
    const s = combinationStrength(c)
    if (s > bestStrength) {
      bestStrength = s
      bestPlayer = p
    }
  }

  if (bestPlayer === -1) return [0, 0]

  return teamOf(bestPlayer as PlayerId2v2) === 0 ? [totalPoints, 0] : [0, totalPoints]
}

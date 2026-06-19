import type { Card, Value } from './types'

/**
 * Séquence complète des valeurs en ordre croissant pour l'escalier.
 * 7 → 10 est consécutif (pas de 8 ni 9 dans le jeu).
 */
export const ESCALIER_SEQUENCE: Value[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]

function nextValue(v: Value): Value | null {
  const idx = ESCALIER_SEQUENCE.indexOf(v)
  if (idx === -1 || idx === ESCALIER_SEQUENCE.length - 1) return null
  return ESCALIER_SEQUENCE[idx + 1]
}

export interface CaptureResult {
  captured: Card[]   // toutes les cartes capturées (la posée + l'escalier)
  tableAfter: Card[] // table restante après capture
  isCaida: boolean
  isMissa: boolean
}

/**
 * Tente une capture sur la table.
 * - Si aucune carte de même valeur → null (coup invalide).
 * - S'il y en a plusieurs de même valeur, on en capture une seule (automatiquement
 *   la première trouvée, la couleur n'a pas d'importance).
 * - L'escalier s'enchaîne ensuite (valeurs croissantes consécutives).
 *
 * @param playedCard  Carte posée par le joueur
 * @param table       État actuel de la table
 * @param lastPlayedByOpponent  Dernière carte posée par l'adversaire (pour caída)
 */
export function resolveCapture(
  playedCard: Card,
  table: readonly Card[],
  lastPlayedByOpponent: Card | null,
): CaptureResult | null {
  const tableArr = [...table]

  // Trouver la première carte de même valeur sur la table
  const captureIdx = tableArr.findIndex(c => c.value === playedCard.value)
  if (captureIdx === -1) return null

  const captured: Card[] = [tableArr[captureIdx]]
  tableArr.splice(captureIdx, 1)

  // Caída : la carte capturée est exactement la dernière posée par l'adversaire
  const isCaida =
    lastPlayedByOpponent !== null &&
    lastPlayedByOpponent.value === playedCard.value &&
    lastPlayedByOpponent.suit === captured[0].suit

  // Escalier : on continue avec la valeur suivante dans la séquence
  let next = nextValue(playedCard.value)
  while (next !== null) {
    const idx = tableArr.findIndex(c => c.value === next)
    if (idx === -1) break
    captured.push(tableArr[idx])
    tableArr.splice(idx, 1)
    next = nextValue(next)
  }

  const isMissa = tableArr.length === 0

  return { captured, tableAfter: tableArr, isCaida, isMissa }
}

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
  captured: Card[]   // cartes capturées (hors carte joueuse) — table seulement
  tableAfter: Card[] // table restante après capture (hors carte joueuse)
  isCaida: boolean
  isMissa: boolean
  /**
   * Sur une caída, la carte JOUEUSE reste sur la table (elle devient le nouvel
   * appât) au lieu d'aller dans la pile. Vaut alors `playedCard` ; sinon null.
   */
  remainsOnTable: Card | null
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

  // Caída : la carte capturée est EXACTEMENT celle que l'adversaire a posée au tour
  // immédiatement précédent — même valeur ET même couleur.
  // Un seul exemplaire de chaque carte existe dans le jeu, donc ce test suffit à
  // garantir qu'il s'agit bien de la carte posée au dernier tour (pas d'une autre
  // carte de même valeur déjà présente avant sur la table).
  const isCaida =
    lastPlayedByOpponent !== null &&
    lastPlayedByOpponent.value === captured[0].value &&
    lastPlayedByOpponent.suit  === captured[0].suit

  // Escalier (valeurs croissantes consécutives) — s'applique TOUJOURS, y compris
  // après une caída : si la table contient les valeurs suivantes (ex. caída sur 2
  // alors qu'un 3 est sur la table), ces cartes sont capturées normalement.
  let next = nextValue(playedCard.value)
  while (next !== null) {
    const idx = tableArr.findIndex(c => c.value === next)
    if (idx === -1) break
    captured.push(tableArr[idx])
    tableArr.splice(idx, 1)
    next = nextValue(next)
  }

  // Caída : la carte joueuse RESTE sur la table (nouvel appât) ; les cartes
  // capturées (carte adverse + escalier) partent dans la pile.
  // Missa sur caída : si la table est vidée par la capture (avant que la carte
  // joueuse n'y soit rajoutée), c'est aussi une missa → +1 en plus du bonus caída.
  if (isCaida) {
    return {
      captured,                 // carte adverse capturée + escalier éventuel
      tableAfter: tableArr,     // table sans les cartes capturées (la carte joueuse est rajoutée par applyPlayCard)
      isCaida: true,
      isMissa: tableArr.length === 0,
      remainsOnTable: playedCard,
    }
  }

  const isMissa = tableArr.length === 0

  return { captured, tableAfter: tableArr, isCaida: false, isMissa, remainsOnTable: null }
}

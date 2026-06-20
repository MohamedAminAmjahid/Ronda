import type { Card, Value } from '../engine/types'
import type { AiMemory } from '../ai/memory'
import type { PlayerId2v2 } from '../engine2v2/types2v2'
import type { ObservableState2v2 } from './observable2v2'

function cardKey(c: Card): string {
  return `${c.value}:${c.suit}`
}

export interface AiMemory2v2 {
  /** Toutes les cartes vues depuis le début de la donne courante. */
  seenCards: ReadonlySet<string>
  /**
   * Cartes jouées par chaque joueur depuis la dernière redistribution (index = PlayerId2v2).
   * Réinitialisé à chaque redistribution. Sert à détecter les rondas cachées.
   */
  currentHandPlays: readonly [
    readonly Card[],
    readonly Card[],
    readonly Card[],
    readonly Card[],
  ]
  /** Valeurs déjà contestées dans la redistribution courante. */
  contestedValues: ReadonlySet<Value>
  lastDealNumber: number
  lastRoundNumber: number
}

export function createMemory2v2(): AiMemory2v2 {
  return {
    seenCards: new Set(),
    currentHandPlays: [[], [], [], []],
    contestedValues: new Set(),
    lastDealNumber: -1,
    lastRoundNumber: -1,
  }
}

/**
 * Met à jour la mémoire après chaque action observable (4 joueurs).
 * Même logique de reset que le 1v1 : seenCards réinitialisé à chaque donne,
 * currentHandPlays/contestedValues à chaque redistribution.
 */
export function updateMemory2v2(
  memory: AiMemory2v2,
  newObs: ObservableState2v2,
  playedCard?: { byPlayer: PlayerId2v2; card: Card },
  contestedValue?: Value,
): AiMemory2v2 {
  const dealChanged = newObs.dealNumber > memory.lastDealNumber
  const roundChanged = !dealChanged && newObs.roundNumber > memory.lastRoundNumber

  const seen = dealChanged ? new Set<string>() : new Set<string>(memory.seenCards)
  const plays: [Card[], Card[], Card[], Card[]] =
    dealChanged || roundChanged
      ? [[], [], [], []]
      : [
          [...memory.currentHandPlays[0]],
          [...memory.currentHandPlays[1]],
          [...memory.currentHandPlays[2]],
          [...memory.currentHandPlays[3]],
        ]
  let contested: Set<Value> =
    dealChanged || roundChanged ? new Set() : new Set(memory.contestedValues)

  for (const c of newObs.table) seen.add(cardKey(c))
  for (const c of newObs.self.hand) seen.add(cardKey(c))
  for (const p of newObs.players) {
    if (p.declaredCombo) for (const c of p.declaredCombo.cards) seen.add(cardKey(c))
  }

  if (playedCard) {
    seen.add(cardKey(playedCard.card))
    plays[playedCard.byPlayer] = [...plays[playedCard.byPlayer], playedCard.card]
  }
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

/**
 * Projection vers la mémoire 1v1 — permet de réutiliser tels quels les helpers
 * purs `unknownCards` et `estimatePHigherRonda` (qui ne lisent que `seenCards`).
 */
export function toMemory1v1(m: AiMemory2v2): AiMemory {
  return {
    seenCards: m.seenCards,
    currentHandPlays: [[], []],
    contestedValues: m.contestedValues,
    lastDealNumber: m.lastDealNumber,
    lastRoundNumber: m.lastRoundNumber,
  }
}

import type { GameState } from '../engine-dijouj/types'
import { applyDraw } from '../engine-dijouj/game'

function canCounter(hand: Array<{ value: number }>, effect: NonNullable<GameState['pendingEffect']>): boolean {
  if (effect.type === 'draw2') return hand.some(c => c.value === 2)
  if (effect.type === 'skip')  return hand.some(c => c.value === 1)
  return false
}

export interface AutoSkipResult {
  engine:  GameState
  skipped: Array<{ playerId: number; pseudo: string }>
}

/**
 * After a play_card creates a pendingEffect, resolve it automatically for every
 * consecutive player who cannot counter (no As for skip, no 2 for draw2).
 * Returns the updated engine + the list of seats that were auto-skipped.
 */
export function resolveAutoSkips(
  engine:       GameState,
  rng:          () => number,
  pseudoBySeat: string[],
): AutoSkipResult {
  const skipped: Array<{ playerId: number; pseudo: string }> = []
  let e = engine
  const maxIter = e.players.length  // safety cap — effect is always cleared after one apply
  let iter = 0

  while (e.pendingEffect && !e.isOver && iter < maxIter) {
    iter++
    const seat   = e.currentPlayerId
    const player = e.players[seat]
    if (!player || canCounter(player.hand, e.pendingEffect)) break
    skipped.push({ playerId: seat, pseudo: pseudoBySeat[seat] ?? 'Joueur' })
    e = applyDraw(e, seat, rng)
  }

  return { engine: e, skipped }
}

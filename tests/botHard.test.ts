import { describe, it, expect } from 'vitest'
import { createInitialState } from '../src/engine/deal'
import { getObservableState } from '../src/ai/observable'
import { createMemory } from '../src/ai/memory'
import { chooseActionHard } from '../src/ai/botHard'
import type { PlayerId } from '../src/engine/types'

// LCG déterministe (mêmes constantes que les autres tests).
function makeLcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

describe('botHard (MCTS)', () => {
  it('renvoie une carte de la main du bot et respecte le budget temps', () => {
    const rng = makeLcg(42)
    const gs = createInitialState(rng, 0)
    const botId = gs.currentPlayer as PlayerId
    const obs = getObservableState(gs, botId)
    const memory = createMemory()

    const t0 = Date.now()
    const action = chooseActionHard(gs, obs, botId, memory, makeLcg(7))
    const elapsed = Date.now() - t0

    expect(action.playerId).toBe(botId)
    // Départ de partie : pas de combo/contre possible → doit jouer une carte.
    expect(action.type).toBe('PLAY_CARD')
    if (action.type === 'PLAY_CARD') {
      const inHand = gs.players[botId].hand.some(
        c => c.suit === action.card.suit && c.value === action.card.value,
      )
      expect(inHand).toBe(true)
    }
    // Timeout dur : 1,5 s + marge.
    expect(elapsed).toBeLessThan(3000)
  })

  it('choisit toujours l\'unique carte quand la main n\'en a qu\'une', () => {
    const rng = makeLcg(1)
    const gs = createInitialState(rng, 0)
    const botId = gs.currentPlayer as PlayerId
    // Réduit la main du bot à une seule carte.
    const oneCard = gs.players[botId].hand[0]
    const players = [...gs.players] as [typeof gs.players[0], typeof gs.players[1]]
    players[botId] = { ...players[botId], hand: [oneCard] }
    const gs1 = { ...gs, players }
    const obs = getObservableState(gs1, botId)

    const action = chooseActionHard(gs1, obs, botId, createMemory(), makeLcg(3))
    expect(action.type).toBe('PLAY_CARD')
    if (action.type === 'PLAY_CARD') {
      expect(action.card.suit).toBe(oneCard.suit)
      expect(action.card.value).toBe(oneCard.value)
    }
  })
})

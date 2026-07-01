import { describe, it, expect } from 'vitest'
import { createInitialState } from '../src/engine/deal'
import { frameFromState, buildReplay, type ReplayStep } from '../src/replay/replay'

function makeLcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

describe('replay', () => {
  it('frameFromState projette un état en frame allégée (sans deck complet)', () => {
    const gs = createInitialState(makeLcg(5), 0)
    const f = frameFromState(gs)
    expect(f.hands[0].length).toBe(gs.players[0].hand.length)
    expect(f.hands[1].length).toBe(gs.players[1].hand.length)
    expect(f.deckCount).toBe(gs.deck.length)
    expect(f.scores).toEqual([0, 0])
    expect(f.phase).toBe(gs.phase)
  })

  it('buildReplay déduit le gagnant à partir des scores finaux', () => {
    const gs = createInitialState(makeLcg(9), 0)
    const frame = frameFromState(gs)
    const steps: ReplayStep[] = [
      { action: { type: 'START' }, frame },
      { action: { type: 'PLAY_CARD', playerId: 0, card: { suit: 'oros', value: 1 } },
        frame: { ...frame, scores: [41, 20] } },
    ]
    const replay = buildReplay(steps, false, 1000)
    expect(replay.winner).toBe(0)
    expect(replay.finalScores).toEqual([41, 20])
    expect(replay.online).toBe(false)
    expect(replay.id).toBe('1000')
  })

  it('buildReplay renvoie winner null en cas d\'égalité', () => {
    const gs = createInitialState(makeLcg(2), 0)
    const frame = { ...frameFromState(gs), scores: [30, 30] as [number, number] }
    const replay = buildReplay([{ action: { type: 'DEAL' }, frame }], false, 42)
    expect(replay.winner).toBeNull()
  })
})

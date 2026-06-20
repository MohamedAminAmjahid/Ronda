import { describe, it, expect } from 'vitest'
import type { Card, Value, Combination } from '../src/engine/types'
import { resolveCapture } from '../src/engine/capture'
import {
  createInitialState2v2,
  startNewDeal2v2,
  applyAction2v2,
  teamOf,
  type GameState2v2,
  type PlayerId2v2,
  type PlayerState2v2,
  type TeamState,
} from '../src/engine2v2/index2v2'
import { getObservableState2v2 } from '../src/ai2v2/observable2v2'
import { createMemory2v2, updateMemory2v2, type AiMemory2v2 } from '../src/ai2v2/memory2v2'
import { chooseAction2v2 } from '../src/ai2v2/bot2v2'

// ── Helpers ─────────────────────────────────────────────────────────────────────

function makeLcg(seed: number): () => number {
  let s = (seed >>> 0) || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function makeCard(value: Value, suit: Card['suit'] = 'oros'): Card {
  return { value, suit }
}

function makePlayer(overrides: Partial<PlayerState2v2> = {}): PlayerState2v2 {
  return {
    hand: [],
    pendingCombo: null,
    declaredCombo: null,
    lostComboRight: false,
    playedThisRound: [],
    ...overrides,
  }
}

function makeTeam(overrides: Partial<TeamState> = {}): TeamState {
  return { captured: [], score: 0, ...overrides }
}

function makeState(overrides: Partial<GameState2v2> = {}): GameState2v2 {
  return {
    players: [makePlayer(), makePlayer(), makePlayer(), makePlayer()],
    teams: [makeTeam(), makeTeam()],
    table: [],
    deck: [],
    currentPlayer: 0,
    dealer: 3,
    phase: 'PLAYING',
    dealNumber: 0,
    roundNumber: 0,
    isMabqach: false,
    lastCapture: null,
    lastPlayed: [null, null, null, null],
    caidaChain: null,
    lastEvents: [],
    eventSeq: 0,
    ...overrides,
  }
}

function freshMemory(state: GameState2v2, playerId: PlayerId2v2): AiMemory2v2 {
  return updateMemory2v2(createMemory2v2(), getObservableState2v2(state, playerId))
}

// ---------------------------------------------------------------------------
// 1. Observable
// ---------------------------------------------------------------------------
describe('ai2v2 — Observable', () => {
  it('masque les mains des autres, expose scores et piles par équipe', () => {
    const st = makeState({
      players: [
        makePlayer({ hand: [makeCard(5), makeCard(3)] }),
        makePlayer({ hand: [makeCard(1)] }),
        makePlayer({ hand: [makeCard(7), makeCard(10)] }),
        makePlayer({ hand: [makeCard(12)] }),
      ],
      teams: [makeTeam({ score: 9, captured: [makeCard(2), makeCard(4)] }), makeTeam({ score: 4 })],
    })
    const obs = getObservableState2v2(st, 0)
    expect(obs.self.hand).toHaveLength(2)
    expect(obs.players[1].handCount).toBe(1)
    expect(obs.players[2].handCount).toBe(2)
    // pas de fuite de main : PlayerPublic2v2 n'a pas de champ "hand"
    expect((obs.players[2] as unknown as { hand?: unknown }).hand).toBeUndefined()
    expect(obs.teamScores).toEqual([9, 4])
    expect(obs.teamCapturedCount).toEqual([2, 0])
    expect(obs.players[2].team).toBe(0) // joueur 2 → équipe A
    expect(obs.players[1].team).toBe(1) // joueur 1 → équipe B
  })
})

// ---------------------------------------------------------------------------
// 2. Capture & caída via le joueur précédent
// ---------------------------------------------------------------------------
describe('ai2v2 — Capture / caída', () => {
  it('capture quand c’est avantageux', () => {
    const st = makeState({
      currentPlayer: 1,
      table: [makeCard(5, 'copas')],
      players: [
        makePlayer({ hand: [makeCard(2)] }),
        makePlayer({ hand: [makeCard(5), makeCard(3)] }),
        makePlayer({ hand: [makeCard(2)] }),
        makePlayer({ hand: [makeCard(2)] }),
      ],
    })
    const action = chooseAction2v2(getObservableState2v2(st, 1), 1, 'easy', freshMemory(st, 1))
    expect(action.type).toBe('PLAY_CARD')
    if (action.type === 'PLAY_CARD') expect(action.card.value).toBe(5)
  })

  it('déclenche une caída sur la carte posée par le joueur précédent', () => {
    // joueur 2 ; précédent = joueur 1 a posé 6-copas.
    const posed = makeCard(6, 'copas')
    const lastPlayed: [Card | null, Card | null, Card | null, Card | null] = [null, posed, null, null]
    const st = makeState({
      currentPlayer: 2,
      table: [posed, makeCard(12, 'bastos')],
      lastPlayed,
      players: [
        makePlayer({ hand: [makeCard(2)] }),
        makePlayer({ hand: [makeCard(2)] }),
        makePlayer({ hand: [makeCard(6, 'oros'), makeCard(2, 'espadas')] }),
        makePlayer({ hand: [makeCard(2)] }),
      ],
    })
    const action = chooseAction2v2(getObservableState2v2(st, 2), 2, 'medium', freshMemory(st, 2))
    expect(action.type).toBe('PLAY_CARD')
    if (action.type === 'PLAY_CARD') {
      const cr = resolveCapture(action.card, st.table, posed)
      expect(cr?.isCaida).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. Heuristique coéquipier (joueur 2)
// ---------------------------------------------------------------------------
describe('ai2v2 — Heuristique coéquipier', () => {
  // Plateau : un 5 (≤6) et un 7 capturables à plat, aucune caída.
  function buildState(currentPlayer: PlayerId2v2): GameState2v2 {
    const hand = [makeCard(5, 'oros'), makeCard(7, 'bastos')]
    const players: [PlayerState2v2, PlayerState2v2, PlayerState2v2, PlayerState2v2] = [
      makePlayer({ hand: [makeCard(2)] }),
      makePlayer({ hand: [makeCard(2)] }),
      makePlayer({ hand: [makeCard(2)] }),
      makePlayer({ hand: [makeCard(2)] }),
    ]
    players[currentPlayer] = makePlayer({ hand })
    return makeState({
      currentPlayer,
      table: [makeCard(5, 'copas'), makeCard(7, 'espadas')],
      players,
    })
  }

  it('un adversaire (joueur 1) prend la capture plate faible (valeur 5)', () => {
    const st = buildState(1)
    const action = chooseAction2v2(getObservableState2v2(st, 1), 1, 'easy', freshMemory(st, 1))
    expect(action.type).toBe('PLAY_CARD')
    if (action.type === 'PLAY_CARD') expect(action.card.value).toBe(5)
  })

  it('le coéquipier (joueur 2) laisse le 5 et prend plutôt le 7', () => {
    const st = buildState(2)
    const action = chooseAction2v2(getObservableState2v2(st, 2), 2, 'easy', freshMemory(st, 2))
    expect(action.type).toBe('PLAY_CARD')
    if (action.type === 'PLAY_CARD') expect(action.card.value).toBe(7) // évite le 5 (pénalité)
  })

  it('le coéquipier prend quand même une valeur ≥10 (Rey)', () => {
    const players: [PlayerState2v2, PlayerState2v2, PlayerState2v2, PlayerState2v2] = [
      makePlayer({ hand: [makeCard(2)] }),
      makePlayer({ hand: [makeCard(2)] }),
      makePlayer({ hand: [makeCard(12, 'oros'), makeCard(2, 'espadas')] }),
      makePlayer({ hand: [makeCard(2)] }),
    ]
    const st = makeState({ currentPlayer: 2, table: [makeCard(12, 'copas')], players })
    const action = chooseAction2v2(getObservableState2v2(st, 2), 2, 'easy', freshMemory(st, 2))
    expect(action.type).toBe('PLAY_CARD')
    if (action.type === 'PLAY_CARD') expect(action.card.value).toBe(12)
  })
})

// ---------------------------------------------------------------------------
// 4. Contre (joueur précédent uniquement)
// ---------------------------------------------------------------------------
describe('ai2v2 — Contre', () => {
  it('conteste un adversaire précédent ayant révélé une paire de même valeur', () => {
    // Ordre anti-horaire : prevPlayer(2) = 3. Le joueur 2 ne peut contester que
    // le joueur 3 (son prédécesseur immédiat), qui est bien un adversaire.
    const posed = makeCard(4, 'bastos')
    const lastPlayed: [Card | null, Card | null, Card | null, Card | null] = [null, null, null, posed]
    const st = makeState({
      currentPlayer: 2,
      table: [posed],
      lastPlayed,
      players: [
        makePlayer({ hand: [makeCard(2)] }),
        makePlayer({ hand: [makeCard(2)] }),
        makePlayer({ hand: [makeCard(10)] }), // contesteur, peu importe sa main
        makePlayer({ hand: [makeCard(2)], playedThisRound: [makeCard(4, 'oros'), makeCard(4, 'bastos')] }),
      ],
    })
    // Mémoire reflétant les 2 cartes de valeur 4 jouées par le joueur 3.
    let mem = createMemory2v2()
    mem = updateMemory2v2(mem, getObservableState2v2(st, 2), { byPlayer: 3, card: makeCard(4, 'oros') })
    mem = updateMemory2v2(mem, getObservableState2v2(st, 2), { byPlayer: 3, card: makeCard(4, 'bastos') })

    const action = chooseAction2v2(getObservableState2v2(st, 2), 2, 'medium', mem)
    expect(action.type).toBe('CONTEST')
    if (action.type === 'CONTEST') {
      expect(action.accusedPlayer).toBe(3)
      expect(action.accusedValue).toBe(4)
      expect(teamOf(action.accusedPlayer)).not.toBe(teamOf(2)) // bien un adversaire
    }
  })

  it('ne conteste pas si une seule carte de la valeur a été révélée', () => {
    const posed = makeCard(4, 'bastos')
    const lastPlayed: [Card | null, Card | null, Card | null, Card | null] = [null, null, null, posed]
    const st = makeState({
      currentPlayer: 2,
      table: [posed],
      lastPlayed,
      players: [
        makePlayer({ hand: [makeCard(2)] }),
        makePlayer({ hand: [makeCard(2)] }),
        makePlayer({ hand: [makeCard(6, 'oros'), makeCard(2, 'espadas')] }),
        makePlayer({ hand: [makeCard(2)] }),
      ],
    })
    let mem = createMemory2v2()
    mem = updateMemory2v2(mem, getObservableState2v2(st, 2), { byPlayer: 3, card: makeCard(4, 'bastos') })
    const action = chooseAction2v2(getObservableState2v2(st, 2), 2, 'medium', mem)
    expect(action.type).not.toBe('CONTEST')
  })
})

// ---------------------------------------------------------------------------
// 5. Intégration : 4 bots jouent des parties complètes sans crash
// ---------------------------------------------------------------------------
describe('ai2v2 — Intégration 4 bots', () => {
  function runGame(seed: number): GameState2v2 {
    const rng = makeLcg(seed)
    let state = createInitialState2v2(rng, 0)
    const mems: AiMemory2v2[] = [
      updateMemory2v2(createMemory2v2(), getObservableState2v2(state, 0)),
      updateMemory2v2(createMemory2v2(), getObservableState2v2(state, 1)),
      updateMemory2v2(createMemory2v2(), getObservableState2v2(state, 2)),
      updateMemory2v2(createMemory2v2(), getObservableState2v2(state, 3)),
    ]

    let moves = 0
    while (state.phase !== 'GAME_OVER' && moves < 5000) {
      if (state.phase === 'DEAL_END') {
        state = startNewDeal2v2(
          {
            scores: [state.teams[0].score, state.teams[1].score],
            dealer: ((state.dealer + 3) % 4) as PlayerId2v2, // anti-horaire
            dealNumber: state.dealNumber + 1,
          },
          rng,
        )
        for (let p = 0 as PlayerId2v2; p < 4; p = (p + 1) as PlayerId2v2) {
          mems[p] = updateMemory2v2(mems[p], getObservableState2v2(state, p))
        }
        moves++
        continue
      }

      const pid = state.currentPlayer
      const action = chooseAction2v2(getObservableState2v2(state, pid), pid, 'medium', mems[pid])
      state = applyAction2v2(state, action, rng)

      const played =
        action.type === 'PLAY_CARD' ? { byPlayer: pid, card: action.card } : undefined
      const contested = action.type === 'CONTEST' ? action.accusedValue : undefined
      for (let p = 0 as PlayerId2v2; p < 4; p = (p + 1) as PlayerId2v2) {
        mems[p] = updateMemory2v2(
          mems[p],
          getObservableState2v2(state, p),
          played,
          p === pid ? contested : undefined,
        )
      }
      moves++
    }
    return state
  }

  it('20 parties Moyen : chacune se termine avec un gagnant à 41', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const final = runGame(seed)
      expect(final.phase).toBe('GAME_OVER')
      const max = Math.max(final.teams[0].score, final.teams[1].score)
      expect(max).toBeGreaterThanOrEqual(41)
    }
  })
})

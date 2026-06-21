import { describe, it, expect } from 'vitest'
import type { Card, GameState, PlayerState, Value, Combination, PlayerId } from '../src/engine/types'
import { applyAction } from '../src/engine/game'
import { createInitialState, startNewDeal } from '../src/engine/deal'
import { getObservableState } from '../src/ai/observable'
import { createMemory, updateMemory } from '../src/ai/memory'
import { scoreMove, discardRisk, endgameAdjustment } from '../src/ai/evaluate'
import { chooseAction } from '../src/ai/bot'
import type { Difficulty } from '../src/ai/bot'
import { resolveCapture } from '../src/engine/capture'

const rngZero = () => 0

// LCG déterministe pour les tests d'intégration
function makeLcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0
    return s / 0xffffffff
  }
}

function makeCard(value: Value, suit: Card['suit'] = 'oros'): Card {
  return { value, suit }
}

function makePlayerState(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    hand: [],
    captured: [],
    score: 0,
    pendingCombo: null,
    declaredCombo: null,
    lostComboRight: false,
    playedThisRound: [],
    ...overrides,
  }
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    deck: [],
    table: [],
    players: [makePlayerState(), makePlayerState()],
    currentPlayer: 0,
    dealer: 1,
    phase: 'PLAYING',
    roundNumber: 0,
    dealNumber: 0,
    isMabqach: false,
    lastCapture: null,
    caidaChain: null,
    pendingCaidaCard: null,
    lastPlayed: [null, null],
    lastEvents: [],
    eventSeq: 0,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Helpers de setup pour les tests bot
// ---------------------------------------------------------------------------

function makeObsAndMemory(state: GameState, botId: 0 | 1) {
  const obs = getObservableState(state, botId)
  let mem = createMemory()
  mem = updateMemory(mem, obs)
  return { obs, mem }
}

// ---------------------------------------------------------------------------
// 1. Bot choisit un coup capturant
// ---------------------------------------------------------------------------
describe('1. Bot choisit un coup capturant', () => {
  it('prefere capturer plutot que poser sur la table', () => {
    const state = makeGameState({
      table: [makeCard(5, 'copas')],
      players: [
        makePlayerState({ hand: [makeCard(5), makeCard(3)] }),
        makePlayerState({ hand: [makeCard(1)] }),
      ],
    })
    const { obs, mem } = makeObsAndMemory(state, 0)
    const action = chooseAction(obs, 0, 'easy', mem)
    expect(action.type).toBe('PLAY_CARD')
    if (action.type === 'PLAY_CARD') expect(action.card.value).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// 2. Bot prefere le coup capturant le plus de cartes (escalier)
// ---------------------------------------------------------------------------
describe('2. Bot prefere le coup capturant le plus de cartes', () => {
  it('joue la carte qui declenche un escalier', () => {
    // Table : 7:copas, 10:bastos, 11:espadas
    // Main : 7:oros (capture 3 cartes via escalier), 12 (capture 0)
    const state = makeGameState({
      table: [makeCard(7, 'copas'), makeCard(10, 'bastos'), makeCard(11, 'espadas')],
      players: [
        makePlayerState({ hand: [makeCard(7), makeCard(12)] }),
        makePlayerState({ hand: [makeCard(1)] }),
      ],
    })
    const { obs, mem } = makeObsAndMemory(state, 0)
    const action = chooseAction(obs, 0, 'easy', mem)
    expect(action.type).toBe('PLAY_CARD')
    if (action.type === 'PLAY_CARD') expect(action.card.value).toBe(7)
  })
})

// ---------------------------------------------------------------------------
// 3. Bot prend une caida
// ---------------------------------------------------------------------------
describe('3. Bot prend une caida', () => {
  it('capture la carte exacte posee par adversaire (caida, bonus +3 heuristique)', () => {
    const oppCard = makeCard(6, 'copas')
    const state = makeGameState({
      table: [oppCard],
      players: [
        makePlayerState({ hand: [makeCard(6), makeCard(3)] }),
        makePlayerState({ hand: [makeCard(1)] }),
      ],
      lastPlayed: [null, oppCard],
    })
    const { obs, mem } = makeObsAndMemory(state, 0)
    const action = chooseAction(obs, 0, 'easy', mem)
    expect(action.type).toBe('PLAY_CARD')
    if (action.type === 'PLAY_CARD') {
      const cr = resolveCapture(action.card, state.table, oppCard)
      expect(cr?.isCaida).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// 4. Bot prend une missa
// ---------------------------------------------------------------------------
describe('4. Bot prend une missa', () => {
  it('capture la seule carte de la table (balayage)', () => {
    const state = makeGameState({
      table: [makeCard(4, 'copas')],
      players: [
        makePlayerState({ hand: [makeCard(4), makeCard(2)] }),
        makePlayerState({ hand: [makeCard(1)] }),
      ],
    })
    const { obs, mem } = makeObsAndMemory(state, 0)
    const action = chooseAction(obs, 0, 'easy', mem)
    expect(action.type).toBe('PLAY_CARD')
    if (action.type === 'PLAY_CARD') {
      const cr = resolveCapture(action.card, state.table, null)
      expect(cr?.isMissa).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// 5. Bot declare une tringa systematiquement
// ---------------------------------------------------------------------------
describe('5. Bot declare une tringa', () => {
  it('declare toujours une tringa (easy)', () => {
    const tringa: Combination = {
      type: 'tringa', value: 4,
      cards: [makeCard(4), makeCard(4, 'copas'), makeCard(4, 'espadas')],
    }
    const state = makeGameState({
      players: [
        makePlayerState({
          hand: [makeCard(4), makeCard(4, 'copas'), makeCard(4, 'espadas')],
          pendingCombo: tringa,
        }),
        makePlayerState({ hand: [makeCard(1)] }),
      ],
    })
    const { obs, mem } = makeObsAndMemory(state, 0)
    const action = chooseAction(obs, 0, 'easy', mem)
    expect(action.type).toBe('DECLARE')
  })

  it('declare toujours une tringa (medium)', () => {
    const tringa: Combination = {
      type: 'tringa', value: 1,
      cards: [makeCard(1), makeCard(1, 'copas'), makeCard(1, 'espadas')],
    }
    const state = makeGameState({
      players: [
        makePlayerState({
          hand: [makeCard(1), makeCard(1, 'copas'), makeCard(1, 'espadas')],
          pendingCombo: tringa,
        }),
        makePlayerState({ hand: [makeCard(2)] }),
      ],
    })
    const { obs, mem } = makeObsAndMemory(state, 0)
    const action = chooseAction(obs, 0, 'medium', mem)
    expect(action.type).toBe('DECLARE')
  })
})

// ---------------------------------------------------------------------------
// 6. Bot declare une ronda haute / dissimule une ronda basse (medium)
// ---------------------------------------------------------------------------
describe('6. Ronda : declaration vs dissimulation', () => {
  it('easy : declare toujours sa ronda', () => {
    const ronda: Combination = {
      type: 'ronda', value: 1, cards: [makeCard(1), makeCard(1, 'copas')],
    }
    const state = makeGameState({
      players: [
        makePlayerState({
          hand: [makeCard(1), makeCard(1, 'copas'), makeCard(7)],
          pendingCombo: ronda,
        }),
        makePlayerState({ hand: [makeCard(2)] }),
      ],
    })
    const { obs, mem } = makeObsAndMemory(state, 0)
    const action = chooseAction(obs, 0, 'easy', mem)
    expect(action.type).toBe('DECLARE')
  })

  it('medium : declare une ronda de 12 (aucune plus haute possible)', () => {
    const ronda: Combination = {
      type: 'ronda', value: 12, cards: [makeCard(12), makeCard(12, 'copas')],
    }
    const state = makeGameState({
      players: [
        makePlayerState({
          hand: [makeCard(12), makeCard(12, 'copas'), makeCard(7)],
          pendingCombo: ronda,
        }),
        makePlayerState({ hand: [makeCard(2)] }),
      ],
    })
    const { obs, mem } = makeObsAndMemory(state, 0)
    // Marquer les 12 de espadas et bastos comme vus pour que pHigherRonda = 0
    const memWithSeen = updateMemory(mem, obs, { byPlayer: 1, card: makeCard(12, 'espadas') })
    const action = chooseAction(obs, 0, 'medium', memWithSeen)
    expect(action.type).toBe('DECLARE')
  })

  it('medium : dissimule une ronda de 1 si plusieurs valeurs superieures inconnues', () => {
    const ronda: Combination = {
      type: 'ronda', value: 1, cards: [makeCard(1), makeCard(1, 'copas')],
    }
    const state = makeGameState({
      players: [
        makePlayerState({
          hand: [makeCard(1), makeCard(1, 'copas'), makeCard(7)],
          pendingCombo: ronda,
        }),
        makePlayerState({ hand: [makeCard(2)] }),
      ],
    })
    const { obs, mem } = makeObsAndMemory(state, 0)
    // Memoire fraiche : toutes les valeurs > 1 sont potentiellement en mains inconnues
    const action = chooseAction(obs, 0, 'medium', mem)
    // Avec pHigherRonda > 0.25, le bot doit dissimuler -> PLAY_CARD
    expect(action.type).toBe('PLAY_CARD')
  })
})

// ---------------------------------------------------------------------------
// 7. Bot conteste une paire de la meme main
// ---------------------------------------------------------------------------
describe('7. Bot conteste une paire de la meme redistribution', () => {
  it('conteste quand opponent a joue 2 cartes de meme valeur dans cette main', () => {
    const state = makeGameState({
      table: [makeCard(2)],
      players: [
        makePlayerState({ hand: [makeCard(3)] }),
        makePlayerState({ hand: [makeCard(6)] }),
      ],
      lastPlayed: [null, makeCard(4, 'copas')],
    })
    const { obs } = makeObsAndMemory(state, 0)

    // Simuler que l'adversaire a deja joue un 4:oros dans cette main
    let mem = createMemory()
    mem = updateMemory(mem, obs)
    // Ajouter la premiere carte de valeur 4 jouee par adversaire
    mem = updateMemory(mem, obs, { byPlayer: 1, card: makeCard(4, 'oros') })
    // Ajouter la deuxieme (la carte revelatrice : 4:copas)
    mem = updateMemory(mem, obs, { byPlayer: 1, card: makeCard(4, 'copas') })

    const action = chooseAction(obs, 0, 'easy', mem)
    expect(action.type).toBe('CONTEST')
    if (action.type === 'CONTEST') expect(action.accusedValue).toBe(4)
  })

  it('ne conteste pas deux fois la meme valeur (contestedValues)', () => {
    const state = makeGameState({
      table: [makeCard(2)],
      players: [
        makePlayerState({ hand: [makeCard(3)] }),
        makePlayerState({ hand: [makeCard(6)] }),
      ],
      lastPlayed: [null, makeCard(4, 'copas')],
    })
    const { obs } = makeObsAndMemory(state, 0)

    let mem = createMemory()
    mem = updateMemory(mem, obs)
    mem = updateMemory(mem, obs, { byPlayer: 1, card: makeCard(4, 'oros') })
    mem = updateMemory(mem, obs, { byPlayer: 1, card: makeCard(4, 'copas') })
    // Marquer la valeur 4 comme deja contestee
    mem = updateMemory(mem, obs, undefined, 4 as Value)

    const action = chooseAction(obs, 0, 'easy', mem)
    expect(action.type).not.toBe('CONTEST')
  })
})

// ---------------------------------------------------------------------------
// 8. Bot ne conteste PAS deux cartes de mains differentes
// ---------------------------------------------------------------------------
describe('8. Bot ne conteste pas des cartes de mains differentes', () => {
  it('ne conteste pas si seulement 1 carte de cette valeur dans la main courante', () => {
    // La premiere carte de valeur 4 venait de la DERNIERE redistribution,
    // donc currentHandPlays[opponent] ne contient que 4:copas (1 carte)
    const state = makeGameState({
      table: [makeCard(2)],
      players: [
        makePlayerState({ hand: [makeCard(3)] }),
        makePlayerState({ hand: [makeCard(6)] }),
      ],
      lastPlayed: [null, makeCard(4, 'copas')],
    })
    const { obs } = makeObsAndMemory(state, 0)

    // Simule: la redistribution vient d'avoir lieu (currentHandPlays reset)
    // Une seule carte de valeur 4 jouee dans cette main
    let mem = createMemory()
    mem = updateMemory(mem, obs)
    mem = updateMemory(mem, obs, { byPlayer: 1, card: makeCard(4, 'copas') })
    // currentHandPlays[1] = [4:copas] → count = 1 → pas de contre

    const action = chooseAction(obs, 0, 'easy', mem)
    expect(action.type).not.toBe('CONTEST')
  })
})

// ---------------------------------------------------------------------------
// 9. Mab9ach : bot prefere capturer avec un 12
// ---------------------------------------------------------------------------
describe('9. Mab9ach : bot donneur prefere un 12 pour la derniere prise', () => {
  it('en Mab9ach, last card, choisit le 12 sur une autre capture', () => {
    // Bot est donneur (currentPlayer === dealer), 1 seule carte en main,
    // la table a des 12 et des 7 (les deux peuvent etre capturés)
    const state = makeGameState({
      table: [makeCard(12, 'copas'), makeCard(7, 'bastos')],
      dealer: 0,
      currentPlayer: 0,
      isMabqach: true,
      players: [
        makePlayerState({ hand: [makeCard(12)] }),  // seule carte : 12
        makePlayerState({ hand: [] }),
      ],
    })
    const { obs, mem } = makeObsAndMemory(state, 0)
    const crWith12 = resolveCapture(makeCard(12), state.table, null)
    const crWith7 = resolveCapture(makeCard(7), state.table, null)

    const s12 = scoreMove(makeCard(12), crWith12, obs, mem, 'medium')
    const s7 = scoreMove(makeCard(7), crWith7, obs, mem, 'medium')
    expect(s12).toBeGreaterThan(s7)
  })
})

// ---------------------------------------------------------------------------
// 10. Bot n'accede jamais a players[opp].hand
// ---------------------------------------------------------------------------
describe("10. ObservableOpponent n'expose pas la main adverse", () => {
  it("le champ hand n'existe pas dans ObservableOpponent", () => {
    const state = makeGameState({
      players: [
        makePlayerState({ hand: [makeCard(1)] }),
        makePlayerState({ hand: [makeCard(12), makeCard(11)] }),
      ],
    })
    const obs = getObservableState(state, 0)
    expect('hand' in obs.opponent).toBe(false)
    expect(obs.opponent.handCount).toBe(2)
  })

  it("chooseAction peut tourner sans crash quand main adverse non vide", () => {
    const state = makeGameState({
      table: [makeCard(3, 'copas')],
      players: [
        makePlayerState({ hand: [makeCard(3)] }),
        makePlayerState({ hand: [makeCard(12), makeCard(11)] }),
      ],
    })
    const { obs, mem } = makeObsAndMemory(state, 0)
    expect(() => chooseAction(obs, 0, 'easy', mem)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 11. Determinisme
// ---------------------------------------------------------------------------
describe('11. Determinisme', () => {
  it('avec le meme RNG et memoire, chooseAction renvoie toujours le meme coup', () => {
    const state = makeGameState({
      table: [makeCard(5, 'copas'), makeCard(7, 'bastos')],
      players: [
        makePlayerState({ hand: [makeCard(5), makeCard(7), makeCard(2)] }),
        makePlayerState({ hand: [makeCard(1)] }),
      ],
    })
    const { obs, mem } = makeObsAndMemory(state, 0)

    const a1 = chooseAction(obs, 0, 'medium', mem)
    const a2 = chooseAction(obs, 0, 'medium', mem)
    expect(a1).toEqual(a2)
  })
})

// ---------------------------------------------------------------------------
// 12. Integration bot-vs-bot : plusieurs centaines de parties completes
// ---------------------------------------------------------------------------
describe('12. Integration bot-vs-bot', () => {
  function runGame(seed: number, diffA: Difficulty, diffB: Difficulty): GameState {
    const rng = makeLcg(seed)
    let state = createInitialState(rng)

    let memA = updateMemory(createMemory(), getObservableState(state, 0))
    let memB = updateMemory(createMemory(), getObservableState(state, 1))

    const MAX_MOVES = 2000
    let moves = 0

    while (state.phase !== 'GAME_OVER' && moves < MAX_MOVES) {
      // DEAL_END : lancer la donne suivante sans action du joueur
      if (state.phase === 'DEAL_END') {
        state = startNewDeal(
          {
            scores: [state.players[0].score, state.players[1].score],
            dealer: (1 - state.dealer) as PlayerId,
            dealNumber: state.dealNumber + 1,
          },
          rng,
        )
        moves++
        continue
      }

      const botId = state.currentPlayer as 0 | 1
      const diff = botId === 0 ? diffA : diffB
      const mem = botId === 0 ? memA : memB

      const obs = getObservableState(state, botId)
      const action = chooseAction(obs, botId, diff, mem)
      const newState = applyAction(state, action, rng)

      const newObsA = getObservableState(newState, 0)
      const newObsB = getObservableState(newState, 1)

      const playedCard =
        action.type === 'PLAY_CARD'
          ? { byPlayer: botId as PlayerId, card: action.card }
          : undefined
      const contestedVal =
        action.type === 'CONTEST' ? action.accusedValue : undefined

      memA = updateMemory(memA, newObsA, playedCard, botId === 0 ? contestedVal : undefined)
      memB = updateMemory(memB, newObsB, playedCard, botId === 1 ? contestedVal : undefined)

      state = newState
      moves++
    }

    return state
  }

  it('100 parties Facile vs Moyen : aucun crash, chaque partie a un gagnant a 41', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const finalState = runGame(seed, 'easy', 'medium')
      expect(finalState.phase).toBe('GAME_OVER')
      const winner =
        finalState.players[0].score >= 41
          ? finalState.players[0]
          : finalState.players[1]
      expect(winner.score).toBeGreaterThanOrEqual(41)
    }
  })

  it('50 parties Moyen vs Moyen : toutes terminees avec un gagnant', () => {
    for (let seed = 200; seed <= 249; seed++) {
      const finalState = runGame(seed, 'medium', 'medium')
      expect(finalState.phase).toBe('GAME_OVER')
    }
  })

  it('determinisme : meme seed donne exactement le meme resultat', () => {
    const s1 = runGame(42, 'easy', 'medium')
    const s2 = runGame(42, 'easy', 'medium')
    expect(s1.players[0].score).toBe(s2.players[0].score)
    expect(s1.players[1].score).toBe(s2.players[1].score)
  })
})

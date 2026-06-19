import { describe, it, expect } from 'vitest'
import type { Card, GameState, PlayerState, Value, Combination } from '../src/engine/types'
import { resolveCapture } from '../src/engine/capture'
import {
  detectCombination,
  resolveConflict,
  basePoints,
  resolveContest,
} from '../src/engine/combinations'
import { mabqachBonus, cardCountBonus, isGameOver, applyEndOfDeal } from '../src/engine/scoring'
import { applyAction } from '../src/engine/game'

const rngZero = () => 0

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
    lastPlayed: [null, null],
    lastEvents: [],
    eventSeq: 0,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 1. Capture simple
// ---------------------------------------------------------------------------
describe('1. Capture simple', () => {
  it('capture une carte de meme valeur sur la table', () => {
    const played = makeCard(5)
    const tableCard = makeCard(5, 'copas')
    const result = resolveCapture(played, [tableCard], null)
    expect(result).not.toBeNull()
    expect(result!.captured).toHaveLength(1)
    expect(result!.captured[0]).toEqual(tableCard)
    expect(result!.tableAfter).toHaveLength(0)
  })

  it('retourne null si aucune carte de meme valeur', () => {
    const result = resolveCapture(makeCard(3), [makeCard(7)], null)
    expect(result).toBeNull()
  })

  it('plusieurs cartes de meme valeur : capture automatiquement la premiere', () => {
    const table = [makeCard(4, 'oros'), makeCard(4, 'copas'), makeCard(6)]
    const result = resolveCapture(makeCard(4, 'espadas'), table, null)
    expect(result).not.toBeNull()
    expect(result!.captured).toHaveLength(1)
    // une carte de valeur 4 reste + la 6
    expect(result!.tableAfter).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// 2. Escalier dont 7 -> 10
// ---------------------------------------------------------------------------
describe('2. Escalier 7 -> 10', () => {
  it('capture 7 puis 10, 11 en escalier', () => {
    const table = [makeCard(7, 'copas'), makeCard(10, 'bastos'), makeCard(11, 'espadas')]
    const result = resolveCapture(makeCard(7), table, null)
    expect(result).not.toBeNull()
    expect(result!.captured).toHaveLength(3)
    expect(result!.captured.map(c => c.value)).toEqual([7, 10, 11])
    expect(result!.tableAfter).toHaveLength(0)
  })

  it("l'escalier s'arrete si un maillon manque", () => {
    const table = [makeCard(7, 'copas'), makeCard(11)]
    const result = resolveCapture(makeCard(7), table, null)
    expect(result!.captured).toHaveLength(1)
    expect(result!.tableAfter).toHaveLength(1)
  })

  it('sequence complete 1->2->3 en escalier', () => {
    const table = [makeCard(1, 'copas'), makeCard(2, 'bastos'), makeCard(3, 'espadas')]
    const result = resolveCapture(makeCard(1), table, null)
    expect(result!.captured).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// 3. Caida -> +1
// ---------------------------------------------------------------------------
describe('3. Caida', () => {
  it('capture la carte exacte posee par adversaire -> isCaida true', () => {
    const opponentCard = makeCard(6, 'copas')
    const result = resolveCapture(makeCard(6), [opponentCard], opponentCard)
    expect(result!.isCaida).toBe(true)
  })

  it('meme valeur mais couleur differente -> pas de caida', () => {
    const opponentCard = makeCard(6, 'copas')
    const tableCard = makeCard(6, 'espadas')
    const result = resolveCapture(makeCard(6), [tableCard], opponentCard)
    expect(result!.isCaida).toBe(false)
  })

  it('isCaida false si lastPlayedByOpponent est null', () => {
    const tableCard = makeCard(6, 'copas')
    const result = resolveCapture(makeCard(6), [tableCard], null)
    expect(result!.isCaida).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 4. Missa -> +1
// ---------------------------------------------------------------------------
describe('4. Missa (balayage)', () => {
  it('vide la table -> isMissa true', () => {
    const result = resolveCapture(makeCard(3), [makeCard(3, 'copas')], null)
    expect(result!.isMissa).toBe(true)
    expect(result!.tableAfter).toHaveLength(0)
  })

  it('ne vide pas la table -> isMissa false', () => {
    const table = [makeCard(3, 'copas'), makeCard(7)]
    const result = resolveCapture(makeCard(3), table, null)
    expect(result!.isMissa).toBe(false)
    expect(result!.tableAfter).toHaveLength(1)
  })

  it('caida + missa cumules sur le meme coup', () => {
    const opponentCard = makeCard(5, 'oros')
    const result = resolveCapture(makeCard(5), [opponentCard], opponentCard)
    expect(result!.isCaida).toBe(true)
    expect(result!.isMissa).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 5. Ronda = 1 pt, Tringa = 5 pts
// ---------------------------------------------------------------------------
describe('5. Ronda et Tringa', () => {
  it('detecte une ronda (2 cartes de meme valeur)', () => {
    const hand = [makeCard(4), makeCard(4, 'copas'), makeCard(7)]
    const combo = detectCombination(hand)
    expect(combo).not.toBeNull()
    expect(combo!.type).toBe('ronda')
    expect(combo!.value).toBe(4)
    expect(basePoints(combo!)).toBe(1)
  })

  it('detecte une tringa (3 cartes de meme valeur)', () => {
    const hand = [makeCard(4), makeCard(4, 'copas'), makeCard(4, 'espadas')]
    const combo = detectCombination(hand)
    expect(combo!.type).toBe('tringa')
    expect(basePoints(combo!)).toBe(5)
  })

  it('aucune combinaison si toutes valeurs differentes', () => {
    const hand = [makeCard(1), makeCard(2), makeCard(3)]
    expect(detectCombination(hand)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 6. Declaration retardee + perte du droit
// ---------------------------------------------------------------------------
describe('6. Declaration retardee', () => {
  it('jouer une carte de la combo sans declarer -> lostComboRight true', () => {
    const comboCard1 = makeCard(4, 'oros')
    const comboCard2 = makeCard(4, 'copas')
    const otherCard = makeCard(7)

    const state = makeGameState({
      table: [makeCard(2, 'espadas')],
      players: [
        makePlayerState({
          hand: [comboCard1, comboCard2, otherCard],
          pendingCombo: { type: 'ronda', value: 4, cards: [comboCard1, comboCard2] },
        }),
        makePlayerState({ hand: [makeCard(1)] }),
      ],
    })

    const next = applyAction(
      state,
      { type: 'PLAY_CARD', playerId: 0, card: comboCard1 },
      rngZero,
    )
    expect(next.players[0].lostComboRight).toBe(true)
  })

  it('declarer avant de jouer conserve le droit et marque le point', () => {
    const comboCard1 = makeCard(4, 'oros')
    const comboCard2 = makeCard(4, 'copas')
    const combo: Combination = { type: 'ronda', value: 4, cards: [comboCard1, comboCard2] }
    const state = makeGameState({
      players: [
        makePlayerState({ hand: [comboCard1, comboCard2, makeCard(7)], pendingCombo: combo }),
        makePlayerState({ hand: [makeCard(1)] }),
      ],
    })
    const after = applyAction(state, { type: 'DECLARE', playerId: 0, combination: combo }, rngZero)
    expect(after.players[0].lostComboRight).toBe(false)
    expect(after.players[0].declaredCombo).not.toBeNull()
    expect(after.players[0].score).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 7. Conflit de combinaisons
// ---------------------------------------------------------------------------
describe('7. Conflit de combinaisons', () => {
  it("deux rondas : la plus haute gagne 2 points, l'autre 0", () => {
    const rondaHigh: Combination = {
      type: 'ronda', value: 10, cards: [makeCard(10), makeCard(10, 'copas')],
    }
    const rondaLow: Combination = {
      type: 'ronda', value: 4, cards: [makeCard(4), makeCard(4, 'copas')],
    }
    const { winner, pointsA, pointsB } = resolveConflict(rondaHigh, rondaLow)
    expect(winner).toBe(0)
    expect(pointsA).toBe(2)
    expect(pointsB).toBe(0)
  })

  it('tringa contre ronda : tringa gagne 6 points', () => {
    const tringa: Combination = {
      type: 'tringa', value: 4,
      cards: [makeCard(4), makeCard(4, 'copas'), makeCard(4, 'espadas')],
    }
    const ronda: Combination = {
      type: 'ronda', value: 12, cards: [makeCard(12), makeCard(12, 'copas')],
    }
    const { winner, pointsA, pointsB } = resolveConflict(tringa, ronda)
    expect(winner).toBe(0)
    expect(pointsA).toBe(6)
    expect(pointsB).toBe(0)
  })

  it('via DECLARE : conflit resolu, gagnant recoit les 2 points', () => {
    const rondaA: Combination = { type: 'ronda', value: 10, cards: [makeCard(10), makeCard(10, 'copas')] }
    const rondaB: Combination = { type: 'ronda', value: 4, cards: [makeCard(4), makeCard(4, 'copas')] }

    const state = makeGameState({
      players: [
        makePlayerState({ hand: [makeCard(10), makeCard(10, 'copas'), makeCard(7)], pendingCombo: rondaA }),
        makePlayerState({
          hand: [makeCard(4), makeCard(4, 'copas'), makeCard(1)],
          pendingCombo: rondaB,
          score: 1,
          declaredCombo: rondaB,
        }),
      ],
    })

    const after = applyAction(state, { type: 'DECLARE', playerId: 0, combination: rondaA }, rngZero)
    expect(after.players[0].score).toBe(2)
    expect(after.players[1].score).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 8. Contre-ronda
// ---------------------------------------------------------------------------
describe('8. Contre-ronda', () => {
  it('contre correct : contesteur gagne 1 point', () => {
    const played = [makeCard(4, 'oros'), makeCard(4, 'copas')]
    const { contestorDelta, wasCorrect } = resolveContest(4, played, [])
    expect(wasCorrect).toBe(true)
    expect(contestorDelta).toBe(1)
  })

  it('contre a tort : contesteur perd 1 point', () => {
    const played = [makeCard(4, 'oros')]
    const { contestorDelta, wasCorrect } = resolveContest(4, played, [])
    expect(wasCorrect).toBe(false)
    expect(contestorDelta).toBe(-1)
  })

  it('via CONTEST : score contesteur incremente si correct', () => {
    const state = makeGameState({
      players: [
        makePlayerState({ score: 5 }),
        makePlayerState({ playedThisRound: [makeCard(4, 'oros'), makeCard(4, 'copas')] }),
      ],
    })
    const after = applyAction(state, { type: 'CONTEST', playerId: 0, accusedValue: 4 }, rngZero)
    expect(after.players[0].score).toBe(6)
  })

  it('via CONTEST a tort : contesteur perd 1', () => {
    const state = makeGameState({
      players: [
        makePlayerState({ score: 5 }),
        makePlayerState({ playedThisRound: [makeCard(4, 'oros')] }),
      ],
    })
    const after = applyAction(state, { type: 'CONTEST', playerId: 0, accusedValue: 4 }, rngZero)
    expect(after.players[0].score).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// 9. Mab9ach
// ---------------------------------------------------------------------------
describe('9. Mab9ach', () => {
  it('derniere prise Rey (12) -> +5 pour le donneur', () => {
    expect(mabqachBonus(makeCard(12))).toBe(5)
  })

  it('derniere prise As (1) -> -5 pour le donneur', () => {
    expect(mabqachBonus(makeCard(1))).toBe(-5)
  })

  it('aucune prise -> -5 pour le donneur', () => {
    expect(mabqachBonus(null)).toBe(-5)
  })

  it('autre valeur (ex. 7) -> 0', () => {
    expect(mabqachBonus(makeCard(7))).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 10. Decompte > 20
// ---------------------------------------------------------------------------
describe('10. Decompte des cartes', () => {
  it('23 capturees -> +3', () => {
    const [bA, bB] = cardCountBonus(23, 17)
    expect(bA).toBe(3)
    expect(bB).toBe(0)
  })

  it('egalite 20-20 -> personne ne marque', () => {
    const [bA, bB] = cardCountBonus(20, 20)
    expect(bA).toBe(0)
    expect(bB).toBe(0)
  })

  it('les deux depassent 20 -> chacun son bonus', () => {
    const [bA, bB] = cardCountBonus(25, 22)
    expect(bA).toBe(5)
    expect(bB).toBe(2)
  })

  it('aucun ne depasse 20 -> 0', () => {
    const [bA, bB] = cardCountBonus(18, 19)
    expect(bA).toBe(0)
    expect(bB).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 11. Multi-donnes : donneur alterne, scores cumules
// ---------------------------------------------------------------------------
describe('11. Multi-donnes', () => {
  it('apres une donne sans 41, le donneur alterne et les scores sont conserves', () => {
    // Donneur = 1, sa derniere prise = carte 7 -> bonus Mab9ach = 0
    // Joueur 1 : 22 capturees -> bonus decompte +2
    const captured22 = Array.from({ length: 22 }, () => makeCard(1))
    const captured18 = Array.from({ length: 18 }, () => makeCard(1))

    const state = makeGameState({
      deck: [],
      table: [],
      phase: 'PLAYING',
      dealer: 1,
      isMabqach: true,
      lastCapture: { playerId: 1, card: makeCard(7) },
      players: [
        makePlayerState({ score: 10, captured: captured18 }),
        makePlayerState({ score: 8, captured: captured22 }),
      ],
    })

    const next = applyEndOfDeal(state, rngZero)

    // Phase recalculee en PLAYING (pas encore 41)
    expect(next.phase).toBe('PLAYING')
    // Donneur alterne : 1 -> 0
    expect(next.dealer).toBe(0)
    // Numero de donne incremente
    expect(next.dealNumber).toBe(1)
    // Score joueur 1 : 8 + 2 (decompte 22 cartes) = 10
    expect(next.players[1].score).toBe(10)
    // Score joueur 0 : 10 + 0 = 10
    expect(next.players[0].score).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// 12. Victoire a 41 points
// ---------------------------------------------------------------------------
describe('12. Victoire a 41', () => {
  it('un joueur a >= 41 -> phase GAME_OVER', () => {
    // Donneur = 0, capture la derniere carte avec Rey (12) -> +5
    const captured20 = Array.from({ length: 20 }, () => makeCard(1))

    const state = makeGameState({
      deck: [],
      table: [],
      phase: 'PLAYING',
      dealer: 0,
      isMabqach: true,
      lastCapture: { playerId: 0, card: makeCard(12) },
      players: [
        makePlayerState({ score: 36, captured: captured20 }),
        makePlayerState({ score: 5, captured: captured20 }),
      ],
    })

    const next = applyEndOfDeal(state, rngZero)

    expect(next.phase).toBe('GAME_OVER')
    expect(next.players[0].score).toBe(41)
  })

  it('isGameOver true des que >= 41', () => {
    expect(isGameOver([41, 10])).toBe(true)
    expect(isGameOver([10, 41])).toBe(true)
    expect(isGameOver([40, 40])).toBe(false)
    expect(isGameOver([0, 0])).toBe(false)
  })
})

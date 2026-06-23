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
import { isTableValid, createInitialState, startNewDeal } from '../src/engine/deal'

const rngZero = () => 0

// LCG déterministe pour exercer la distribution sur de nombreux seeds.
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

  it('carte sur table depuis le debut, adversaire n a pas joue de 4 au dernier tour -> isCaida false', () => {
    // La table contient un 4 de oros depuis le debut de la manche.
    // L'adversaire a joue un 7 (pas un 4) a son dernier tour.
    // Le joueur capture ce 4 : il ne doit pas y avoir de caida.
    const tableCard        = makeCard(4, 'oros')
    const opponentLastPlay = makeCard(7, 'copas')
    const result = resolveCapture(makeCard(4, 'espadas'), [tableCard], opponentLastPlay)
    expect(result!.isCaida).toBe(false)
  })

  it('adversaire a capture avec un 4, pas pose : pas de caida sur un autre 4 restant', () => {
    // L'adversaire a joue 4 bastos (qui a capture 4 oros).
    // Il reste 4 copas sur la table (carte ancienne).
    // Le joueur capture 4 copas : pas de caida car ce n'est pas la carte posee par l'adversaire.
    const tableCard        = makeCard(4, 'copas')
    const opponentLastPlay = makeCard(4, 'bastos')   // a capture, pas pose
    const result = resolveCapture(makeCard(4, 'espadas'), [tableCard], opponentLastPlay)
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

  it('caida qui vide la table -> missa (la carte joueuse reste en appat)', () => {
    // Correction : sur une caida, si la table est videe par la capture (avant que
    // la carte joueuse n'y soit rajoutee), c'est aussi une missa (+1).
    const opponentCard = makeCard(5, 'oros')
    const result = resolveCapture(makeCard(5, 'copas'), [opponentCard], opponentCard)
    expect(result!.isCaida).toBe(true)
    expect(result!.isMissa).toBe(true)
    expect(result!.captured).toEqual([opponentCard])
    expect(result!.remainsOnTable).toEqual(makeCard(5, 'copas'))
    expect(result!.tableAfter).toEqual([]) // la carte joueuse est ajoutee par applyPlayCard
  })

  it('caida qui ne vide PAS la table -> pas de missa', () => {
    const opponentCard = makeCard(5, 'oros')
    const result = resolveCapture(makeCard(5, 'copas'), [opponentCard, makeCard(12, 'bastos')], opponentCard)
    expect(result!.isCaida).toBe(true)
    expect(result!.isMissa).toBe(false)
    expect(result!.tableAfter).toEqual([makeCard(12, 'bastos')])
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

  it('Tringa(10) bat Ronda(12) — la tringa gagne quelle que soit la valeur', () => {
    const tringa10: Combination = {
      type: 'tringa', value: 10,
      cards: [makeCard(10), makeCard(10, 'copas'), makeCard(10, 'espadas')],
    }
    const ronda12: Combination = {
      type: 'ronda', value: 12, cards: [makeCard(12), makeCard(12, 'copas')],
    }
    const { winner, pointsA, pointsB } = resolveConflict(tringa10, ronda12)
    expect(winner).toBe(0)   // la tringa (comboA) gagne
    expect(pointsA).toBe(6)
    expect(pointsB).toBe(0)
  })

  it('via DECLARE : le bot (player 1) declare Ronda(12) en 2e, le joueur garde sa Tringa(10)', () => {
    // Scenario exact du bug : joueur 0 a deja declare une Tringa(10) (+5).
    // Le bot (player 1) declare ensuite une Ronda(12) -> la Tringa doit gagner.
    const tringa10: Combination = {
      type: 'tringa', value: 10,
      cards: [makeCard(10), makeCard(10, 'copas'), makeCard(10, 'espadas')],
    }
    const ronda12: Combination = {
      type: 'ronda', value: 12, cards: [makeCard(12), makeCard(12, 'copas')],
    }
    const state = makeGameState({
      players: [
        makePlayerState({
          hand: [makeCard(10), makeCard(10, 'copas'), makeCard(10, 'espadas')],
          pendingCombo: tringa10,
          declaredCombo: tringa10,
          score: 5,
        }),
        makePlayerState({
          hand: [makeCard(12), makeCard(12, 'copas'), makeCard(7)],
          pendingCombo: ronda12,
          score: 0,
        }),
      ],
    })

    const after = applyAction(state, { type: 'DECLARE', playerId: 1, combination: ronda12 }, rngZero)
    expect(after.players[0].score).toBe(6) // Tringa du joueur : 5 + 1 = 6
    expect(after.players[1].score).toBe(0) // bot : 0 (sa Ronda perd)
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
    expect(mabqachBonus(makeCard(12))).toEqual([5, 0])
  })

  it('derniere prise As (1) -> -5 pour le donneur', () => {
    expect(mabqachBonus(makeCard(1))).toEqual([-5, 0])
  })

  it('aucune prise -> +5 pour l\'adversaire (pas de malus au donneur)', () => {
    expect(mabqachBonus(null)).toEqual([0, 5])
  })

  it('autre valeur (ex. 7) -> 0 pour les deux', () => {
    expect(mabqachBonus(makeCard(7))).toEqual([0, 0])
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

    // Phase en DEAL_END (pas encore 41) — le donneur et le numero de donne
    // sont encore ceux de la donne terminee ; l'alternance se fait quand
    // l'UI dispatche CONTINUE_DEAL (qui appelle startNewDeal).
    expect(next.phase).toBe('DEAL_END')
    // Donneur inchange en DEAL_END
    expect(next.dealer).toBe(1)
    // Numero de donne inchange en DEAL_END
    expect(next.dealNumber).toBe(0)
    // Score joueur 1 : 8 + 2 (decompte 22 cartes) = 10
    expect(next.players[1].score).toBe(10)
    // Score joueur 0 : 10 + 0 = 10
    expect(next.players[0].score).toBe(10)
  })

  it('Mab9ach : le donneur ne prend pas la derniere -> +5 a l\'adversaire', () => {
    // Donneur = 0, mais la derniere prise est de l'adversaire (joueur 1).
    // => donneur ne prend rien en Mab9ach => +5 a l'adversaire (joueur 1).
    const captured19 = Array.from({ length: 19 }, () => makeCard(1))
    const state = makeGameState({
      deck: [],
      table: [],
      phase: 'PLAYING',
      dealer: 0,
      isMabqach: true,
      lastCapture: { playerId: 1, card: makeCard(7) }, // capture par l'adversaire
      players: [
        makePlayerState({ score: 0, captured: captured19 }),
        makePlayerState({ score: 0, captured: captured19 }),
      ],
    })

    const next = applyEndOfDeal(state, rngZero)
    expect(next.players[1].score).toBe(5) // adversaire +5
    expect(next.players[0].score).toBe(0) // donneur : aucun malus
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

// ---------------------------------------------------------------------------
// 13. Validite de la table initiale
// ---------------------------------------------------------------------------
describe('13. Table initiale valide', () => {
  it('doublon de valeur -> invalide', () => {
    const table = [
      makeCard(5, 'oros'),
      makeCard(5, 'copas'),   // doublon de valeur
      makeCard(1, 'espadas'),
      makeCard(11, 'bastos'),
    ]
    expect(isTableValid(table)).toBe(false)
  })

  it('suite de 3 consecutives -> invalide', () => {
    // 5-6-7 sont consecutifs dans l'ordre 1-2-3-4-5-6-7-10-11-12
    const table = [
      makeCard(5, 'oros'),
      makeCard(6, 'copas'),
      makeCard(7, 'espadas'),
      makeCard(12, 'bastos'),
    ]
    expect(isTableValid(table)).toBe(false)
  })

  it('suite de 3 a cheval sur le saut 7->10 -> invalide', () => {
    // 7-10-11 sont consecutifs (pas de 8/9 dans le jeu)
    const table = [
      makeCard(7, 'oros'),
      makeCard(10, 'copas'),
      makeCard(11, 'espadas'),
      makeCard(2, 'bastos'),
    ]
    expect(isTableValid(table)).toBe(false)
  })

  it('table sans doublon ni suite de 3 -> valide', () => {
    const table = [
      makeCard(1, 'oros'),
      makeCard(4, 'copas'),
      makeCard(7, 'espadas'),
      makeCard(11, 'bastos'),
    ]
    expect(isTableValid(table)).toBe(true)
  })

  it('suite de 2 toleree -> valide', () => {
    // 5-6 consecutifs (suite de 2) : autorise
    const table = [
      makeCard(5, 'oros'),
      makeCard(6, 'copas'),
      makeCard(1, 'espadas'),
      makeCard(11, 'bastos'),
    ]
    expect(isTableValid(table)).toBe(true)
  })

  it('distribution initiale : table vide, 4 cartes par joueur, pioche 32', () => {
    // Nouvelle regle : la 1re distribution donne 4+4 en main et 0 sur la table.
    for (let seed = 1; seed <= 300; seed++) {
      const state = createInitialState(makeLcg(seed), 0)
      expect(state.table.length).toBe(0)
      expect(state.players[0].hand.length).toBe(4)
      expect(state.players[1].hand.length).toBe(4)
      expect(state.deck.length).toBe(32)
      expect(state.isMabqach).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// 14. Alternance du premier joueur entre donnes
// ---------------------------------------------------------------------------
describe('14. Alternance du premier joueur', () => {
  it('le currentPlayer est toujours le non-donneur en debut de donne', () => {
    const d0 = createInitialState(makeLcg(7), 0)
    expect(d0.currentPlayer).toBe(1 - d0.dealer)
    const d1 = createInitialState(makeLcg(7), 1)
    expect(d1.currentPlayer).toBe(1 - d1.dealer)
  })

  it('apres CONTINUE_DEAL, le currentPlayer change vs la donne precedente', () => {
    const rng = makeLcg(42)
    const deal1 = createInitialState(rng, 0)   // donneur 0 -> currentPlayer 1

    // Simule CONTINUE_DEAL : le donneur alterne, scores conserves.
    const deal2 = startNewDeal(
      {
        scores: [deal1.players[0].score, deal1.players[1].score],
        dealer: (1 - deal1.dealer) as 0 | 1,
        dealNumber: deal1.dealNumber + 1,
      },
      rng,
    )

    expect(deal2.currentPlayer).toBe(1 - deal2.dealer)
    expect(deal2.currentPlayer).not.toBe(deal1.currentPlayer)
  })
})

// ---------------------------------------------------------------------------
// 15. Chaîne de caídas (Ara Wahd / Ara Khamssa / Ara 3achra)
// ---------------------------------------------------------------------------
describe('15. Chaine de caidas', () => {
  // Joueur 0 capture la carte 'value' que l'adversaire (1) vient de poser.
  // `chain` = chaîne en cours dans l'état. Un 12 sur la table évite la missa.
  function playCaida(
    value: Value,
    chain: GameState['caidaChain'],
    capturedSuit: Card['suit'] = 'oros',
    playedSuit: Card['suit'] = 'copas',
  ): GameState {
    const opponentCard = makeCard(value, capturedSuit)
    const state = makeGameState({
      currentPlayer: 0,
      table: [opponentCard, makeCard(12, 'bastos')],
      lastPlayed: [null, opponentCard],   // l'adversaire (1) vient de poser cette carte
      caidaChain: chain,
      players: [
        makePlayerState({ hand: [makeCard(value, playedSuit), makeCard(2, 'espadas')] }),
        makePlayerState({ hand: [makeCard(3, 'bastos')] }),
      ],
    })
    return applyAction(state, { type: 'PLAY_CARD', playerId: 0, card: makeCard(value, playedSuit) }, rngZero)
  }

  it('caida simple (chaine nulle) -> Ara Wahd, +1, niveau 1', () => {
    const next = playCaida(5, null)
    expect(next.players[0].score).toBe(1)
    expect(next.caidaChain).toEqual({ level: 1, value: 5 })
    expect(next.lastEvents).toContain('caida')
  })

  it('2e caida meme valeur -> Ara Khamssa, +5, niveau 2', () => {
    const next = playCaida(5, { level: 1, value: 5 })
    expect(next.players[0].score).toBe(5)
    expect(next.caidaChain).toEqual({ level: 2, value: 5 })
    expect(next.lastEvents).toContain('ara_khamssa')
  })

  it('3e caida meme valeur -> Ara 3achra, +10, niveau 3', () => {
    const next = playCaida(5, { level: 2, value: 5 })
    expect(next.players[0].score).toBe(10)
    expect(next.caidaChain).toEqual({ level: 3, value: 5 })
    expect(next.lastEvents).toContain('ara_3achra')
  })

  it('caida sur une valeur differente -> la chaine repart a Ara Wahd (+1)', () => {
    // Chaine en cours sur la valeur 5, mais on enchaine une caida sur un 7.
    const next = playCaida(7, { level: 2, value: 5 })
    expect(next.players[0].score).toBe(1)
    expect(next.caidaChain).toEqual({ level: 1, value: 7 })
    expect(next.lastEvents).toContain('caida')
  })

  it('un coup sans caida reinitialise la chaine a null', () => {
    // Chaine en cours, mais le joueur pose une carte qui ne capture rien.
    const state = makeGameState({
      currentPlayer: 0,
      table: [makeCard(12, 'bastos')],
      lastPlayed: [null, makeCard(5, 'oros')],
      caidaChain: { level: 2, value: 5 },
      players: [
        makePlayerState({ hand: [makeCard(6, 'copas'), makeCard(2, 'espadas')] }),
        makePlayerState({ hand: [makeCard(3, 'bastos')] }),
      ],
    })
    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 0, card: makeCard(6, 'copas') }, rngZero)
    expect(next.caidaChain).toBeNull()
    expect(next.players[0].score).toBe(0)
  })

  it('capture sans caida (pas la derniere carte adverse) -> chaine null, pas de points', () => {
    // Le 4 etait deja sur la table ; l'adversaire a pose un 7 (pas un 4).
    const state = makeGameState({
      currentPlayer: 0,
      table: [makeCard(4, 'oros'), makeCard(12, 'bastos')],
      lastPlayed: [null, makeCard(7, 'espadas')],
      caidaChain: { level: 1, value: 11 },
      players: [
        makePlayerState({ hand: [makeCard(4, 'copas'), makeCard(2, 'espadas')] }),
        makePlayerState({ hand: [makeCard(3, 'bastos')] }),
      ],
    })
    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 0, card: makeCard(4, 'copas') }, rngZero)
    expect(next.caidaChain).toBeNull()
    expect(next.players[0].score).toBe(0)
    expect(next.lastEvents).not.toContain('caida')
  })

  it('scenario complet 4 tours : Ara Wahd -> Ara Khamssa -> Ara 7dach (la carte joueuse reste)', () => {
    // Regle "la carte joueuse reste sur la table" : chaque caida laisse la carte
    // qui capture sur la table, elle devient l'appat du tour suivant.
    //   T1 : P0 pose 5o            -> table [5o]
    //   T2 : P1 capture (5c)       -> Ara Wahd  (+1 P1) ; table [5c] ; pile P1 [5o]
    //   T3 : P0 capture (5e)       -> Ara Khamssa (+5 P0); table [5e]; pile P0 [5c]
    //   T4 : P1 capture (5b)       -> Ara 7dach  (+11 P1); table [] (chaine finie)
    let st = makeGameState({
      currentPlayer: 0,
      dealer: 1,
      table: [],
      lastPlayed: [null, null],
      caidaChain: null,
      players: [
        makePlayerState({ hand: [makeCard(5, 'oros'), makeCard(5, 'espadas'), makeCard(2, 'oros')] }),
        makePlayerState({ hand: [makeCard(5, 'copas'), makeCard(5, 'bastos'), makeCard(3, 'copas')] }),
      ],
    })

    // T1 : P0 pose son 5 — aucune capture
    st = applyAction(st, { type: 'PLAY_CARD', playerId: 0, card: makeCard(5, 'oros') }, rngZero)
    expect(st.table).toEqual([makeCard(5, 'oros')])
    expect(st.caidaChain).toBeNull()

    // T2 : P1 capture -> Ara Wahd. La capture vide la table → c'est aussi une missa
    // (+1). Son 5 reste en appat, le 5 adverse part dans sa pile. P1 = 1 + 1 = 2.
    st = applyAction(st, { type: 'PLAY_CARD', playerId: 1, card: makeCard(5, 'copas') }, rngZero)
    expect(st.caidaChain).toEqual({ level: 1, value: 5 })
    expect(st.players[1].score).toBe(2)
    expect(st.lastEvents).toContain('caida')
    expect(st.lastEvents).toContain('missa')
    expect(st.table).toEqual([makeCard(5, 'copas')])
    expect(st.players[1].captured).toEqual([makeCard(5, 'oros')])

    // T3 : P0 capture le 5 du bot -> Ara Khamssa (+5) + missa (+1) = 6 ; et efface
    // l'Ara Wahd de P1 (-1) → P1 passe de 2 à 1.
    st = applyAction(st, { type: 'PLAY_CARD', playerId: 0, card: makeCard(5, 'espadas') }, rngZero)
    expect(st.caidaChain).toEqual({ level: 2, value: 5 })
    expect(st.players[0].score).toBe(6)
    expect(st.players[1].score).toBe(1)
    expect(st.lastEvents).toContain('ara_khamssa')
    expect(st.table).toEqual([makeCard(5, 'espadas')])
    expect(st.players[0].captured).toEqual([makeCard(5, 'copas')])

    // T4 : P1 capture -> Ara 3achra (+10) + missa (+1) = 11, ET efface l'Ara Khamssa
    // de P0 (-5). P0 : 6 → 1 ; P1 : 1 + 11 = 12.
    // Les quatre 5 sont desormais joues : P0 n'a plus de 5 en main → la chaine ne
    // peut plus continuer, donc le 5b ne reste PAS sur la table (il va en pile).
    st = applyAction(st, { type: 'PLAY_CARD', playerId: 1, card: makeCard(5, 'bastos') }, rngZero)
    expect(st.caidaChain).toEqual({ level: 3, value: 5 })
    expect(st.players[1].score).toBe(12)
    expect(st.players[0].score).toBe(1)
    expect(st.lastEvents).toContain('ara_3achra')
    expect(st.table).toEqual([])
    expect(st.pendingCaidaCard).toBeNull()
  })

  it('caida non poursuivie : la carte restee repart dans la pile de son joueur', () => {
    // T1 P0 pose 5o ; T2 P1 caida (Ara Wahd) -> 5c reste sur la table (P0 a encore
    // un 5 en main, donc la chaine PEUT continuer) ;
    // T3 P0 joue un 7 (pas une caida de meme valeur) -> le 5c repart dans la pile de P1.
    let st = makeGameState({
      currentPlayer: 0,
      dealer: 1,
      table: [],
      lastPlayed: [null, null],
      caidaChain: null,
      players: [
        makePlayerState({ hand: [makeCard(5, 'oros'), makeCard(7, 'espadas'), makeCard(5, 'espadas')] }),
        makePlayerState({ hand: [makeCard(5, 'copas'), makeCard(5, 'bastos'), makeCard(3, 'copas')] }),
      ],
    })

    st = applyAction(st, { type: 'PLAY_CARD', playerId: 0, card: makeCard(5, 'oros') }, rngZero)
    st = applyAction(st, { type: 'PLAY_CARD', playerId: 1, card: makeCard(5, 'copas') }, rngZero)
    expect(st.pendingCaidaCard).toEqual({ card: makeCard(5, 'copas'), playerId: 1 })
    expect(st.players[1].score).toBe(2) // Ara Wahd (+1) + missa (+1), la capture vide la table
    expect(st.table).toEqual([makeCard(5, 'copas')])

    // T3 : P0 joue un 7 — pas de caida de meme valeur.
    st = applyAction(st, { type: 'PLAY_CARD', playerId: 0, card: makeCard(7, 'espadas') }, rngZero)
    expect(st.pendingCaidaCard).toBeNull()
    expect(st.caidaChain).toBeNull()
    expect(st.table).toEqual([makeCard(7, 'espadas')])                    // le 5c a quitte la table
    expect(st.players[1].captured).toEqual([makeCard(5, 'oros'), makeCard(5, 'copas')]) // 5c rendu a P1
    expect(st.players[1].score).toBe(2)                                   // score inchange
  })

  it('correction 1 : la carte ne reste PAS si l\'adversaire n\'a aucun 5 en main', () => {
    // P0 pose 5o puis n'a plus de 5 ; P1 caida (Ara Wahd). Comme P0 ne peut pas
    // poursuivre la chaine, le 5c va directement en pile (pas sur la table).
    let st = makeGameState({
      currentPlayer: 0,
      dealer: 1,
      players: [
        makePlayerState({ hand: [makeCard(5, 'oros'), makeCard(2, 'oros')] }),
        makePlayerState({ hand: [makeCard(5, 'copas'), makeCard(3, 'copas')] }),
      ],
    })

    st = applyAction(st, { type: 'PLAY_CARD', playerId: 0, card: makeCard(5, 'oros') }, rngZero)
    st = applyAction(st, { type: 'PLAY_CARD', playerId: 1, card: makeCard(5, 'copas') }, rngZero)

    expect(st.lastEvents).toContain('caida')
    expect(st.players[1].score).toBe(2) // Ara Wahd (+1) + missa (+1)
    expect(st.caidaChain).toEqual({ level: 1, value: 5 })
    expect(st.pendingCaidaCard).toBeNull()             // pas d'appat laisse
    expect(st.table).toEqual([])                        // 5c parti en pile, pas sur la table
    expect(st.players[1].captured).toEqual([makeCard(5, 'copas'), makeCard(5, 'oros')])
  })

  it('correction 2 : la carte ne reste PAS si la main du capteur est vide apres le coup', () => {
    // P1 fait une caida avec sa derniere carte. Meme si P0 a encore un 5, la
    // manche va se terminer cote P1 → le 5c va en pile, pas sur la table.
    let st = makeGameState({
      currentPlayer: 0,
      dealer: 1,
      players: [
        makePlayerState({ hand: [makeCard(5, 'oros'), makeCard(5, 'espadas')] }),
        makePlayerState({ hand: [makeCard(5, 'copas')] }),   // une seule carte
      ],
    })

    st = applyAction(st, { type: 'PLAY_CARD', playerId: 0, card: makeCard(5, 'oros') }, rngZero)
    st = applyAction(st, { type: 'PLAY_CARD', playerId: 1, card: makeCard(5, 'copas') }, rngZero)

    expect(st.lastEvents).toContain('caida')
    expect(st.players[1].score).toBe(2) // Ara Wahd (+1) + missa (+1)
    expect(st.pendingCaidaCard).toBeNull()             // main vide → aucun appat
    expect(st.table).toEqual([])
    expect(st.players[1].captured).toEqual([makeCard(5, 'copas'), makeCard(5, 'oros')])
  })

  it('correction 3 : escalier applique apres une caida (caida sur 2, 3 sur la table)', () => {
    // Table = [3b]. P0 pose 2o (pas de capture). P1 pose 2c -> caida sur 2o ; le 3b
    // est consecutif (escalier) donc capture aussi. Le 2c reste sur la table (P0 a
    // encore un 2). Pile P1 = [2o, 3b].
    let st = makeGameState({
      currentPlayer: 0,
      dealer: 1,
      table: [makeCard(3, 'bastos')],
      players: [
        makePlayerState({ hand: [makeCard(2, 'oros'), makeCard(2, 'espadas'), makeCard(6, 'oros')] }),
        makePlayerState({ hand: [makeCard(2, 'copas'), makeCard(6, 'copas')] }),
      ],
    })

    st = applyAction(st, { type: 'PLAY_CARD', playerId: 0, card: makeCard(2, 'oros') }, rngZero)
    expect(st.table).toEqual([makeCard(3, 'bastos'), makeCard(2, 'oros')])  // pas de capture

    st = applyAction(st, { type: 'PLAY_CARD', playerId: 1, card: makeCard(2, 'copas') }, rngZero)
    expect(st.lastEvents).toContain('caida')
    // La caida + escalier vide la table → missa : +1 (caida) +1 (missa) = 2.
    expect(st.players[1].score).toBe(2)
    // Le 2c reste (appat), le 2o (caida) + 3b (escalier) partent dans la pile de P1.
    expect(st.pendingCaidaCard).toEqual({ card: makeCard(2, 'copas'), playerId: 1 })
    expect(st.table).toEqual([makeCard(2, 'copas')])
    expect(st.players[1].captured).toEqual([makeCard(2, 'oros'), makeCard(3, 'bastos')])
  })

  // ── Corrections de règles ───────────────────────────────────────────────────

  it('regle: Ara 3achra vaut 10 points (et non 11)', () => {
    const next = playCaida(5, { level: 2, value: 5 })
    expect(next.players[0].score).toBe(10)
    expect(next.lastEvents).toContain('ara_3achra')
  })

  it('regle: missa sur caida → isMissa et +1 en plus du bonus caida', () => {
    // Table = [5o] uniquement (pas de 12). P1 fait une caida sur le 5o : la table
    // est videe par la capture → missa. P0 n'a plus de 5 → la carte va en pile.
    let st = makeGameState({
      currentPlayer: 0,
      dealer: 1,
      table: [],
      players: [
        makePlayerState({ hand: [makeCard(5, 'oros'), makeCard(2, 'oros')] }),
        makePlayerState({ hand: [makeCard(5, 'copas'), makeCard(3, 'copas')] }),
      ],
    })
    st = applyAction(st, { type: 'PLAY_CARD', playerId: 0, card: makeCard(5, 'oros') }, rngZero)
    st = applyAction(st, { type: 'PLAY_CARD', playerId: 1, card: makeCard(5, 'copas') }, rngZero)

    expect(st.lastEvents).toContain('caida')
    expect(st.lastEvents).toContain('missa')
    expect(st.players[1].score).toBe(2) // +1 caida (Ara Wahd) +1 missa
  })

  it('regle: Ara Khamssa efface le +1 (Ara Wahd) de l\'adversaire', () => {
    // P1 est a 1 (a fait Ara Wahd au tour precedent) ; P0 fait Ara Khamssa.
    const opponentCard = makeCard(5, 'oros')
    const state = makeGameState({
      currentPlayer: 0,
      table: [opponentCard, makeCard(12, 'bastos')],
      lastPlayed: [null, opponentCard],
      caidaChain: { level: 1, value: 5 },
      players: [
        makePlayerState({ hand: [makeCard(5, 'copas'), makeCard(2, 'espadas')] }),
        makePlayerState({ hand: [makeCard(3, 'bastos')], score: 1 }),
      ],
    })
    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 0, card: makeCard(5, 'copas') }, rngZero)
    expect(next.lastEvents).toContain('ara_khamssa')
    expect(next.players[0].score).toBe(5) // Ara Khamssa
    expect(next.players[1].score).toBe(0) // son +1 efface
  })

  it('regle: Ara 3achra efface le +5 (Ara Khamssa) de l\'adversaire, jamais sous 0', () => {
    // P1 est a 3 ; P0 fait Ara 3achra (prevChain level 2) → P1 perd 5 → max(0, 3-5)=0.
    const opponentCard = makeCard(5, 'oros')
    const state = makeGameState({
      currentPlayer: 0,
      table: [opponentCard, makeCard(12, 'bastos')],
      lastPlayed: [null, opponentCard],
      caidaChain: { level: 2, value: 5 },
      players: [
        makePlayerState({ hand: [makeCard(5, 'copas'), makeCard(2, 'espadas')] }),
        makePlayerState({ hand: [makeCard(3, 'bastos')], score: 3 }),
      ],
    })
    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 0, card: makeCard(5, 'copas') }, rngZero)
    expect(next.lastEvents).toContain('ara_3achra')
    expect(next.players[0].score).toBe(10) // Ara 3achra
    expect(next.players[1].score).toBe(0)  // 3 - 5 borne a 0
  })
})

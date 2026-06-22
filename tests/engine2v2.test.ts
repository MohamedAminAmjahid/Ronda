import { describe, it, expect } from 'vitest'
import type { Card, Value, Combination } from '../src/engine/types'
import { isTableValid } from '../src/engine/deal'
import {
  createInitialState2v2,
  startNewDeal2v2,
  applyAction2v2,
  applyEndOfDeal2v2,
  resolveCombos2v2,
  nextPlayer,
  prevPlayer,
  type GameState2v2,
  type PlayerId2v2,
  type PlayerState2v2,
  type TeamState,
  type CaidaChain,
} from '../src/engine2v2/index2v2'

// ── Helpers ─────────────────────────────────────────────────────────────────────

function makeLcg(seed: number): () => number {
  let s = (seed >>> 0) || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}
const rngZero = () => 0

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
    pendingCaidaCard: null,
    lastEvents: [],
    eventSeq: 0,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 1. Distribution
// ---------------------------------------------------------------------------
describe('2v2 — Distribution', () => {
  it('distribue 3 cartes à 4 joueurs + 4 table, pioche = 24, table valide', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const st = createInitialState2v2(makeLcg(seed), 0)
      expect(st.players.every((p) => p.hand.length === 3)).toBe(true)
      expect(st.table.length).toBe(4)
      expect(st.deck.length).toBe(24)
      expect(isTableValid(st.table)).toBe(true)
      // pas de carte en double sur l'ensemble distribué
      const all = [...st.players.flatMap((p) => p.hand), ...st.table, ...st.deck]
      expect(all.length).toBe(40)
      const keys = new Set(all.map((c) => `${c.value}-${c.suit}`))
      expect(keys.size).toBe(40)
    }
  })

  it('le donneur joue en dernier : currentPlayer = joueur après le donneur', () => {
    const st = createInitialState2v2(makeLcg(5), 1)
    expect(st.dealer).toBe(1)
    expect(st.currentPlayer).toBe(0) // anti-horaire : nextPlayer(1) = 0
    expect(st.teams[0].score).toBe(0)
    expect(st.teams[1].score).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 2. Rotation des tours (sens des aiguilles 0→1→2→3→0)
// ---------------------------------------------------------------------------
describe('2v2 — Rotation des tours', () => {
  it('nextPlayer / prevPlayer suivent l’ordre anti-horaire 0→3→2→1→0', () => {
    expect([nextPlayer(0), nextPlayer(3), nextPlayer(2), nextPlayer(1)]).toEqual([3, 2, 1, 0])
    expect([prevPlayer(0), prevPlayer(1), prevPlayer(2), prevPlayer(3)]).toEqual([1, 2, 3, 0])
  })

  it('après chaque pose (sans capture), currentPlayer avance 0→3→2→1→0', () => {
    // Valeurs distinctes → aucune capture ; chaque joueur garde une carte (mains non vides).
    let st = makeState({
      currentPlayer: 0,
      players: [
        makePlayer({ hand: [makeCard(2, 'oros'), makeCard(10, 'oros')] }),
        makePlayer({ hand: [makeCard(3, 'copas'), makeCard(11, 'copas')] }),
        makePlayer({ hand: [makeCard(4, 'espadas'), makeCard(12, 'espadas')] }),
        makePlayer({ hand: [makeCard(5, 'bastos'), makeCard(1, 'bastos')] }),
      ],
    })

    st = applyAction2v2(st, { type: 'PLAY_CARD', playerId: 0, card: makeCard(2, 'oros') }, rngZero)
    expect(st.currentPlayer).toBe(3)
    st = applyAction2v2(st, { type: 'PLAY_CARD', playerId: 3, card: makeCard(5, 'bastos') }, rngZero)
    expect(st.currentPlayer).toBe(2)
    st = applyAction2v2(st, { type: 'PLAY_CARD', playerId: 2, card: makeCard(4, 'espadas') }, rngZero)
    expect(st.currentPlayer).toBe(1)
    st = applyAction2v2(st, { type: 'PLAY_CARD', playerId: 1, card: makeCard(3, 'copas') }, rngZero)
    expect(st.currentPlayer).toBe(0)
    // 4 cartes posées, aucune capture
    expect(st.table.length).toBe(4)
  })

  it('le joueur après le donneur ouvre (anti-horaire)', () => {
    // dealer 0 → ouvre 3 ; dealer 1 → ouvre 0 ; dealer 2 → ouvre 1 ; dealer 3 → ouvre 2
    expect(startNewDeal2v2({ scores: [0, 0], dealer: 0, dealNumber: 0 }, makeLcg(3)).currentPlayer).toBe(3)
    expect(startNewDeal2v2({ scores: [0, 0], dealer: 1, dealNumber: 0 }, makeLcg(3)).currentPlayer).toBe(0)
    expect(startNewDeal2v2({ scores: [0, 0], dealer: 2, dealNumber: 0 }, makeLcg(3)).currentPlayer).toBe(1)
    expect(startNewDeal2v2({ scores: [0, 0], dealer: 3, dealNumber: 0 }, makeLcg(3)).currentPlayer).toBe(2)
  })

  it('le donneur tourne dans le même sens entre les donnes : 0→3→2→1→0', () => {
    // Formule de CONTINUE_DEAL : prochain donneur = (dealer + 3) % 4 = nextPlayer(dealer).
    const seq: PlayerId2v2[] = [0]
    let d: PlayerId2v2 = 0
    for (let i = 0; i < 4; i++) {
      d = ((d + 3) % 4) as PlayerId2v2
      seq.push(d)
    }
    expect(seq).toEqual([0, 3, 2, 1, 0])
    // cohérence avec le helper d'ordre de jeu
    expect(((0 + 3) % 4)).toBe(nextPlayer(0))
  })
})

// ---------------------------------------------------------------------------
// 3. Chaîne de caídas qui traverse les équipes
// ---------------------------------------------------------------------------
describe('2v2 — Chaîne de caídas inter-équipes', () => {
  // Le joueur `playerId` capture la carte `value` que le joueur précédent vient de poser.
  function playCaida(playerId: PlayerId2v2, value: Value, chain: CaidaChain | null): GameState2v2 {
    const prev = prevPlayer(playerId)
    const posed = makeCard(value, 'oros')
    const lastPlayed: [Card | null, Card | null, Card | null, Card | null] = [null, null, null, null]
    lastPlayed[prev] = posed

    const players = [makePlayer(), makePlayer(), makePlayer(), makePlayer()] as [
      PlayerState2v2, PlayerState2v2, PlayerState2v2, PlayerState2v2,
    ]
    // chaque joueur garde une carte de réserve → mains jamais toutes vides
    for (let i = 0; i < 4; i++) players[i] = makePlayer({ hand: [makeCard(2, 'bastos')] })
    players[playerId] = makePlayer({ hand: [makeCard(value, 'copas'), makeCard(2, 'bastos')] })

    const st = makeState({
      currentPlayer: playerId,
      table: [posed, makeCard(12, 'bastos')], // 12 évite la missa
      lastPlayed,
      caidaChain: chain,
      players,
    })
    return applyAction2v2(st, { type: 'PLAY_CARD', playerId, card: makeCard(value, 'copas') }, rngZero)
  }

  it('Ara Wahd (joueur 1, équipe B) → +1, niveau 1', () => {
    const st = playCaida(1, 5, null)
    expect(st.caidaChain).toEqual({ level: 1, value: 5 })
    expect(st.teams[1].score).toBe(1) // équipe B (joueurs 1&3)
    expect(st.teams[0].score).toBe(0)
    expect(st.lastEvents).toContain('caida')
  })

  it('Ara Khamssa (joueur 2, équipe A) → +5, niveau 2', () => {
    const st = playCaida(2, 5, { level: 1, value: 5 })
    expect(st.caidaChain).toEqual({ level: 2, value: 5 })
    expect(st.teams[0].score).toBe(5) // équipe A (joueurs 0&2)
    expect(st.lastEvents).toContain('ara_khamssa')
  })

  it('Ara 7dach (joueur 3, équipe B) → +11, niveau 3', () => {
    const st = playCaida(3, 5, { level: 2, value: 5 })
    expect(st.caidaChain).toEqual({ level: 3, value: 5 })
    expect(st.teams[1].score).toBe(11) // équipe B
    expect(st.lastEvents).toContain('ara_7dach')
  })

  it('valeur différente → la chaîne repart à Ara Wahd', () => {
    const st = playCaida(2, 7, { level: 2, value: 5 })
    expect(st.caidaChain).toEqual({ level: 1, value: 7 })
    expect(st.teams[0].score).toBe(1)
    expect(st.lastEvents).toContain('caida')
  })

  // playerId capture la carte posée par prevPlayer(playerId). nextPlayer(playerId)
  // est le joueur qui pourrait poursuivre la chaîne.
  type Players4 = [PlayerState2v2, PlayerState2v2, PlayerState2v2, PlayerState2v2]

  it('correction 1 : la carte reste si le joueur suivant a la même valeur en main', () => {
    const lastPlayed: [Card | null, Card | null, Card | null, Card | null] =
      [null, null, makeCard(5, 'oros'), null] // prevPlayer(1) = 2
    const players: Players4 = [
      makePlayer({ hand: [makeCard(5, 'espadas'), makeCard(11, 'bastos')] }), // P0 = nextPlayer(1) a un 5
      makePlayer({ hand: [makeCard(5, 'copas'), makeCard(11, 'copas')] }),    // P1 capture
      makePlayer({ hand: [makeCard(11, 'espadas')] }),
      makePlayer({ hand: [makeCard(11, 'oros')] }),
    ]
    const st = applyAction2v2(
      makeState({ currentPlayer: 1, table: [makeCard(5, 'oros'), makeCard(12, 'bastos')], lastPlayed, players }),
      { type: 'PLAY_CARD', playerId: 1, card: makeCard(5, 'copas') }, rngZero,
    )
    expect(st.lastEvents).toContain('caida')
    expect(st.teams[1].score).toBe(1)
    expect(st.pendingCaidaCard).toEqual({ card: makeCard(5, 'copas'), playerId: 1 })
    expect(st.table).toEqual([makeCard(12, 'bastos'), makeCard(5, 'copas')]) // 5c reste (appat)
    expect(st.teams[1].captured).toEqual([makeCard(5, 'oros')])
  })

  it('correction 1 : la carte ne reste PAS si le joueur suivant n\'a pas la valeur', () => {
    const lastPlayed: [Card | null, Card | null, Card | null, Card | null] =
      [null, null, makeCard(5, 'oros'), null]
    const players: Players4 = [
      makePlayer({ hand: [makeCard(11, 'espadas')] }),                       // P0 = nextPlayer(1) sans 5
      makePlayer({ hand: [makeCard(5, 'copas'), makeCard(11, 'copas')] }),   // P1 capture
      makePlayer({ hand: [makeCard(11, 'bastos')] }),
      makePlayer({ hand: [makeCard(11, 'oros')] }),
    ]
    const st = applyAction2v2(
      makeState({ currentPlayer: 1, table: [makeCard(5, 'oros'), makeCard(12, 'bastos')], lastPlayed, players }),
      { type: 'PLAY_CARD', playerId: 1, card: makeCard(5, 'copas') }, rngZero,
    )
    expect(st.lastEvents).toContain('caida')
    expect(st.teams[1].score).toBe(1)
    expect(st.pendingCaidaCard).toBeNull()
    expect(st.table).toEqual([makeCard(12, 'bastos')])                       // 5c parti en pile
    expect(st.teams[1].captured).toEqual([makeCard(5, 'copas'), makeCard(5, 'oros')])
  })

  it('correction 3 : escalier appliqué après une caída (2v2)', () => {
    const lastPlayed: [Card | null, Card | null, Card | null, Card | null] =
      [null, null, makeCard(2, 'oros'), null]
    const players: Players4 = [
      makePlayer({ hand: [makeCard(2, 'espadas'), makeCard(11, 'bastos')] }), // P0 = nextPlayer(1) a un 2
      makePlayer({ hand: [makeCard(2, 'copas'), makeCard(11, 'copas')] }),    // P1 capture
      makePlayer({ hand: [makeCard(11, 'espadas')] }),
      makePlayer({ hand: [makeCard(11, 'oros')] }),
    ]
    // Table : 2o (appât) + 3b (consécutif → escalier) + 12 (évite missa).
    const st = applyAction2v2(
      makeState({
        currentPlayer: 1,
        table: [makeCard(2, 'oros'), makeCard(3, 'bastos'), makeCard(12, 'bastos')],
        lastPlayed, players,
      }),
      { type: 'PLAY_CARD', playerId: 1, card: makeCard(2, 'copas') }, rngZero,
    )
    expect(st.lastEvents).toContain('caida')
    expect(st.pendingCaidaCard).toEqual({ card: makeCard(2, 'copas'), playerId: 1 })
    expect(st.table).toEqual([makeCard(12, 'bastos'), makeCard(2, 'copas')]) // 2c reste
    // 2o (caída) + 3b (escalier) → pile équipe B.
    expect(st.teams[1].captured).toEqual([makeCard(2, 'oros'), makeCard(3, 'bastos')])
  })
})

// ---------------------------------------------------------------------------
// 4. Résolution des combinaisons (§12.2)
// ---------------------------------------------------------------------------
describe('2v2 — Résolution des combos', () => {
  const tringa = (v: Value): Combination => ({
    type: 'tringa', value: v, cards: [makeCard(v), makeCard(v, 'copas'), makeCard(v, 'espadas')],
  })
  const ronda = (v: Value): Combination => ({
    type: 'ronda', value: v, cards: [makeCard(v), makeCard(v, 'copas')],
  })

  it('Tringa(0) + Ronda(1) + Ronda(3) → équipe A 7, équipe B 0', () => {
    expect(resolveCombos2v2([tringa(5), ronda(1), null, ronda(1)])).toEqual([7, 0])
  })

  it('deux rondas de la même équipe → somme pour l’équipe (§7.2)', () => {
    // joueurs 0 & 2 (équipe A) : ronda 3 + ronda 7 → A = 2
    expect(resolveCombos2v2([ronda(3), null, ronda(7), null])).toEqual([2, 0])
  })

  it('un adversaire avec la tringa la plus haute rafle tout', () => {
    expect(resolveCombos2v2([ronda(3), tringa(1), null, null])).toEqual([0, 6])
  })

  it('aucune déclaration → 0–0', () => {
    expect(resolveCombos2v2([null, null, null, null])).toEqual([0, 0])
  })

  it('DECLARE télescopique : un combo plus fort reprend les points', () => {
    let st = makeState({
      currentPlayer: 0,
      players: [
        makePlayer({ hand: [makeCard(5), makeCard(5, 'copas'), makeCard(10, 'oros')], pendingCombo: ronda(5) }),
        makePlayer({ hand: [makeCard(1), makeCard(1, 'copas'), makeCard(1, 'espadas')], pendingCombo: tringa(1) }),
        makePlayer(),
        makePlayer(),
      ],
    })
    // joueur 0 (équipe A) déclare ronda 5 → A +1
    st = applyAction2v2(st, { type: 'DECLARE', playerId: 0, combination: ronda(5) }, rngZero)
    expect(st.teams[0].score).toBe(1)
    expect(st.teams[1].score).toBe(0)

    // joueur 1 (équipe B) déclare tringa → reprend tout : A 0, B 6
    st = { ...st, currentPlayer: 1 }
    st = applyAction2v2(st, { type: 'DECLARE', playerId: 1, combination: tringa(1) }, rngZero)
    expect(st.teams[0].score).toBe(0)
    expect(st.teams[1].score).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// 5. Décompte par équipe, Mab9ach, victoire à 41
// ---------------------------------------------------------------------------
describe('2v2 — Fin de donne & victoire', () => {
  it('décompte : équipe à 22 cartes marque +2, l’autre 0', () => {
    const captured22 = Array.from({ length: 22 }, () => makeCard(1))
    const captured18 = Array.from({ length: 18 }, () => makeCard(1))
    const st = makeState({
      dealer: 1,
      isMabqach: true,
      lastCapture: { playerId: 1, card: makeCard(7) }, // donneur, prise = 7 → bonus Mab9ach 0
      teams: [makeTeam({ score: 10, captured: captured18 }), makeTeam({ score: 8, captured: captured22 })],
    })
    const next = applyEndOfDeal2v2(st, rngZero)
    expect(next.phase).toBe('DEAL_END')
    expect(next.teams[1].score).toBe(10) // 8 + 2 (22 cartes)
    expect(next.teams[0].score).toBe(10) // 10 + 0
  })

  it('Mab9ach : dernière prise du donneur avec un Rey → +5 à son équipe', () => {
    const captured20 = Array.from({ length: 20 }, () => makeCard(1))
    const st = makeState({
      dealer: 0, // équipe A
      isMabqach: true,
      lastCapture: { playerId: 0, card: makeCard(12) }, // Rey → +5
      teams: [makeTeam({ score: 36, captured: captured20 }), makeTeam({ score: 5, captured: captured20 })],
    })
    const next = applyEndOfDeal2v2(st, rngZero)
    expect(next.teams[0].score).toBe(41) // 36 + 5, décompte 20-20 = 0
    expect(next.phase).toBe('GAME_OVER')
  })

  it('cartes restantes de la table → équipe du dernier captureur', () => {
    const st = makeState({
      dealer: 2,
      isMabqach: true,
      table: [makeCard(3), makeCard(4)],
      lastCapture: { playerId: 3, card: makeCard(7) }, // équipe B
      teams: [makeTeam({ score: 0, captured: [] }), makeTeam({ score: 0, captured: [] })],
    })
    const next = applyEndOfDeal2v2(st, rngZero)
    // équipe B reçoit les 2 cartes de table ; A=0, B=2 → décompte 0 (aucune > 20)
    expect(next.teams[1].captured.length).toBe(2)
    expect(next.table.length).toBe(0)
  })

  it('startNewDeal2v2 conserve les scores et alterne le donneur', () => {
    const d2 = startNewDeal2v2({ scores: [12, 7], dealer: 2, dealNumber: 1 }, makeLcg(9))
    expect(d2.teams[0].score).toBe(12)
    expect(d2.teams[1].score).toBe(7)
    expect(d2.dealer).toBe(2)
    expect(d2.currentPlayer).toBe(1) // anti-horaire : nextPlayer(2) = 1
  })
})

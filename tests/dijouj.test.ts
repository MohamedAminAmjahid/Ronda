import { describe, it, expect } from 'vitest'
import { createDeck, shuffle } from '../src/engine-dijouj/deck'
import { createInitialState } from '../src/engine-dijouj/deal'
import { isPlayable, applyPlayCard, applyDraw, isGameOver } from '../src/engine-dijouj/game'
import { botPlay } from '../src/ai-dijouj/bot'
import type { Card, GameState, PendingEffect, Suit } from '../src/engine-dijouj/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const rng0 = () => 0

function c(suit: Suit, value: 1|2|3|4|5|6|7|10|11|12): Card {
  return { suit, value }
}

function makeState(opts: {
  humanHand?:      Card[]
  botHand?:        Card[]
  discardTop?:     Card
  drawPile?:       Card[]
  currentPlayer?:  number
  chosenSuit?:     Suit | null
  pendingEffect?:  PendingEffect
}): GameState {
  const discardTop = opts.discardTop ?? c('oros', 5)
  return {
    players: [
      { id: 0, hand: opts.humanHand ?? [] },
      { id: 1, hand: opts.botHand  ?? [] },
    ],
    drawPile:        opts.drawPile       ?? [],
    discardPile:     [discardTop],
    currentPlayerId: opts.currentPlayer  ?? 0,
    chosenSuit:      opts.chosenSuit     ?? null,
    pendingEffect:   opts.pendingEffect  ?? null,
    isOver:          false,
    winnerId:        null,
  }
}

// ── 1. Deck ───────────────────────────────────────────────────────────────────

describe('deck', () => {
  it('createDeck retourne 40 cartes', () => {
    expect(createDeck()).toHaveLength(40)
  })

  it('4 couleurs × 10 valeurs', () => {
    const deck = createDeck()
    for (const suit of ['oros', 'copas', 'espadas', 'bastos'] as Suit[]) {
      expect(deck.filter(c => c.suit === suit)).toHaveLength(10)
    }
  })

  it('pas de 8 ni de 9', () => {
    const deck = createDeck()
    const vals = deck.map(c => c.value as number)
    expect(vals.includes(8) || vals.includes(9)).toBe(false)
  })

  it('shuffle change l\'ordre avec un rng non-trivial', () => {
    let i = 0
    const rngCycle = () => (i++ % 10) / 10
    const deck = createDeck()
    const shuffled = shuffle(deck, rngCycle)
    // Pas strictement identique (très improbable)
    expect(shuffled).not.toEqual(deck)
    expect(shuffled).toHaveLength(40)
  })
})

// ── 2. Distribution initiale ──────────────────────────────────────────────────

describe('createInitialState', () => {
  it('2 joueurs reçoivent 7 cartes chacun', () => {
    const s = createInitialState(2, rng0)
    expect(s.players[0].hand).toHaveLength(7)
    expect(s.players[1].hand).toHaveLength(7)
  })

  it('pioche = 40 − 14 − 1 = 25 cartes', () => {
    const s = createInitialState(2, rng0)
    expect(s.drawPile).toHaveLength(25)
  })

  it('défausse a exactement 1 carte', () => {
    const s = createInitialState(2, rng0)
    expect(s.discardPile).toHaveLength(1)
  })

  it('la première carte n\'est pas le 7 de Oros', () => {
    // Teste sur plusieurs seeds pour s'assurer de la règle
    for (let seed = 0; seed < 20; seed++) {
      let x = (seed >>> 0) || 1
      const lcg = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 0x100000000 }
      const s = createInitialState(2, lcg)
      const top = s.discardPile[0]
      expect(top.value === 7 && top.suit === 'oros').toBe(false)
    }
  })

  it('toutes les cartes sont distinctes (pas de doublons)', () => {
    const s = createInitialState(2, rng0)
    const all = [
      ...s.players[0].hand,
      ...s.players[1].hand,
      ...s.drawPile,
      ...s.discardPile,
    ]
    expect(all).toHaveLength(40)
    const keys = all.map(c => `${c.suit}_${c.value}`)
    expect(new Set(keys).size).toBe(40)
  })

  it('currentPlayerId commence à 0', () => {
    const s = createInitialState(2, rng0)
    expect(s.currentPlayerId).toBe(0)
    expect(s.pendingEffect).toBeNull()
    expect(s.chosenSuit).toBeNull()
  })
})

// ── 3. isPlayable ─────────────────────────────────────────────────────────────

describe('isPlayable', () => {
  const top = c('oros', 5)

  it('même couleur → jouable', () => {
    expect(isPlayable(c('oros', 3), top, null, null)).toBe(true)
  })

  it('même valeur → jouable', () => {
    expect(isPlayable(c('copas', 5), top, null, null)).toBe(true)
  })

  it('couleur ET valeur différentes → non jouable', () => {
    expect(isPlayable(c('copas', 3), top, null, null)).toBe(false)
  })

  it('7 de Oros est toujours jouable (joker)', () => {
    expect(isPlayable(c('oros', 7), c('bastos', 12), null, null)).toBe(true)
    expect(isPlayable(c('oros', 7), c('espadas', 2), 'copas', null)).toBe(true)
  })

  it('chosenSuit remplace la couleur du sommet', () => {
    expect(isPlayable(c('copas', 3), top, 'copas', null)).toBe(true)
    expect(isPlayable(c('copas', 3), top, 'espadas', null)).toBe(false)
  })

  it('pendant draw2 → seul un 2 peut contrer', () => {
    const eff: PendingEffect = { type: 'draw2', count: 2 }
    expect(isPlayable(c('oros', 2),  top, null, eff)).toBe(true)
    expect(isPlayable(c('copas', 2), top, null, eff)).toBe(true)
    expect(isPlayable(c('oros', 5),  top, null, eff)).toBe(false)
  })

  it('pendant skip → seul un As peut contrer', () => {
    const eff: PendingEffect = { type: 'skip' }
    expect(isPlayable(c('oros', 1),  top, null, eff)).toBe(true)
    expect(isPlayable(c('copas', 1), top, null, eff)).toBe(true)
    expect(isPlayable(c('oros', 5),  top, null, eff)).toBe(false)
  })
})

// ── 4. applyPlayCard — coups normaux ──────────────────────────────────────────

describe('applyPlayCard — normal', () => {
  it('jouer carte de même couleur → tour suivant, carte en défausse', () => {
    const s = makeState({ humanHand: [c('oros', 3), c('oros', 6)], discardTop: c('oros', 5) })
    const r = applyPlayCard(s, 0, c('oros', 3))
    expect(r.currentPlayerId).toBe(1)
    expect(r.players[0].hand).toHaveLength(1)
    expect(r.discardPile.at(-1)).toEqual(c('oros', 3))
    expect(r.pendingEffect).toBeNull()
    expect(r.chosenSuit).toBeNull()
  })

  it('carte non jouable → état inchangé', () => {
    const s = makeState({ humanHand: [c('copas', 3)], discardTop: c('oros', 5) })
    const r = applyPlayCard(s, 0, c('copas', 3))
    expect(r).toBe(s)
  })

  it('carte absente de la main → état inchangé', () => {
    const s = makeState({ humanHand: [c('oros', 3)], discardTop: c('oros', 5) })
    const r = applyPlayCard(s, 0, c('oros', 6))
    expect(r).toBe(s)
  })

  it('mauvais joueur → état inchangé', () => {
    const s = makeState({ humanHand: [c('oros', 3)], discardTop: c('oros', 5), currentPlayer: 1 })
    const r = applyPlayCard(s, 0, c('oros', 3))
    expect(r).toBe(s)
  })
})

// ── 5. applyPlayCard — victoire ───────────────────────────────────────────────

describe('applyPlayCard — victoire', () => {
  it('main vide après le coup → isOver + winnerId', () => {
    const s = makeState({ humanHand: [c('oros', 5)], discardTop: c('oros', 3) })
    const r = applyPlayCard(s, 0, c('oros', 5))
    expect(r.isOver).toBe(true)
    expect(r.winnerId).toBe(0)
    expect(r.players[0].hand).toHaveLength(0)
  })

  it('isGameOver détecte la fin', () => {
    const s = makeState({ humanHand: [c('oros', 5)], discardTop: c('oros', 3) })
    const r = applyPlayCard(s, 0, c('oros', 5))
    expect(isGameOver(r)).toBe(true)
  })
})

// ── 6. applyPlayCard — 2 (Di Jouj) ───────────────────────────────────────────

describe('applyPlayCard — 2 Di Jouj', () => {
  it('jouer un 2 crée un pendingEffect draw2 avec count=2', () => {
    const s = makeState({ humanHand: [c('oros', 2), c('oros', 6)], discardTop: c('oros', 5) })
    const r = applyPlayCard(s, 0, c('oros', 2))
    expect(r.pendingEffect).toEqual({ type: 'draw2', count: 2 })
    expect(r.currentPlayerId).toBe(1)
  })

  it('empiler un 2 sur un draw2 existant accumule le count', () => {
    const s = makeState({
      humanHand:     [c('copas', 2), c('copas', 6)],
      discardTop:    c('oros', 2),
      currentPlayer: 0,
      pendingEffect: { type: 'draw2', count: 2 },
    })
    const r = applyPlayCard(s, 0, c('copas', 2))
    expect(r.pendingEffect).toEqual({ type: 'draw2', count: 4 })
  })

  it('résoudre un draw2 avec applyDraw : pioche N cartes + passe', () => {
    const drawPile = [c('bastos', 3), c('bastos', 4), c('bastos', 5), c('bastos', 6)]
    const s = makeState({
      botHand:       [c('copas', 7)],
      drawPile,
      discardTop:    c('oros', 2),
      currentPlayer: 1,
      pendingEffect: { type: 'draw2', count: 4 },
    })
    const r = applyDraw(s, 1, rng0)
    expect(r.players[1].hand).toHaveLength(5)   // 1 initial + 4 piochées
    expect(r.currentPlayerId).toBe(0)
    expect(r.pendingEffect).toBeNull()
  })
})

// ── 7. applyPlayCard — As (skip) ──────────────────────────────────────────────

describe('applyPlayCard — As', () => {
  it('jouer un As crée un pendingEffect skip', () => {
    const s = makeState({ humanHand: [c('oros', 1), c('oros', 6)], discardTop: c('oros', 5) })
    const r = applyPlayCard(s, 0, c('oros', 1))
    expect(r.pendingEffect).toEqual({ type: 'skip' })
    expect(r.currentPlayerId).toBe(1)
  })

  it('résoudre un skip avec applyDraw : passe sans piocher', () => {
    const s = makeState({
      botHand:       [c('bastos', 6)],
      discardTop:    c('oros', 1),
      currentPlayer: 1,
      pendingEffect: { type: 'skip' },
    })
    const beforeLen = s.players[1].hand.length
    const r = applyDraw(s, 1, rng0)
    expect(r.players[1].hand).toHaveLength(beforeLen)  // pas de pioche
    expect(r.currentPlayerId).toBe(0)
    expect(r.pendingEffect).toBeNull()
  })

  it('empiler un As sur un skip — prochain joueur hérite du skip', () => {
    const s = makeState({
      botHand:       [c('copas', 1), c('copas', 6)],
      discardTop:    c('oros', 1),
      currentPlayer: 1,
      pendingEffect: { type: 'skip' },
    })
    const r = applyPlayCard(s, 1, c('copas', 1))
    expect(r.pendingEffect).toEqual({ type: 'skip' })
    expect(r.currentPlayerId).toBe(0)
  })
})

// ── 8. applyPlayCard — 7 de Oros ─────────────────────────────────────────────

describe('applyPlayCard — 7 de Oros', () => {
  it('impose la couleur choisie', () => {
    const s = makeState({ humanHand: [c('oros', 7), c('oros', 6)], discardTop: c('bastos', 12) })
    const r = applyPlayCard(s, 0, c('oros', 7), 'copas')
    expect(r.chosenSuit).toBe('copas')
    expect(r.pendingEffect).toBeNull()
  })

  it('la carte suivante doit respecter chosenSuit', () => {
    const s = makeState({
      botHand:       [c('copas', 3), c('copas', 6)],
      discardTop:    c('oros', 7),
      currentPlayer: 1,
      chosenSuit:    'copas',
    })
    const r = applyPlayCard(s, 1, c('copas', 3))
    expect(r.currentPlayerId).toBe(0)
    expect(r.chosenSuit).toBeNull()
  })

  it('jouer une carte de mauvaise couleur après 7 oros est refusé', () => {
    const s = makeState({
      botHand:       [c('bastos', 3)],
      discardTop:    c('oros', 7),
      currentPlayer: 1,
      chosenSuit:    'copas',
    })
    expect(applyPlayCard(s, 1, c('bastos', 3))).toBe(s)
  })

  it('un autre 7 de Oros est jouable quelle que soit la couleur imposée', () => {
    const s = makeState({
      botHand:       [c('oros', 7), c('espadas', 6)],
      discardTop:    c('copas', 5),
      currentPlayer: 1,
      chosenSuit:    'espadas',
    })
    const r = applyPlayCard(s, 1, c('oros', 7), 'bastos')
    expect(r.chosenSuit).toBe('bastos')
  })
})

// ── 9. applyDraw — pioche normale ─────────────────────────────────────────────

describe('applyDraw — pioche normale', () => {
  it('pioche 1 carte si aucune jouable', () => {
    const s = makeState({
      humanHand:  [c('copas', 3)],
      discardTop: c('oros', 5),
      drawPile:   [c('bastos', 12)],
    })
    const r = applyDraw(s, 0, rng0)
    expect(r.players[0].hand).toHaveLength(2)
    expect(r.drawPile).toHaveLength(0)
  })

  it('garde son tour si la carte piochée est jouable', () => {
    // Humain doit piocher ; la carte piochée est de même couleur que le sommet
    const s = makeState({
      humanHand:  [c('copas', 3)],
      discardTop: c('oros', 5),
      drawPile:   [c('oros', 11)],  // jouable (même couleur oros)
    })
    const r = applyDraw(s, 0, rng0)
    expect(r.currentPlayerId).toBe(0)   // garde le tour
    expect(r.players[0].hand).toHaveLength(2)
  })

  it('passe le tour si la carte piochée n\'est pas jouable', () => {
    const s = makeState({
      humanHand:  [c('copas', 3)],
      discardTop: c('oros', 5),
      drawPile:   [c('bastos', 6)],  // non jouable
    })
    const r = applyDraw(s, 0, rng0)
    expect(r.currentPlayerId).toBe(1)
  })

  it('refusé si le joueur a des cartes jouables', () => {
    const s = makeState({
      humanHand:  [c('oros', 3)],   // jouable (même couleur)
      discardTop: c('oros', 5),
      drawPile:   [c('bastos', 6)],
    })
    expect(applyDraw(s, 0, rng0)).toBe(s)
  })

  it('refill de la pioche depuis la défausse si vide', () => {
    const s = makeState({
      humanHand:   [c('copas', 3)],
      discardTop:  c('oros', 5),
      drawPile:    [],
      // défausse avec 3 cartes hors le sommet → seront remélangées
    })
    // On modifie la défausse pour avoir plusieurs cartes
    const s2: GameState = {
      ...s,
      discardPile: [c('copas', 2), c('bastos', 4), c('oros', 5)],
    }
    const r = applyDraw(s2, 0, rng0)
    // Doit avoir pioché au moins 1 carte
    expect(r.players[0].hand.length).toBeGreaterThan(s2.players[0].hand.length)
  })
})

// ── 10. Bot ───────────────────────────────────────────────────────────────────

describe('bot', () => {
  it('joue une carte quand il en a une de jouable', () => {
    const s = makeState({
      botHand:       [c('oros', 5)],
      discardTop:    c('oros', 3),
      currentPlayer: 1,
    })
    const a = botPlay(s, 1)
    expect(a.type).toBe('play')
  })

  it('pioche quand aucune carte jouable', () => {
    const s = makeState({
      botHand:       [c('copas', 3)],
      discardTop:    c('oros', 5),
      currentPlayer: 1,
    })
    const a = botPlay(s, 1)
    expect(a.type).toBe('draw')
  })

  it('préfère le 2 (Di Jouj) aux cartes ordinaires', () => {
    const s = makeState({
      botHand:       [c('oros', 3), c('oros', 2)],
      discardTop:    c('oros', 5),
      currentPlayer: 1,
    })
    const a = botPlay(s, 1)
    expect(a.type).toBe('play')
    if (a.type === 'play') expect(a.card.value).toBe(2)
  })

  it('préfère l\'As (skip) aux cartes ordinaires', () => {
    const s = makeState({
      botHand:       [c('oros', 3), c('oros', 1)],
      discardTop:    c('oros', 5),
      currentPlayer: 1,
    })
    const a = botPlay(s, 1)
    if (a.type === 'play') expect(a.card.value).toBe(1)
  })

  it('7 de Oros : choisit la couleur la plus représentée', () => {
    const s = makeState({
      botHand: [
        c('oros', 7),
        c('copas', 3), c('copas', 4), c('copas', 5),
        c('bastos', 6),
      ],
      discardTop:    c('espadas', 2),
      currentPlayer: 1,
    })
    const a = botPlay(s, 1)
    expect(a.type).toBe('play')
    if (a.type === 'play') {
      expect(a.card).toEqual(c('oros', 7))
      expect(a.chosenSuit).toBe('copas')  // 3 copas > 1 bastos > 0 oros/espadas
    }
  })

  it('empile un 2 contre un draw2 en attente', () => {
    const s = makeState({
      botHand:       [c('copas', 2), c('copas', 6)],
      discardTop:    c('oros', 2),
      currentPlayer: 1,
      pendingEffect: { type: 'draw2', count: 2 },
    })
    const a = botPlay(s, 1)
    expect(a.type).toBe('play')
    if (a.type === 'play') expect(a.card.value).toBe(2)
  })

  it('empile un As contre un skip en attente', () => {
    const s = makeState({
      botHand:       [c('copas', 1), c('copas', 6)],
      discardTop:    c('oros', 1),
      currentPlayer: 1,
      pendingEffect: { type: 'skip' },
    })
    const a = botPlay(s, 1)
    expect(a.type).toBe('play')
    if (a.type === 'play') expect(a.card.value).toBe(1)
  })
})

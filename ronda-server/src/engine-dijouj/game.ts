import type { GameState, Card, Suit, PendingEffect } from './types'
import type { Rng } from './deck'
import { shuffle } from './deck'

function nextId(currentId: number, count: number): number {
  return (currentId + 1) % count
}

function drawCards(
  drawPile: Card[],
  discardPile: Card[],
  count: number,
  rng: Rng,
): { drawPile: Card[]; discardPile: Card[]; drawn: Card[] } {
  let dp   = [...drawPile]
  let disc = [...discardPile]
  const drawn: Card[] = []

  for (let i = 0; i < count; i++) {
    if (dp.length === 0) {
      if (disc.length <= 1) break
      const top = disc[disc.length - 1]
      dp   = shuffle(disc.slice(0, -1), rng)
      disc = [top]
    }
    drawn.push(dp.pop()!)
  }

  return { drawPile: dp, discardPile: disc, drawn }
}

export function isPlayable(
  card:          Card,
  topCard:       Card,
  chosenSuit:    Suit | null,
  pendingEffect: PendingEffect,
): boolean {
  if (pendingEffect?.type === 'draw2') return card.value === 2
  if (pendingEffect?.type === 'skip')  return card.value === 1
  // Le 7 de Oros reste un joker jouable à tout moment.
  if (card.value === 7 && card.suit === 'oros') return true
  // Une couleur imposée par un 7 de Oros doit être respectée : la règle
  // « même valeur que le sommet » ne s'applique plus ici, sinon n'importe
  // quel 7 (7_bastos, 7_espadas…) contournerait la couleur choisie.
  if (chosenSuit) return card.suit === chosenSuit
  return card.suit === topCard.suit || card.value === topCard.value
}

export function applyPlayCard(
  state:       GameState,
  playerId:    number,
  card:        Card,
  chosenSuit?: Suit,
): GameState {
  if (state.isOver || state.currentPlayerId !== playerId) return state

  const topCard = state.discardPile[state.discardPile.length - 1]
  if (!isPlayable(card, topCard, state.chosenSuit, state.pendingEffect)) return state

  const player  = state.players[playerId]
  const cardIdx = player.hand.findIndex(c => c.suit === card.suit && c.value === card.value)
  if (cardIdx === -1) return state

  const newHand    = player.hand.filter((_, i) => i !== cardIdx)
  const newPlayers = state.players.map((p, i) => (i === playerId ? { ...p, hand: newHand } : p))
  const newDiscard = [...state.discardPile, card]
  const nextPId    = nextId(playerId, state.players.length)

  if (newHand.length === 0) {
    return { ...state, players: newPlayers, discardPile: newDiscard, isOver: true, winnerId: playerId }
  }

  if (card.value === 2) {
    const prev = state.pendingEffect?.type === 'draw2' ? state.pendingEffect.count : 0
    return {
      ...state,
      players:         newPlayers,
      discardPile:     newDiscard,
      currentPlayerId: nextPId,
      chosenSuit:      null,
      pendingEffect:   { type: 'draw2', count: prev + 2 },
    }
  }

  if (card.value === 1) {
    return {
      ...state,
      players:         newPlayers,
      discardPile:     newDiscard,
      currentPlayerId: nextPId,
      chosenSuit:      null,
      pendingEffect:   { type: 'skip' },
    }
  }

  if (card.value === 7 && card.suit === 'oros') {
    return {
      ...state,
      players:         newPlayers,
      discardPile:     newDiscard,
      currentPlayerId: nextPId,
      chosenSuit:      chosenSuit ?? 'oros',
      pendingEffect:   null,
    }
  }

  return {
    ...state,
    players:         newPlayers,
    discardPile:     newDiscard,
    currentPlayerId: nextPId,
    chosenSuit:      null,
    pendingEffect:   null,
  }
}

export function applyDraw(
  state:    GameState,
  playerId: number,
  rng:      Rng = Math.random,
): GameState {
  if (state.isOver || state.currentPlayerId !== playerId) return state

  const player  = state.players[playerId]
  const nextPId = nextId(playerId, state.players.length)

  if (state.pendingEffect?.type === 'draw2') {
    const { drawPile, discardPile, drawn } = drawCards(
      state.drawPile, state.discardPile, state.pendingEffect.count, rng,
    )
    const newPlayers = state.players.map((p, i) =>
      i === playerId ? { ...p, hand: [...p.hand, ...drawn] } : p,
    )
    return {
      ...state,
      players:         newPlayers,
      drawPile,
      discardPile,
      currentPlayerId: nextPId,
      pendingEffect:   null,
    }
  }

  if (state.pendingEffect?.type === 'skip') {
    return { ...state, currentPlayerId: nextPId, pendingEffect: null }
  }

  const { drawPile, discardPile, drawn } = drawCards(
    state.drawPile, state.discardPile, 1, rng,
  )

  if (drawn.length === 0) {
    return { ...state, currentPlayerId: nextPId }
  }

  const newHand    = [...player.hand, drawn[0]]
  const newPlayers = state.players.map((p, i) => (i === playerId ? { ...p, hand: newHand } : p))

  return { ...state, players: newPlayers, drawPile, discardPile, currentPlayerId: nextPId }
}

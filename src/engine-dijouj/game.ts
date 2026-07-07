import type { GameState, Card, Suit, PendingEffect } from './types'
import type { Rng } from './deck'
import { shuffle } from './deck'

// ── Helpers internes ──────────────────────────────────────────────────────────

function nextId(currentId: number, count: number): number {
  return (currentId + 1) % count
}

/**
 * Pioche jusqu'à `count` cartes. Si la pioche est vide, mélange la défausse
 * (hors sommet) pour la reconstituer.
 */
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
      if (disc.length <= 1) break          // plus rien à redistribuer
      const top = disc[disc.length - 1]
      dp   = shuffle(disc.slice(0, -1), rng)
      disc = [top]
    }
    drawn.push(dp.pop()!)
  }

  return { drawPile: dp, discardPile: disc, drawn }
}

// ── API publique ──────────────────────────────────────────────────────────────

/**
 * Teste si une carte peut être jouée dans le contexte actuel.
 *
 * Règles de jeu :
 * - Pendant un draw2 en attente : seul un autre 2 peut être joué (empilement).
 * - Pendant un skip en attente  : seul un As peut être joué (empilement).
 * - Si une couleur a été imposée par un 7 de Oros (chosenSuit défini) : seule
 *   cette couleur est jouable, SAUF un nouveau 7 de Oros qui peut la changer
 *   à nouveau (joker). La règle « même valeur que le sommet » ne s'applique
 *   plus ici — sinon n'importe quel 7 (7_bastos, 7_espadas…) contournerait la
 *   couleur choisie simplement parce que le sommet affiche un 7.
 * - Sinon (pas de couleur imposée) : même couleur OU même valeur que le
 *   sommet de la défausse.
 */
export function isPlayable(
  card:          Card,
  topCard:       Card,
  chosenSuit:    Suit | null,
  pendingEffect: PendingEffect,
): boolean {
  if (pendingEffect?.type === 'draw2') return card.value === 2
  if (pendingEffect?.type === 'skip')  return card.value === 1

  const isWildSeven = card.value === 7 && card.suit === 'oros'

  if (chosenSuit) return card.suit === chosenSuit || isWildSeven

  return card.suit === topCard.suit || card.value === topCard.value
}

/**
 * Le joueur `playerId` joue `card` depuis sa main.
 * `chosenSuit` est requis uniquement pour le 7 de Oros.
 * Retourne l'état inchangé si le coup est invalide.
 */
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

  // ── Victoire ────────────────────────────────────────────────────────────────
  if (newHand.length === 0) {
    return { ...state, players: newPlayers, discardPile: newDiscard, isOver: true, winnerId: playerId }
  }

  // ── 2 (Di Jouj) : pioche 2 + passe le tour — cumulable ────────────────────
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

  // ── As : passe le tour — cumulable ─────────────────────────────────────────
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

  // ── 7 de Oros : changer la couleur ─────────────────────────────────────────
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

  // ── Carte normale ───────────────────────────────────────────────────────────
  return {
    ...state,
    players:         newPlayers,
    discardPile:     newDiscard,
    currentPlayerId: nextPId,
    chosenSuit:      null,
    pendingEffect:   null,
  }
}

/**
 * Le joueur courant ne peut pas (ou choisit de ne pas) jouer.
 *
 * - draw2 en attente : pioche N cartes accumulées + passe le tour.
 * - skip en attente  : passe le tour sans piocher.
 * - Sinon            : pioche 1 carte. Si jouable, le joueur garde son tour.
 *                      Si non jouable, le tour passe.
 *
 * La pioche normale est refusée si le joueur a des cartes jouables.
 */
export function applyDraw(
  state:    GameState,
  playerId: number,
  rng:      Rng = Math.random,
): GameState {
  if (state.isOver || state.currentPlayerId !== playerId) return state

  const player  = state.players[playerId]
  const topCard = state.discardPile[state.discardPile.length - 1]
  const nextPId = nextId(playerId, state.players.length)

  // ── Résolution draw2 ────────────────────────────────────────────────────────
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

  // ── Résolution skip ─────────────────────────────────────────────────────────
  if (state.pendingEffect?.type === 'skip') {
    return { ...state, currentPlayerId: nextPId, pendingEffect: null }
  }

  // ── Pioche normale : toujours autorisée ────────────────────────────────────
  const { drawPile, discardPile, drawn } = drawCards(
    state.drawPile, state.discardPile, 1, rng,
  )

  if (drawn.length === 0) {
    // Plus de cartes disponibles — passe le tour
    return { ...state, currentPlayerId: nextPId }
  }

  const drawnCard  = drawn[0]
  const newHand    = [...player.hand, drawnCard]
  const newPlayers = state.players.map((p, i) => (i === playerId ? { ...p, hand: newHand } : p))

  return { ...state, players: newPlayers, drawPile, discardPile, currentPlayerId: nextPId }
}

export function isGameOver(state: GameState): boolean {
  return state.isOver
}

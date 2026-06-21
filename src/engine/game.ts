import type {
  Action,
  Card,
  GameEvent,
  GameState,
  PlayerId,
  PlayerState,
  Value,
} from './types'
import { resolveCapture } from './capture'
import {
  detectCombination,
  basePoints,
  resolveConflict,
  resolveContest,
} from './combinations'
import { applyEndOfDeal } from './scoring'
import { dealNextRound, CARDS_PER_REDEAL } from './deal'
import type { Rng } from './deck'

// ---------------------------------------------------------------------------
// Helpers immuables
// ---------------------------------------------------------------------------

function updatePlayer(
  state: GameState,
  id: PlayerId,
  patch: Partial<PlayerState>,
): GameState {
  const players: [PlayerState, PlayerState] = [
    { ...state.players[0] },
    { ...state.players[1] },
  ]
  players[id] = { ...players[id], ...patch }
  return { ...state, players }
}

function sameCard(a: Card, b: Card): boolean {
  return a.value === b.value && a.suit === b.suit
}

function cardInHand(hand: readonly Card[], card: Card): boolean {
  return hand.some(c => sameCard(c, card))
}

function removeFromHand(hand: readonly Card[], card: Card): Card[] {
  const idx = hand.findIndex(c => sameCard(c, card))
  if (idx === -1) throw new Error(`Card not in hand: ${card.value} ${card.suit}`)
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)]
}

// ---------------------------------------------------------------------------
// Gestion de la fin de tour
// ---------------------------------------------------------------------------

function advanceTurn(state: GameState, rng: Rng): GameState {
  const handsEmpty =
    state.players[0].hand.length === 0 && state.players[1].hand.length === 0

  if (!handsEmpty) {
    const next = (1 - state.currentPlayer) as PlayerId
    return { ...state, currentPlayer: next }
  }

  // On ne redistribue que si la pioche permet un tour complet (3 cartes × 2).
  // Sinon la donne se termine (les ~2 dernières cartes restent non distribuées).
  if (state.deck.length >= CARDS_PER_REDEAL) {
    return dealNextRound(state, rng)
  }

  return applyEndOfDeal(state, rng)
}

// ---------------------------------------------------------------------------
// Action PLAY_CARD
// ---------------------------------------------------------------------------

function applyPlayCard(
  state: GameState,
  playerId: PlayerId,
  card: Card,
  rng: Rng,
): GameState {
  if (state.phase === 'GAME_OVER') throw new Error('Game is over')
  if (state.currentPlayer !== playerId) throw new Error('Not your turn')
  if (!cardInHand(state.players[playerId].hand, card)) throw new Error('Card not in hand')

  const opponent = (1 - playerId) as PlayerId

  // ── Étape 0 : carte laissée sur la table par une caída précédente ──────────
  // La carte d'une caída n'y reste qu'UN tour. Si le coup courant n'est PAS une
  // caída de même valeur, cette carte repart dans la pile de celui qui l'avait
  // posée AVANT de traiter le nouveau coup.
  const pending = state.pendingCaidaCard
  const continuesChain = pending !== null && card.value === pending.card.value
  let base = state
  if (pending !== null && !continuesChain) {
    const players: [PlayerState, PlayerState] = [
      { ...state.players[0] },
      { ...state.players[1] },
    ]
    players[pending.playerId] = {
      ...players[pending.playerId],
      captured: [...players[pending.playerId].captured, pending.card],
    }
    base = {
      ...state,
      table: state.table.filter(c => !sameCard(c, pending.card)),
      players,
      pendingCaidaCard: null,
    }
  }

  const lastPlayedByOpponent = base.lastPlayed[opponent]
  const player = base.players[playerId]

  const newHand = removeFromHand(player.hand, card)

  // Perte du droit à déclarer si la carte jouée faisait partie de la combo détectée
  const wasPartOfCombo =
    player.pendingCombo !== null &&
    player.pendingCombo.cards.some(c => sameCard(c, card))
  const lostRight = !player.lostComboRight && wasPartOfCombo

  // Toutes les cartes jouées dans cette redistribution (pour la validation du contre)
  const newPlayedThisRound = [...player.playedThisRound, card]

  const captureResult = resolveCapture(card, base.table, lastPlayedByOpponent)
  const newLastPlayed: [Card | null, Card | null] = [base.lastPlayed[0], base.lastPlayed[1]]
  newLastPlayed[playerId] = card

  // ── Chaîne de caídas (section 3.2) ──────────────────────────────────────
  // Une caída fait monter la chaîne tant que c'est la MÊME valeur ; la carte
  // joueuse reste 1 tour (pendingCaidaCard) et devient l'appât du tour suivant.
  const prevChain = base.caidaChain
  let caidaLevel: 0 | 1 | 2 | 3 = 0
  let newCaidaChain: GameState['caidaChain'] = null
  if (captureResult !== null && captureResult.isCaida) {
    if (prevChain !== null && prevChain.value === card.value && prevChain.level === 1) {
      caidaLevel = 2                                  // Ara Khamssa
    } else if (prevChain !== null && prevChain.value === card.value && prevChain.level === 2) {
      caidaLevel = 3                                  // Ara 7dach
    } else {
      caidaLevel = 1                                  // Ara Wahd (nouvelle chaîne)
    }
    newCaidaChain = { level: caidaLevel, value: card.value }
  }

  const caidaPoints = caidaLevel === 3 ? 11 : caidaLevel === 2 ? 5 : caidaLevel === 1 ? 1 : 0
  const caidaEvents: GameEvent[] =
    caidaLevel === 3 ? ['ara_7dach'] :
    caidaLevel === 2 ? ['ara_khamssa'] :
    caidaLevel === 1 ? ['caida'] : []

  // Carte laissée 1 tour si caída (sinon aucune).
  const newPending: GameState['pendingCaidaCard'] =
    captureResult !== null && captureResult.isCaida ? { card, playerId } : null

  let newState: GameState

  if (captureResult !== null) {
    const { captured, tableAfter, isMissa, remainsOnTable } = captureResult

    let scoreBonus = caidaPoints
    if (isMissa) scoreBonus += 1

    const events: GameEvent[] = [
      ...caidaEvents,
      ...(isMissa ? (['missa'] as const) : []),
    ]

    // Caída : la carte joueuse RESTE sur la table → pile = cartes adverses seulement,
    // table = tableAfter + la carte joueuse. Sinon, la carte joueuse va dans la pile.
    const newPile = remainsOnTable !== null
      ? [...player.captured, ...captured]
      : [...player.captured, card, ...captured]
    const finalTable = remainsOnTable !== null ? [...tableAfter, remainsOnTable] : tableAfter

    const updatedPlayer: PlayerState = {
      ...player,
      hand: newHand,
      captured: newPile,
      score: player.score + scoreBonus,
      lostComboRight: player.lostComboRight || lostRight,
      playedThisRound: newPlayedThisRound,
      pendingCombo: detectCombination(newHand),
    }

    newState = {
      ...base,
      table: finalTable,
      players: [
        playerId === 0 ? updatedPlayer : base.players[0],
        playerId === 1 ? updatedPlayer : base.players[1],
      ],
      // Caída : la « prise » est la carte adverse capturée ; sinon la carte joueuse.
      lastCapture: { playerId, card: remainsOnTable !== null ? captured[0] : card },
      lastPlayed: newLastPlayed,
      caidaChain: newCaidaChain,
      pendingCaidaCard: newPending,
      lastEvents: events,
      eventSeq: events.length > 0 ? base.eventSeq + 1 : base.eventSeq,
    }
  } else {
    const updatedPlayer: PlayerState = {
      ...player,
      hand: newHand,
      lostComboRight: player.lostComboRight || lostRight,
      playedThisRound: newPlayedThisRound,
      pendingCombo: detectCombination(newHand),
    }

    newState = {
      ...base,
      table: [...base.table, card],
      players: [
        playerId === 0 ? updatedPlayer : base.players[0],
        playerId === 1 ? updatedPlayer : base.players[1],
      ],
      lastPlayed: newLastPlayed,
      caidaChain: newCaidaChain,       // null (coup sans capture → chaîne brisée)
      pendingCaidaCard: null,
      lastEvents: [],
      eventSeq: base.eventSeq,
    }
  }

  return advanceTurn(newState, rng)
}

// ---------------------------------------------------------------------------
// Action DECLARE
// ---------------------------------------------------------------------------

function applyDeclare(
  state: GameState,
  playerId: PlayerId,
  combination: PlayerState['pendingCombo'],
): GameState {
  if (combination === null) throw new Error('No combination to declare')
  // La déclaration est une annonce libre : elle n'avance pas le tour et peut
  // donc être faite même hors de son tour (le bouton Ronda/Tringa reste visible
  // côté UI quel que soit le tour courant).

  const player = state.players[playerId]
  if (player.lostComboRight) throw new Error('Lost right to declare')

  for (const c of combination.cards) {
    if (!cardInHand(player.hand, c)) throw new Error('No longer holding all combo cards')
  }

  const opponent = (1 - playerId) as PlayerId
  const opponentPlayer = state.players[opponent]

  const declareEvent: GameEvent = combination.type  // 'ronda' | 'tringa'

  if (opponentPlayer.declaredCombo !== null) {
    // resolveConflict(comboA, comboB) : comboA = la combo du déclarant courant.
    // Donc pointsA va TOUJOURS au déclarant et pointsB à l'adversaire, quel que
    // soit playerId. (Bug corrigé : avant, un déclarant = joueur 1 récupérait à
    // tort pointsB → une Ronda 12 du bot battait une Tringa 10 du joueur.)
    const { pointsA, pointsB } = resolveConflict(combination, opponentPlayer.declaredCombo)
    const myPoints = pointsA
    const opPoints = pointsB
    const opAlreadyMarked = basePoints(opponentPlayer.declaredCombo)

    let s = updatePlayer(state, playerId, {
      declaredCombo: combination,
      score: player.score + myPoints,
    })
    s = updatePlayer(s, opponent, {
      declaredCombo: null,
      score: opponentPlayer.score - opAlreadyMarked + opPoints,
    })
    return { ...s, lastEvents: [declareEvent], eventSeq: state.eventSeq + 1 }
  }

  const s = updatePlayer(state, playerId, {
    declaredCombo: combination,
    score: player.score + basePoints(combination),
  })
  return { ...s, lastEvents: [declareEvent], eventSeq: state.eventSeq + 1 }
}

// ---------------------------------------------------------------------------
// Action CONTEST
// ---------------------------------------------------------------------------

function applyContest(
  state: GameState,
  contestorId: PlayerId,
  accusedValue: Value,
): GameState {
  if (state.currentPlayer !== contestorId) throw new Error('Not your turn')

  const opponent = (1 - contestorId) as PlayerId
  const opponentPlayer = state.players[opponent]
  const contestorPlayer = state.players[contestorId]

  const { contestorDelta, wasCorrect } = resolveContest(
    accusedValue,
    opponentPlayer.playedThisRound,
    opponentPlayer.hand,
  )

  const s = wasCorrect
    ? updatePlayer(state, contestorId, { score: contestorPlayer.score + contestorDelta })
    : updatePlayer(state, contestorId, { score: Math.max(0, contestorPlayer.score + contestorDelta) })

  return { ...s, lastEvents: ['contre'], eventSeq: state.eventSeq + 1 }
}

// ---------------------------------------------------------------------------
// Réducteur principal
// ---------------------------------------------------------------------------

export function applyAction(state: GameState, action: Action, rng: Rng): GameState {
  switch (action.type) {
    case 'PLAY_CARD':
      return applyPlayCard(state, action.playerId, action.card, rng)
    case 'DECLARE':
      return applyDeclare(state, action.playerId, action.combination)
    case 'CONTEST':
      return applyContest(state, action.playerId, action.accusedValue)
  }
}

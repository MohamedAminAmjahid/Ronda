import type { Card, GameEvent, Combination, Value } from '../engine/types'
import { resolveCapture } from '../engine/capture'
import { detectCombination, resolveContest } from '../engine/combinations'
import type { Rng } from '../engine/deck'
import { dealNextRound2v2 } from './deal2v2'
import { applyEndOfDeal2v2 } from './scoring2v2'
import { resolveCombos2v2 } from './combos2v2'
import type {
  Action2v2,
  GameState2v2,
  PlayerId2v2,
  PlayerState2v2,
  TeamState,
} from './types2v2'
import { teamOf, nextPlayer, prevPlayer } from './types2v2'

// ── Helpers immuables ─────────────────────────────────────────────────────────

function sameCard(a: Card, b: Card): boolean {
  return a.value === b.value && a.suit === b.suit
}

function cardInHand(hand: readonly Card[], card: Card): boolean {
  return hand.some((c) => sameCard(c, card))
}

function removeFromHand(hand: readonly Card[], card: Card): Card[] {
  const idx = hand.findIndex((c) => sameCard(c, card))
  if (idx === -1) throw new Error(`Card not in hand: ${card.value} ${card.suit}`)
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)]
}

type Players4 = [PlayerState2v2, PlayerState2v2, PlayerState2v2, PlayerState2v2]
type Teams2 = [TeamState, TeamState]

function withPlayer(
  players: GameState2v2['players'],
  id: PlayerId2v2,
  patch: Partial<PlayerState2v2>,
): Players4 {
  const arr: Players4 = [players[0], players[1], players[2], players[3]]
  arr[id] = { ...arr[id], ...patch }
  return arr
}

function withTeam(teams: GameState2v2['teams'], t: 0 | 1, patch: Partial<TeamState>): Teams2 {
  const arr: Teams2 = [teams[0], teams[1]]
  arr[t] = { ...arr[t], ...patch }
  return arr
}

function declaredArray(
  players: GameState2v2['players'],
): [Combination | null, Combination | null, Combination | null, Combination | null] {
  return [
    players[0].declaredCombo,
    players[1].declaredCombo,
    players[2].declaredCombo,
    players[3].declaredCombo,
  ]
}

// ── Fin de tour ─────────────────────────────────────────────────────────────────

function advanceTurn2v2(state: GameState2v2, rng: Rng): GameState2v2 {
  const handsEmpty = state.players.every((p) => p.hand.length === 0)

  if (!handsEmpty) {
    return { ...state, currentPlayer: nextPlayer(state.currentPlayer) }
  }
  if (state.deck.length > 0) {
    return dealNextRound2v2(state, rng)
  }
  return applyEndOfDeal2v2(state, rng)
}

// ── PLAY_CARD ─────────────────────────────────────────────────────────────────

function applyPlayCard2v2(
  state: GameState2v2,
  playerId: PlayerId2v2,
  card: Card,
  rng: Rng,
): GameState2v2 {
  if (state.phase === 'GAME_OVER') throw new Error('Game is over')
  if (state.currentPlayer !== playerId) throw new Error('Not your turn')
  if (!cardInHand(state.players[playerId].hand, card)) throw new Error('Card not in hand')

  // ── Étape 0 : carte laissée sur la table par une caída précédente ──────────
  // La carte d'une caída n'y reste qu'UN tour. Si le coup courant n'est PAS une
  // caída de même valeur, elle repart dans la pile de l'ÉQUIPE de celui qui
  // l'avait posée AVANT de traiter le nouveau coup.
  const pending = state.pendingCaidaCard
  const continuesChain = pending !== null && card.value === pending.card.value
  let base = state
  if (pending !== null && !continuesChain) {
    const pTeam = teamOf(pending.playerId)
    base = {
      ...state,
      table: state.table.filter((c) => !sameCard(c, pending.card)),
      teams: withTeam(state.teams, pTeam, {
        captured: [...state.teams[pTeam].captured, pending.card],
      }),
      pendingCaidaCard: null,
    }
  }

  const player = base.players[playerId]
  const newHand = removeFromHand(player.hand, card)

  const wasPartOfCombo =
    player.pendingCombo !== null && player.pendingCombo.cards.some((c) => sameCard(c, card))
  const lostRight = !player.lostComboRight && wasPartOfCombo
  const newPlayedThisRound = [...player.playedThisRound, card]

  // Caída : on compare à la dernière carte posée par le joueur PRÉCÉDENT (sens du jeu).
  const lastPlayedByPrev = base.lastPlayed[prevPlayer(playerId)]
  const captureResult = resolveCapture(card, base.table, lastPlayedByPrev)

  const newLastPlayed: [Card | null, Card | null, Card | null, Card | null] = [
    base.lastPlayed[0],
    base.lastPlayed[1],
    base.lastPlayed[2],
    base.lastPlayed[3],
  ]
  newLastPlayed[playerId] = card

  // ── Chaîne de caídas (traverse les équipes dans le sens du jeu) ────────────
  // Règle « la carte joueuse reste 1 tour » : les caídas s'enchaînent directement
  // (cf. game.ts). Tout coup non-caída brise la chaîne.
  const prevChain = base.caidaChain
  let caidaLevel: 0 | 1 | 2 | 3 = 0
  let newCaidaChain: GameState2v2['caidaChain'] = null
  if (captureResult !== null && captureResult.isCaida) {
    if (prevChain !== null && prevChain.value === card.value && prevChain.level === 1) caidaLevel = 2
    else if (prevChain !== null && prevChain.value === card.value && prevChain.level === 2) caidaLevel = 3
    else caidaLevel = 1
    newCaidaChain = { level: caidaLevel, value: card.value }
  }
  const caidaPoints = caidaLevel === 3 ? 10 : caidaLevel === 2 ? 5 : caidaLevel === 1 ? 1 : 0
  const caidaEvents: GameEvent[] =
    caidaLevel === 3 ? ['ara_3achra'] :
    caidaLevel === 2 ? ['ara_khamssa'] :
    caidaLevel === 1 ? ['caida'] : []

  // Montée de chaîne : l'équipe adverse perd les points gagnés au niveau
  // précédent (1 → -1, 2 → -5). Les équipes alternent dans le sens du jeu, donc
  // l'équipe qui avait marqué la chaîne est l'opposée de l'équipe courante.
  const opponentPenalty =
    caidaLevel >= 2 && prevChain !== null
      ? (prevChain.level === 1 ? 1 : prevChain.level === 2 ? 5 : 0)
      : 0

  // Carte laissée 1 tour si caída — MAIS seulement si :
  //  1. le joueur SUIVANT (sens du jeu) peut continuer la chaîne : il a encore
  //     une carte de même valeur en main ;
  //  2. le joueur courant a encore des cartes après le coup (sinon la manche se
  //     termine et aucune suite n'est possible → la carte va directement en pile).
  const isCaida = captureResult !== null && captureResult.isCaida
  const nextCanContinue = base.players[nextPlayer(playerId)].hand.some((c) => c.value === card.value)
  const cardRemains = isCaida && nextCanContinue && newHand.length > 0

  const newPending: GameState2v2['pendingCaidaCard'] =
    cardRemains ? { card, playerId } : null

  const team = teamOf(playerId)
  const players = withPlayer(base.players, playerId, {
    hand: newHand,
    lostComboRight: player.lostComboRight || lostRight,
    playedThisRound: newPlayedThisRound,
    pendingCombo: detectCombination(newHand),
  })

  let newState: GameState2v2

  if (captureResult !== null) {
    const { captured, tableAfter, isMissa } = captureResult
    const bonus = caidaPoints + (isMissa ? 1 : 0)
    const events: GameEvent[] = [...caidaEvents, ...(isMissa ? (['missa'] as const) : [])]

    // Carte joueuse maintenue sur la table (caída avec suite possible) → pile
    // d'équipe = cartes capturées seulement, table = tableAfter + carte joueuse.
    // Sinon, la carte joueuse va dans la pile.
    const newPile = cardRemains
      ? [...base.teams[team].captured, ...captured]
      : [...base.teams[team].captured, card, ...captured]
    const finalTable = cardRemains ? [...tableAfter, card] : tableAfter

    let teams = withTeam(base.teams, team, {
      captured: newPile,
      score: base.teams[team].score + bonus,
    })
    if (opponentPenalty > 0) {
      const oppTeam = (1 - team) as 0 | 1
      teams = withTeam(teams, oppTeam, {
        score: Math.max(0, teams[oppTeam].score - opponentPenalty),
      })
    }

    newState = {
      ...base,
      table: finalTable,
      players,
      teams,
      lastCapture: { playerId, card: cardRemains ? captured[0] : card },
      lastPlayed: newLastPlayed,
      caidaChain: newCaidaChain,
      pendingCaidaCard: newPending,
      lastEvents: events,
      eventSeq: events.length > 0 ? base.eventSeq + 1 : base.eventSeq,
    }
  } else {
    newState = {
      ...base,
      table: [...base.table, card],
      players,
      lastPlayed: newLastPlayed,
      caidaChain: newCaidaChain, // null (coup sans capture → chaîne brisée)
      pendingCaidaCard: null,
      lastEvents: [],
      eventSeq: base.eventSeq,
    }
  }

  return advanceTurn2v2(newState, rng)
}

// ── DECLARE ─────────────────────────────────────────────────────────────────────

function applyDeclare2v2(
  state: GameState2v2,
  playerId: PlayerId2v2,
  combination: Combination | null,
): GameState2v2 {
  if (combination === null) throw new Error('No combination to declare')
  // Annonce libre (n'avance pas le tour) → autorisée même hors de son tour.

  const player = state.players[playerId]
  if (player.lostComboRight) throw new Error('Lost right to declare')
  for (const c of combination.cards) {
    if (!cardInHand(player.hand, c)) throw new Error('No longer holding all combo cards')
  }

  // Recalcul pur télescopique : on crédite le delta (après − avant) à chaque équipe.
  const before = declaredArray(state.players)
  const after: typeof before = [before[0], before[1], before[2], before[3]]
  after[playerId] = combination
  const [bA, bB] = resolveCombos2v2(before)
  const [aA, aB] = resolveCombos2v2(after)

  const players = withPlayer(state.players, playerId, { declaredCombo: combination })
  let teams = withTeam(state.teams, 0, { score: state.teams[0].score + (aA - bA) })
  teams = withTeam(teams, 1, { score: teams[1].score + (aB - bB) })

  const event: GameEvent = combination.type // 'ronda' | 'tringa'
  return { ...state, players, teams, lastEvents: [event], eventSeq: state.eventSeq + 1 }
}

// ── CONTEST ─────────────────────────────────────────────────────────────────────

function applyContest2v2(
  state: GameState2v2,
  contestorId: PlayerId2v2,
  accusedPlayer: PlayerId2v2,
  accusedValue: Value,
): GameState2v2 {
  if (state.currentPlayer !== contestorId) throw new Error('Not your turn')
  if (teamOf(accusedPlayer) === teamOf(contestorId)) {
    throw new Error('Cannot contest a teammate')
  }

  const accused = state.players[accusedPlayer]
  const { contestorDelta, wasCorrect } = resolveContest(
    accusedValue,
    accused.playedThisRound,
    accused.hand,
  )

  const team = teamOf(contestorId)
  const raw = state.teams[team].score + contestorDelta
  const teams = withTeam(state.teams, team, {
    score: wasCorrect ? raw : Math.max(0, raw),
  })

  return { ...state, teams, lastEvents: ['contre'], eventSeq: state.eventSeq + 1 }
}

// ── Réducteur principal ───────────────────────────────────────────────────────

export function applyAction2v2(state: GameState2v2, action: Action2v2, rng: Rng): GameState2v2 {
  switch (action.type) {
    case 'PLAY_CARD':
      return applyPlayCard2v2(state, action.playerId, action.card, rng)
    case 'DECLARE':
      return applyDeclare2v2(state, action.playerId, action.combination)
    case 'CONTEST':
      return applyContest2v2(state, action.playerId, action.accusedPlayer, action.accusedValue)
  }
}

import type { Action, Card, GameState, PlayerId } from '../engine/types'
import { applyAction, createDeck, shuffle, startNewDeal, type Rng } from '../engine'
import type { ObservableState } from './observable'
import type { AiMemory } from './memory'
import { chooseAction } from './bot'

// IA « Difficile » : recherche Monte-Carlo (MCTS simplifié) pour le choix de la
// carte. À chaque tour, on déterminise l'état caché (main adverse + pioche tirées
// au hasard parmi les cartes inconnues), puis on simule des parties aléatoires
// complètes jusqu'à la victoire ; on retient la carte au meilleur taux de victoire.
// Les décisions DECLARE / CONTEST réutilisent l'heuristique « moyen ».

const SIMULATIONS = 200
const TIMEOUT_MS = 1500
const PLAYOUT_GUARD = 4000

function cardKey(c: Card): string { return `${c.suit}_${c.value}` }

/** Cartes connues (hors main adverse et pioche) : main du bot, table, captures, caída en attente. */
function seenKeys(gs: GameState, botId: PlayerId): Set<string> {
  const opp = (1 - botId) as PlayerId
  const seen = new Set<string>()
  for (const c of gs.players[botId].hand) seen.add(cardKey(c))
  for (const c of gs.players[botId].captured) seen.add(cardKey(c))
  for (const c of gs.players[opp].captured) seen.add(cardKey(c))
  for (const c of gs.table) seen.add(cardKey(c))
  if (gs.pendingCaidaCard) seen.add(cardKey(gs.pendingCaidaCard.card))
  return seen
}

/** Reconstruit un état où la main adverse et la pioche sont retirées au hasard
 *  parmi les cartes inconnues (déterminisation MCTS pour info cachée). */
function determinize(gs: GameState, botId: PlayerId, rng: Rng): GameState {
  const opp = (1 - botId) as PlayerId
  const seen = seenKeys(gs, botId)
  const pool = createDeck().filter(c => !seen.has(cardKey(c)))
  const shuffled = shuffle(pool, rng)
  const oppHandLen = gs.players[opp].hand.length
  const newOppHand = shuffled.slice(0, oppHandLen)
  const newDeck = shuffled.slice(oppHandLen)

  const players = [...gs.players] as [GameState['players'][0], GameState['players'][1]]
  players[opp] = { ...players[opp], hand: newOppHand }
  return { ...gs, deck: newDeck, players }
}

/** Simule une partie aléatoire jusqu'à GAME_OVER. Renvoie 1 (victoire bot), 0 (défaite), 0.5 (nul). */
function randomPlayout(start: GameState, botId: PlayerId, rng: Rng): number {
  let st = start
  let guard = 0
  while (st.phase !== 'GAME_OVER' && guard < PLAYOUT_GUARD) {
    guard++
    if (st.phase === 'PLAYING') {
      const p = st.currentPlayer
      const hand = st.players[p].hand
      if (hand.length === 0) break
      const card = hand[Math.floor(rng() * hand.length)]
      try {
        st = applyAction(st, { type: 'PLAY_CARD', playerId: p, card }, rng)
      } catch {
        break
      }
    } else if (st.phase === 'DEAL_END') {
      st = startNewDeal(
        {
          scores: [st.players[0].score, st.players[1].score],
          dealer: (1 - st.dealer) as PlayerId,
          dealNumber: st.dealNumber + 1,
        },
        rng,
      )
    } else {
      break
    }
  }
  const mine = st.players[botId].score
  const theirs = st.players[(1 - botId) as PlayerId].score
  if (mine > theirs) return 1
  if (mine < theirs) return 0
  return 0.5
}

/**
 * Action du bot « Difficile ». DECLARE/CONTEST → heuristique moyenne ; sinon
 * MCTS pour choisir la meilleure carte (borné à TIMEOUT_MS).
 */
export function chooseActionHard(
  gs: GameState,
  obs: ObservableState,
  botId: PlayerId,
  memory: AiMemory,
  rng: Rng = Math.random,
): Action {
  const heuristic = chooseAction(obs, botId, 'medium', memory)
  if (heuristic.type !== 'PLAY_CARD') return heuristic

  const hand = gs.players[botId].hand
  if (hand.length <= 1) return heuristic

  const stats = hand.map(card => ({ card, wins: 0, plays: 0 }))
  const deadline = Date.now() + TIMEOUT_MS
  const rounds = Math.max(1, Math.ceil(SIMULATIONS / stats.length))

  outer:
  for (let r = 0; r < rounds; r++) {
    for (const stat of stats) {
      if (Date.now() >= deadline) break outer
      const det = determinize(gs, botId, rng)
      let next: GameState
      try {
        next = applyAction(det, { type: 'PLAY_CARD', playerId: botId, card: stat.card }, rng)
      } catch {
        continue
      }
      stat.wins += randomPlayout(next, botId, rng)
      stat.plays += 1
    }
  }

  let best = stats[0]
  let bestRate = best.plays ? best.wins / best.plays : -1
  for (const stat of stats) {
    const rate = stat.plays ? stat.wins / stat.plays : -1
    if (rate > bestRate) { bestRate = rate; best = stat }
  }
  return { type: 'PLAY_CARD', playerId: botId, card: best.card }
}

import type { GameState, Card, Suit } from '../engine-dijouj/types'
import { isPlayable } from '../engine-dijouj/game'

export type BotAction =
  | { type: 'play'; card: Card; chosenSuit?: Suit }
  | { type: 'draw' }

/**
 * Stratégie heuristique simple pour Di Jouj :
 *  1. 7 de Oros (joker) — choisit la couleur la plus représentée en main
 *  2. 2 (Di Jouj)       — spécial prioritaire
 *  3. As               — skip prioritaire
 *  4. Première carte jouable ordinaire
 *  5. Sinon : piocher
 */
export function botPlay(state: GameState, botId: number): BotAction {
  const bot     = state.players[botId]
  const topCard = state.discardPile[state.discardPile.length - 1]

  const playable = bot.hand.filter(c =>
    isPlayable(c, topCard, state.chosenSuit, state.pendingEffect),
  )

  if (playable.length === 0) return { type: 'draw' }

  // 7 de Oros — joker, choisit la meilleure couleur
  const wild = playable.find(c => c.value === 7 && c.suit === 'oros')
  if (wild) {
    const counts: Record<Suit, number> = { oros: 0, copas: 0, espadas: 0, bastos: 0 }
    for (const c of bot.hand) {
      if (!(c.value === 7 && c.suit === 'oros')) counts[c.suit]++
    }
    const bestSuit = (Object.entries(counts) as [Suit, number][])
      .sort((a, b) => b[1] - a[1])[0][0]
    return { type: 'play', card: wild, chosenSuit: bestSuit }
  }

  // 2 (Di Jouj) — fait piocher l'adversaire
  const two = playable.find(c => c.value === 2)
  if (two) return { type: 'play', card: two }

  // As — passe le tour adverse
  const ace = playable.find(c => c.value === 1)
  if (ace) return { type: 'play', card: ace }

  // Première carte jouable
  return { type: 'play', card: playable[0] }
}

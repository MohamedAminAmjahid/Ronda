// Jeu de cartes espagnol — mêmes définitions que le moteur Ronda (compatibilité structurelle)
export type Suit  = 'oros' | 'copas' | 'espadas' | 'bastos'
export type Value = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12

export interface Card {
  suit:  Suit
  value: Value
}

// Effet en attente : le joueur suivant doit piocher N cartes, ou passer son tour.
// Cumulable : un 2 (resp. un As) joué contre un effet draw2 (resp. skip) l'empile.
export type PendingEffect =
  | { type: 'draw2'; count: number }  // count = total cartes à piocher (s'accumule)
  | { type: 'skip' }                  // prochain joueur passe — peut être contré par un As
  | null

export interface PlayerState {
  id:   number
  hand: Card[]
}

export interface GameState {
  players:         PlayerState[]
  drawPile:        Card[]
  discardPile:     Card[]       // sommet = discardPile[length - 1]
  currentPlayerId: number
  chosenSuit:      Suit | null  // couleur imposée après un 7 de Oros
  pendingEffect:   PendingEffect
  isOver:          boolean
  winnerId:        number | null
}

export type GameEvent =
  | { type: 'played';  playerId: number; card: Card; chosenSuit?: Suit }
  | { type: 'drew';    playerId: number; count: number }
  | { type: 'skipped'; playerId: number }
  | { type: 'won';     playerId: number }

export type Suit  = 'oros' | 'copas' | 'espadas' | 'bastos'
export type Value = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12

export interface Card {
  suit:  Suit
  value: Value
}

export type PendingEffect =
  | { type: 'draw2'; count: number }
  | { type: 'skip' }
  | null

export interface PlayerState {
  id:   number
  hand: Card[]
}

export interface GameState {
  players:         PlayerState[]
  drawPile:        Card[]
  discardPile:     Card[]
  currentPlayerId: number
  chosenSuit:      Suit | null
  pendingEffect:   PendingEffect
  isOver:          boolean
  winnerId:        number | null
}

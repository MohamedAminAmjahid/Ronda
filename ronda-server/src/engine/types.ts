export type Suit = 'oros' | 'copas' | 'espadas' | 'bastos'
export type Value = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12

export interface Card {
  readonly value: Value
  readonly suit: Suit
}

export type PlayerId = 0 | 1

export type CombinationType = 'ronda' | 'tringa'

export interface Combination {
  type: CombinationType
  value: Value
  cards: readonly Card[]
}

export interface PlayerState {
  hand: readonly Card[]
  captured: readonly Card[]
  score: number
  /** Combo détectée dans la main courante, pas encore déclarée ni perdue */
  pendingCombo: Combination | null
  /** Combo déclarée publiquement */
  declaredCombo: Combination | null
  /** A joué une carte de la combo sans déclarer → droit perdu pour cette main */
  lostComboRight: boolean
  /**
   * Toutes les cartes jouées depuis la dernière redistribution.
   * Sert à valider un contre : si l'adversaire a joué ≥2 cartes de même valeur
   * dans la même main distribuée, le contre est correct.
   * Réinitialisé à chaque redistribution.
   */
  playedThisRound: readonly Card[]
}

export interface PlayCardAction {
  type: 'PLAY_CARD'
  playerId: PlayerId
  card: Card
}

export interface DeclareAction {
  type: 'DECLARE'
  playerId: PlayerId
  combination: Combination
}

/**
 * Contre-ronda : le contesteur accuse l'adversaire d'avoir dissimulé
 * une ronda de valeur `accusedValue` issue de la même main.
 */
export interface ContestAction {
  type: 'CONTEST'
  playerId: PlayerId      // le joueur qui conteste
  accusedValue: Value     // valeur de la ronda accusée
}

export type Action = PlayCardAction | DeclareAction | ContestAction

export type GamePhase =
  | 'PLAYING'    // tour normal ou Mab9ach
  | 'DEAL_END'   // donne terminée, décompte effectué, prêt pour la suivante
  | 'GAME_OVER'

/** Événements remarquables produits par la dernière action. */
export type GameEvent =
  | 'caida'         // Ara Wahd  (caída niveau 1, +1)
  | 'ara_khamssa'   // caída niveau 2 (+5)
  | 'ara_7dach'     // caída niveau 3 (+11)
  | 'missa'
  | 'ronda'
  | 'tringa'
  | 'contre'

export interface GameState {
  deck: readonly Card[]
  table: readonly Card[]
  players: readonly [PlayerState, PlayerState]
  currentPlayer: PlayerId
  dealer: PlayerId
  phase: GamePhase
  /** Numéro de manche au sein de la donne (0-based) */
  roundNumber: number
  /** Numéro de donne (0-based) */
  dealNumber: number
  /** true si on est dans la dernière manche (Mab9ach) */
  isMabqach: boolean
  /** Dernière capture : qui et quelle carte (pour caída) */
  lastCapture: { playerId: PlayerId; card: Card } | null
  /**
   * Chaîne de caídas en cours sur une même valeur (section 3.2).
   * level 1 = Ara Wahd (+1), 2 = Ara Khamssa (+5), 3 = Ara 7dach (+11).
   * null si aucune chaîne (reset dès qu'un coup ne capture pas la dernière
   * carte adverse, ou capture une valeur différente).
   */
  caidaChain: { level: 1 | 2 | 3; value: Value } | null
  /** Dernière carte posée par chaque joueur (pour caída) */
  lastPlayed: readonly [Card | null, Card | null]
  /** Événements de la dernière action (vide si coup ordinaire). */
  lastEvents: readonly GameEvent[]
  /** Compteur monotone — change à chaque action qui produit des événements. */
  eventSeq: number
}

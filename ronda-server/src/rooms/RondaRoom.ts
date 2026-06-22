import { Room, Client } from 'colyseus'
import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema'
import { v4 as uuid } from 'uuid'
import {
  createInitialState,
  applyAction,
  startNewDeal,
} from '../engine'
import type {
  GameState,
  Card,
  Combination,
  GameEvent,
  PlayerId,
  Value,
} from '../engine/types'
import { recordGame, touchPlayer, getStats } from '../db/queries'
import { generateCode, registerCode, unregisterCode } from './registry'

// ── Schéma Colyseus (état PUBLIC, identique aux deux joueurs) ─────────────────

class CardSchema extends Schema {
  @type('uint8') value = 0
  @type('string') suit = ''
}

class PlayerSchema extends Schema {
  @type('string') playerId = ''
  @type('string') pseudo = ''
  @type('uint8') seat = 0
  @type('boolean') connected = false
  @type('uint8') handCount = 0
  @type('int16') score = 0
}

class RondaState extends Schema {
  @type('string') code = ''
  // 'WAITING' | 'PLAYING' | 'DEAL_END' | 'GAME_OVER' | 'ABORTED'
  @type('string') phase = 'WAITING'
  @type('uint8') currentSeat = 0
  @type('uint8') dealer = 0
  @type('uint16') deckCount = 0
  @type('uint16') dealNumber = 0
  @type('boolean') isMabqach = false
  @type([CardSchema]) table = new ArraySchema<CardSchema>()
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>()
}

// ── Outils ─────────────────────────────────────────────────────────────────────

const EVENT_POINTS: Record<GameEvent, number> = {
  caida: 1,
  ara_khamssa: 5,
  ara_7dach: 11,
  missa: 1,
  ronda: 1,
  tringa: 5,
  contre: 0,
}

/** RNG LCG seedé (Date.now()) — le serveur est autoritaire, pas de rejeu requis. */
function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const isWin = (scores: [number, number]): boolean => scores[0] >= 41 || scores[1] >= 41

// ── Room 1v1 ─────────────────────────────────────────────────────────────────

export class RondaRoom extends Room<RondaState> {
  maxClients = 2

  /** État autoritaire (moteur pur). Le client ne le modifie jamais. */
  private engine!: GameState
  /** sessionId du client occupant chaque siège (null si libre / déconnecté). */
  private sessionBySeat: [string | null, string | null] = [null, null]
  private pseudoBySeat: [string, string] = ['', '']
  private dealConfirmed: [boolean, boolean] = [false, false]
  private startedAt = 0
  private recorded = false
  private reconnectSeconds = Number(process.env.RECONNECT_SECONDS ?? 60)

  // ── Lifecycle ───────────────────────────────────────────────────────────

  onCreate(options: { private?: boolean }): void {
    this.state = new RondaState()
    this.maxClients = 2

    const code = generateCode()
    this.state.code = code
    this.setMetadata({ code })
    registerCode(code, this.roomId, 'ronda')

    // Rooms créées par code = privées (non proposées au matchmaking rapide).
    if (options?.private) this.setPrivate(true)

    this.onMessage('play_card', (client, msg: { card: Card }) =>
      this.handleAction(client, { type: 'PLAY_CARD', playerId: 0, card: msg.card }, 'card'),
    )
    this.onMessage('declare', (client, msg: { combination: Combination }) =>
      this.handleAction(client, { type: 'DECLARE', playerId: 0, combination: msg.combination }, 'combination'),
    )
    this.onMessage('contest', (client, msg: { accusedValue: Value }) =>
      this.handleAction(client, { type: 'CONTEST', playerId: 0, accusedValue: msg.accusedValue }, 'contest'),
    )
    this.onMessage('continue_deal', (client) => this.handleContinueDeal(client))
  }

  onJoin(client: Client, options: { pseudo: string }): void {
    if (this.state.phase !== 'WAITING') {
      throw new Error('La partie a déjà commencé.')
    }
    const seat = (this.sessionBySeat[0] === null ? 0 : 1) as PlayerId
    const pseudo = (options?.pseudo ?? 'Joueur').slice(0, 24)

    this.sessionBySeat[seat] = client.sessionId
    this.pseudoBySeat[seat] = pseudo
    touchPlayer(pseudo)

    const ps = new PlayerSchema()
    ps.playerId = uuid()
    ps.pseudo = pseudo
    ps.seat = seat
    ps.connected = true
    ps.handCount = 0
    ps.score = 0
    this.state.players.set(client.sessionId, ps)

    // Deux joueurs présents → on démarre la partie.
    if (this.sessionBySeat[0] !== null && this.sessionBySeat[1] !== null) {
      this.startGame()
    }
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    const seat = this.seatOf(client.sessionId)
    if (seat === null) return
    const ps = this.state.players.get(client.sessionId)
    if (ps) ps.connected = false

    // Départ VOLONTAIRE pendant une partie en cours → l'adversaire gagne tout de suite.
    if (consented && this.state.phase === 'PLAYING') {
      const opponentSeat = (1 - seat) as PlayerId
      this.engine.players[opponentSeat].score = Math.max(41, this.engine.players[opponentSeat].score)
      this.engine.phase = 'GAME_OVER'
      this.state.phase = 'GAME_OVER'
      this.syncPublic()
      this.sendPrivateStateToAll() // l'adversaire voit l'écran de fin (Bravo)
      this.finishGame(opponentSeat) // record + broadcast game_over { winnerSeat: opponentSeat }
      return
    }

    // En lobby / partie finie / abandonnée : départ définitif, rien à attendre.
    if (
      consented ||
      this.state.phase === 'WAITING' ||
      this.state.phase === 'GAME_OVER' ||
      this.state.phase === 'ABORTED'
    ) {
      return
    }

    this.broadcast('opponent_disconnected', { seat }, { except: client })

    try {
      await this.allowReconnection(client, this.reconnectSeconds)
      if (ps) ps.connected = true
      this.broadcast('opponent_reconnected', { seat })
      this.sendPrivateStateTo(client, seat) // renvoie sa main
    } catch {
      // Pas de reconnexion dans le délai → partie annulée (pas d'enregistrement DB).
      this.state.phase = 'ABORTED'
      this.broadcast('game_over', { aborted: true, reason: 'opponent_left' })
      this.disconnect()
    }
  }

  onDispose(): void {
    if (this.state.code) unregisterCode(this.state.code)
  }

  // ── Démarrage ─────────────────────────────────────────────────────────────

  private startGame(): void {
    const firstDealer: PlayerId = Math.random() < 0.5 ? 0 : 1
    this.engine = createInitialState(makeRng(Date.now()), firstDealer)
    this.startedAt = Date.now()
    this.state.phase = 'PLAYING'
    this.syncPublic()
    this.sendPrivateStateToAll()
  }

  // ── Handlers de messages ──────────────────────────────────────────────────

  private handleAction(
    client: Client,
    base: { type: 'PLAY_CARD'; playerId: PlayerId; card: Card }
        | { type: 'DECLARE'; playerId: PlayerId; combination: Combination }
        | { type: 'CONTEST'; playerId: PlayerId; accusedValue: Value },
    _kind: string,
  ): void {
    const seat = this.seatOf(client.sessionId)
    if (seat === null) return
    if (this.state.phase !== 'PLAYING') {
      client.send('error', { message: 'La partie n’est pas en cours.' })
      return
    }

    const action = { ...base, playerId: seat }
    const prevPhase = this.engine.phase
    const prevSeq = this.engine.eventSeq

    try {
      this.engine = applyAction(this.engine, action, makeRng(Date.now()))
    } catch (e) {
      client.send('error', { message: (e as Error).message })
      return
    }

    this.afterEngineChange(prevPhase, prevSeq)
  }

  private handleContinueDeal(client: Client): void {
    const seat = this.seatOf(client.sessionId)
    if (seat === null) return
    if (this.state.phase !== 'DEAL_END') {
      client.send('error', { message: 'Aucune fin de donne à confirmer.' })
      return
    }
    this.dealConfirmed[seat] = true

    // Double-confirm : on attend le « OK » des deux joueurs.
    if (!this.dealConfirmed[0] || !this.dealConfirmed[1]) {
      this.broadcast('deal_confirm', { seat }) // info : qui a confirmé
      return
    }

    this.dealConfirmed = [false, false]
    const scores: [number, number] = [this.engine.players[0].score, this.engine.players[1].score]
    this.engine = startNewDeal(
      { scores, dealer: (1 - this.engine.dealer) as PlayerId, dealNumber: this.engine.dealNumber + 1 },
      makeRng(Date.now()),
    )
    this.state.phase = 'PLAYING'
    this.syncPublic()
    this.sendPrivateStateToAll()
  }

  // ── Après chaque transition du moteur ──────────────────────────────────────

  private afterEngineChange(prevPhase: string, prevSeq: number): void {
    this.syncPublic()
    this.sendPrivateStateToAll()

    // Événements remarquables (caída, missa, ronda…) → toast côté client.
    if (this.engine.eventSeq !== prevSeq) {
      for (const ev of this.engine.lastEvents) {
        this.broadcast('event', { type: ev, points: EVENT_POINTS[ev] })
      }
    }

    // Fin de donne.
    if (this.engine.phase === 'DEAL_END' && prevPhase !== 'DEAL_END') {
      this.state.phase = 'DEAL_END'
      this.dealConfirmed = [false, false]
      this.broadcast('deal_end', {
        scores: [this.engine.players[0].score, this.engine.players[1].score],
        captured: [this.engine.players[0].captured.length, this.engine.players[1].captured.length],
        dealNumber: this.engine.dealNumber,
      })
    }

    // Fin de partie.
    if (this.engine.phase === 'GAME_OVER') {
      this.state.phase = 'GAME_OVER'
      this.finishGame()
    }
  }

  /**
   * Termine la partie : enregistrement DB + diffusion `game_over`.
   * `forcedWinner` force le vainqueur (cas forfait : départ volontaire d'un joueur),
   * sinon le vainqueur est déduit des scores (≥ 41).
   */
  private finishGame(forcedWinner?: PlayerId): void {
    if (this.recorded) return
    this.recorded = true

    const scores: [number, number] = [this.engine.players[0].score, this.engine.players[1].score]
    const winnerSeat: PlayerId | null =
      forcedWinner !== undefined ? forcedWinner : scores[0] >= 41 ? 0 : scores[1] >= 41 ? 1 : null
    const winnerPseudo = winnerSeat === null ? null : this.pseudoBySeat[winnerSeat]

    recordGame({
      id: uuid(),
      player1_pseudo: this.pseudoBySeat[0],
      player2_pseudo: this.pseudoBySeat[1],
      winner_pseudo: winnerPseudo,
      duration_seconds: Math.round((Date.now() - this.startedAt) / 1000),
    })

    this.broadcast('game_over', {
      aborted: false,
      winnerSeat,
      winnerPseudo,
      scores,
      reason: forcedWinner !== undefined ? 'opponent_forfeit' : undefined,
      stats: {
        [this.pseudoBySeat[0]]: getStats(this.pseudoBySeat[0]),
        [this.pseudoBySeat[1]]: getStats(this.pseudoBySeat[1]),
      },
    })
  }

  // ── Synchronisation ─────────────────────────────────────────────────────────

  private syncPublic(): void {
    const e = this.engine
    this.state.currentSeat = e.currentPlayer
    this.state.dealer = e.dealer
    this.state.deckCount = e.deck.length
    this.state.dealNumber = e.dealNumber
    this.state.isMabqach = e.isMabqach

    this.state.table.clear()
    for (const c of e.table) {
      const cs = new CardSchema()
      cs.value = c.value
      cs.suit = c.suit
      this.state.table.push(cs)
    }

    for (const [, ps] of this.state.players) {
      const p = e.players[ps.seat]
      ps.handCount = p.hand.length
      ps.score = p.score
    }
  }

  /**
   * Envoie à un client son état observable complet : sa main privée + tout le
   * public (table, scores, tour, pioche…). L'adversaire n'expose que des compteurs.
   * Le client reconstruit un GameState « toi = joueur 0 » pour réutiliser l'UI solo.
   */
  private sendPrivateStateTo(client: Client, seat: PlayerId): void {
    const e = this.engine
    const opp = (1 - seat) as PlayerId
    const me = e.players[seat]
    const other = e.players[opp]

    client.send('game_state', {
      seat,
      code: this.state.code,
      phase: e.phase,
      currentSeat: e.currentPlayer,
      dealer: e.dealer,
      deckCount: e.deck.length,
      dealNumber: e.dealNumber,
      roundNumber: e.roundNumber,
      isMabqach: e.isMabqach,
      table: e.table,
      lastPlayed: e.lastPlayed, // [carte joueur 0, carte joueur 1] (public, sur la table)
      lastCapture: e.lastCapture,
      lastEvents: e.lastEvents,
      eventSeq: e.eventSeq,
      you: {
        hand: me.hand,
        capturedCount: me.captured.length,
        score: me.score,
        pendingCombo: me.pendingCombo,
        declaredCombo: me.declaredCombo,
        lostComboRight: me.lostComboRight,
        playedThisRound: me.playedThisRound,
      },
      opponent: {
        pseudo: this.pseudoBySeat[opp],
        handCount: other.hand.length,
        capturedCount: other.captured.length,
        score: other.score,
        declaredCombo: other.declaredCombo,
        lostComboRight: other.lostComboRight,
      },
    })
  }

  private sendPrivateStateToAll(): void {
    for (const client of this.clients) {
      const seat = this.seatOf(client.sessionId)
      if (seat !== null) this.sendPrivateStateTo(client, seat)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private seatOf(sessionId: string): PlayerId | null {
    if (this.sessionBySeat[0] === sessionId) return 0
    if (this.sessionBySeat[1] === sessionId) return 1
    return null
  }
}

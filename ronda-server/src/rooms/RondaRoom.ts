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
import { recordGame, touchPlayer, getStats, addWageredGold } from '../db/queries'
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
  ara_3achra: 10,
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
  /** Mise de la partie (or). 0 = partie amicale sans enjeu de classement. */
  private bet = 0

  // ── Anti-inactivité : auto-skip après 15 s, forfait après 3 auto-skips ──────
  // (mirroir de DiJoujRoom.ts — seul TURN_SECONDS diffère : 15 s au lieu de 7 s,
  // un tour de Ronda impliquant plus de choix qu'un tour de Di Jouj.)
  private static readonly TURN_SECONDS   = 15
  private static readonly MAX_AUTO_SKIPS = 3
  private turnTimer:     { clear: () => void } | null = null
  private autoSkipCount: [number, number]             = [0, 0]

  // ── Lifecycle ───────────────────────────────────────────────────────────

  onCreate(options: { private?: boolean; bet?: number }): void {
    this.state = new RondaState()
    this.maxClients = 2
    this.bet = Math.max(0, Math.floor(Number(options?.bet ?? 0)) || 0)

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

    this.onMessage('chat', (client, msg: { text: string }) => {
      try {
        const ps = this.state.players.get(client.sessionId)
        if (!ps) return
        const text = String(msg?.text ?? '').trim().slice(0, 120)
        if (!text) return
        this.broadcast('chat', { username: ps.pseudo, text })
      } catch (e) {
        console.error('[RondaRoom] chat handler error:', e)
      }
    })

    // Chat vocal : relaie la signalisation WebRTC à l'autre joueur.
    this.onMessage('voice_signal', (client, data) => {
      this.broadcast('voice_signal', data, { except: client })
    })
  }

  onJoin(client: Client, options: { pseudo: string; bet?: number }): void {
    if (this.state.phase !== 'WAITING') {
      throw new Error('La partie a déjà commencé.')
    }
    const seat = (this.sessionBySeat[0] === null ? 0 : 1) as PlayerId
    const pseudo = (options?.pseudo ?? 'Joueur').slice(0, 24)

    // La mise de la room vient uniquement du créateur (onCreate) — le second
    // joueur qui matche via joinOrCreate n'a pas le choix de la mise. Un
    // écart signale un mismatch de matchmaking (ex. quick-match sans filtre
    // par mise), à surveiller si le classement hebdo semble sous-alimenté.
    if (seat === 1 && options?.bet !== undefined && options.bet !== this.bet) {
      console.warn('[RondaRoom] mise différente entre les deux joueurs :', {
        roomBet: this.bet, joinerBet: options.bet, joiner: pseudo,
      })
    }

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

    // Suspend le minuteur d'inactivité : la reconnexion est gérée à part
    // (armTurnTimer() est réappelé explicitement en cas de reconnexion réussie).
    this.clearTurnTimer()

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
      // Ferme la room ensuite — petit délai pour laisser les messages atteindre
      // le vainqueur avant la fermeture des sockets.
      this.clock.setTimeout(() => this.disconnect(), 800)
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
      this.armTurnTimer()
    } catch {
      // Pas de reconnexion dans le délai → partie annulée (pas d'enregistrement DB).
      this.state.phase = 'ABORTED'
      this.broadcast('game_over', { aborted: true, reason: 'opponent_left' })
      this.disconnect()
    }
  }

  onDispose(): void {
    this.clearTurnTimer()
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
    this.armTurnTimer()
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

    // Le joueur a agi lui-même (carte, déclaration OU contre) → réinitialise
    // son compteur d'inactivité. Plus large que la seule paire play_card/
    // declare demandée : un contre prouve tout autant que le joueur est actif,
    // et le rater ici laisserait son compteur grimper malgré une vraie action.
    this.autoSkipCount[seat] = 0
    this.clearTurnTimer()

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
    // Nouvelle donne → on repart avec un compteur d'inactivité propre : 3 skips
    // consécutifs sur DEUX donnes différentes ne doivent pas forfaiter un joueur
    // qui était juste un peu lent une fois il y a plusieurs minutes.
    this.autoSkipCount = [0, 0]
    this.syncPublic()
    this.sendPrivateStateToAll()
    this.armTurnTimer()
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

    // Rearme pour le prochain joueur si la partie continue normalement ;
    // sinon (DEAL_END attend continue_deal, GAME_OVER a déjà tout nettoyé).
    if (this.state.phase === 'PLAYING') this.armTurnTimer()
    else this.clearTurnTimer()
  }

  // ── Anti-inactivité ─────────────────────────────────────────────────────────

  /** (Re)démarre le minuteur d'inactivité pour le joueur dont c'est le tour. */
  private armTurnTimer(): void {
    this.clearTurnTimer()
    if (this.state.phase !== 'PLAYING') return

    const seat = this.engine.currentPlayer
    const sessionId = this.sessionBySeat[seat]
    if (sessionId === null) return                              // siège vide
    // Joueur déconnecté : la logique de reconnexion (onLeave) s'en charge —
    // armTurnTimer() est réappelé explicitement après une reconnexion réussie.
    if (this.state.players.get(sessionId)?.connected === false) return

    this.turnTimer = this.clock.setTimeout(
      () => this.onTurnTimeout(seat),
      RondaRoom.TURN_SECONDS * 1000,
    )
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) { this.turnTimer.clear(); this.turnTimer = null }
  }

  /**
   * Le joueur n'a pas joué à temps : on joue une carte au hasard à sa place
   * (n'importe quelle carte de la main est un coup légal en Ronda — pas de
   * contrainte de suite à respecter, contrairement à Di Jouj), puis on
   * comptabilise l'auto-skip. Au 3e auto-skip consécutif → forfait, sauf si
   * ce dernier coup vient justement de terminer la partie de lui-même (le
   * résultat naturel prévaut sur le forfait).
   */
  private onTurnTimeout(seat: PlayerId): void {
    if (this.state.phase !== 'PLAYING') return
    if (this.engine.currentPlayer !== seat) return

    const prevPhase = this.engine.phase
    const prevSeq = this.engine.eventSeq

    const hand = this.engine.players[seat].hand
    const card = hand[Math.floor(Math.random() * hand.length)]
    this.engine = applyAction(this.engine, { type: 'PLAY_CARD', playerId: seat, card }, makeRng(Date.now()))

    this.autoSkipCount[seat]++
    this.broadcast('auto_skip', {
      seat, pseudo: this.pseudoBySeat[seat], count: this.autoSkipCount[seat],
    })

    if (this.autoSkipCount[seat] >= RondaRoom.MAX_AUTO_SKIPS && this.engine.phase !== 'GAME_OVER') {
      const winnerSeat = (1 - seat) as PlayerId
      this.clearTurnTimer()
      this.engine.players[winnerSeat].score = Math.max(41, this.engine.players[winnerSeat].score)
      this.engine.phase = 'GAME_OVER'
      this.state.phase = 'GAME_OVER'
      this.syncPublic()
      this.sendPrivateStateToAll()
      this.finishGame(winnerSeat, 'inactivity_forfeit')
      this.clock.setTimeout(() => this.disconnect(), 800)
      return
    }

    this.afterEngineChange(prevPhase, prevSeq)
  }

  /**
   * Termine la partie : enregistrement DB + diffusion `game_over`.
   * `forcedWinner` force le vainqueur (forfait : départ volontaire ou
   * inactivité), sinon le vainqueur est déduit des scores (≥ 41).
   * `reason` distingue le motif du forfait pour l'affichage côté client
   * ('opponent_forfeit' = l'adversaire a quitté, 'inactivity_forfeit' = 3
   * auto-skips consécutifs) — sinon déduit de `forcedWinner` (rétro-compat).
   */
  private finishGame(forcedWinner?: PlayerId, reason?: string): void {
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

    // Partie avec mise → crédite l'or misé au vainqueur pour le classement hebdo.
    // bet = mise misée PAR JOUEUR (pas le pot total — goldWon ci-dessous reste
    // this.bet * 2, c'est bien le gain réel crédité côté client).
    if (this.bet > 0 && winnerPseudo) {
      console.log('[leaderboard] addWageredGold appelé:', { winner: winnerPseudo, bet: this.bet, game: 'ronda' })
      void addWageredGold(winnerPseudo, this.bet, 'ronda').catch((e) =>
        console.error('[leaderboard] addWageredGold error:', e))
    }

    this.broadcast('game_over', {
      aborted: false,
      winnerSeat,
      winnerPseudo,
      scores,
      goldWon: winnerSeat !== null ? this.bet * 2 : 0,
      reason: reason ?? (forcedWinner !== undefined ? 'opponent_forfeit' : undefined),
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

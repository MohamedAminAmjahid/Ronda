import { Room, Client } from 'colyseus'
import { Schema, type, MapSchema } from '@colyseus/schema'
import { createInitialState } from '../engine-dijouj/deal'
import { applyPlayCard, applyDraw } from '../engine-dijouj/game'
import type { GameState, Card, Suit } from '../engine-dijouj/types'
import { botPlay } from '../ai-dijouj/bot'
import { generateCode, registerCode, unregisterCode } from './registry'
import { addWageredGold } from '../db/queries'
import { resolveAutoSkips } from './autoSkip'
import { getPublicProfile, firebaseReady } from '../firebaseAdmin'

// ── Schéma Colyseus (état PUBLIC) ─────────────────────────────────────────────

class TopCardSchema extends Schema {
  @type('string') suit  = ''
  @type('uint8')  value = 0
}

class PlayerDjSchema extends Schema {
  @type('string')  pseudo      = ''
  @type('uint8')   seat        = 0
  @type('boolean') connected   = false
  @type('uint8')   handCount   = 0
  @type('string')  uid         = ''
  @type('string')  avatarType  = 'initial'
  @type('string')  avatarEmoji = ''
  @type('string')  avatarImage = ''
  @type('uint16')  level       = 1
}

class DiJoujState extends Schema {
  @type('string')              code               = ''
  @type('string')              phase              = 'WAITING'
  @type('uint8')               currentPlayer      = 0
  @type('uint16')              deckCount          = 0
  @type(TopCardSchema)         topCard            = new TopCardSchema()
  @type('string')              chosenSuit         = ''
  @type('string')              pendingEffectType   = ''
  @type('uint8')               pendingEffectCount  = 0
  @type({ map: PlayerDjSchema }) players          = new MapSchema<PlayerDjSchema>()
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

// ── Room Di Jouj 1v1 ──────────────────────────────────────────────────────────

export class DiJoujRoom extends Room<DiJoujState> {
  maxClients = 2

  private engine!: GameState
  private sessionBySeat: [string | null, string | null] = [null, null]
  private pseudoBySeat:  [string, string]               = ['', '']
  private uidBySeat:     [string, string]               = ['', '']
  private botSeat:       0 | 1 | null                   = null
  private reconnectSeconds = Number(process.env.RECONNECT_SECONDS ?? 60)
  private finished = false
  private bet = 0

  // ── Anti-inactivité : auto-skip après 7 s, forfait après 3 auto-skips ────────
  private static readonly TURN_SECONDS   = 7
  private static readonly MAX_AUTO_SKIPS = 3
  private turnTimer:     { clear: () => void } | null = null
  private autoSkipCount: [number, number]             = [0, 0]

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  onCreate(options: { private?: boolean; withBot?: boolean; bet?: number }): void {
    this.state = new DiJoujState()

    const code = generateCode()
    this.state.code = code
    this.setMetadata({ code })
    registerCode(code, this.roomId, 'dijouj')

    this.bet = Math.max(0, Math.floor(Number(options?.bet ?? 0)) || 0)

    if (options?.private) this.setPrivate(true)

    if (options?.withBot) {
      this.botSeat = 1
      this.maxClients = 1
      this.setPrivate(true)
    }

    this.onMessage('play_card', (client, msg: { card: Card; chosenSuit?: Suit }) =>
      this.handlePlayCard(client, msg),
    )
    this.onMessage('draw_card', (client) => this.handleDrawCard(client))

    this.onMessage('chat', (client, msg: { text: string }) => {
      try {
        const ps = this.state.players.get(client.sessionId)
        if (!ps) return
        const text = String(msg?.text ?? '').trim().slice(0, 120)
        if (!text) return
        this.broadcast('chat', { username: ps.pseudo, text })
      } catch (e) {
        console.error('[DiJoujRoom] chat handler error:', e)
      }
    })

    // Chat vocal : relaie la signalisation WebRTC à l'autre joueur.
    this.onMessage('voice_signal', (client, data) => {
      this.broadcast('voice_signal', data, { except: client })
    })
  }

  async onJoin(client: Client, options: { pseudo: string; uid?: string; bet?: number }): Promise<void> {
    if (this.state.phase !== 'WAITING') throw new Error('La partie a déjà commencé.')

    const seat = (this.sessionBySeat[0] === null ? 0 : 1) as 0 | 1
    const pseudo = (options?.pseudo ?? 'Joueur').slice(0, 24)
    const uid = String(options?.uid ?? '')

    // La mise de la room vient uniquement du créateur (onCreate) — le second
    // joueur qui matche via joinOrCreate n'a pas le choix de la mise. Un
    // écart signale un mismatch de matchmaking (ex. quick-match sans filtre
    // par mise), à surveiller si le classement hebdo semble sous-alimenté.
    if (seat === 1 && options?.bet !== undefined && options.bet !== this.bet) {
      console.warn('[DiJoujRoom] mise différente entre les deux joueurs :', {
        roomBet: this.bet, joinerBet: options.bet, joiner: pseudo,
      })
    }

    // Profil public (avatar + niveau) depuis Firestore Admin. Best-effort :
    // valeurs par défaut si non connecté / credentials absents.
    const prof = uid && firebaseReady()
      ? await getPublicProfile(uid)
      : { username: pseudo, avatarType: 'initial', avatarEmoji: '', avatarImage: '', level: 1 }

    this.sessionBySeat[seat] = client.sessionId
    this.pseudoBySeat[seat]  = pseudo
    this.uidBySeat[seat]     = uid

    const ps = new PlayerDjSchema()
    ps.pseudo      = pseudo
    ps.seat        = seat
    ps.connected   = true
    ps.handCount   = 0
    ps.uid         = uid
    ps.avatarType  = prof.avatarType
    ps.avatarEmoji = prof.avatarEmoji
    ps.avatarImage = prof.avatarImage
    ps.level       = prof.level
    this.state.players.set(client.sessionId, ps)

    if (this.botSeat !== null && seat === 0) {
      this.pseudoBySeat[1] = 'Bot'
      this.startGame()
    } else if (this.sessionBySeat[0] !== null && this.sessionBySeat[1] !== null) {
      this.startGame()
    }
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    const seat = this.seatOf(client.sessionId)
    if (seat === null) return

    // Suspend le minuteur d'inactivité : la reconnexion est gérée à part.
    this.clearTurnTimer()

    const ps = this.state.players.get(client.sessionId)
    if (ps) ps.connected = false

    if (consented && this.state.phase === 'PLAYING') {
      const opp = (1 - seat) as 0 | 1
      this.finishGame(opp)
      this.clock.setTimeout(() => this.disconnect(), 800)
      return
    }

    if (
      consented ||
      this.state.phase !== 'PLAYING' ||
      this.botSeat !== null
    ) return

    this.broadcast('opponent_disconnected', { seat }, { except: client })

    try {
      await this.allowReconnection(client, this.reconnectSeconds)
      if (ps) ps.connected = true
      this.broadcast('opponent_reconnected', { seat })
      this.sendPrivateStateTo(client, seat)
      this.armTurnTimer()
    } catch {
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
    this.engine = createInitialState(2, makeRng(Date.now()))
    this.state.phase = 'PLAYING'
    this.syncPublic()
    this.sendPrivateStateToAll()
    this.scheduleBotIfNeeded()
    this.armTurnTimer()
  }

  // ── Handlers de messages ──────────────────────────────────────────────────

  private handlePlayCard(client: Client, msg: { card: Card; chosenSuit?: Suit }): void {
    const seat = this.seatOf(client.sessionId)
    if (seat === null || this.state.phase !== 'PLAYING') return
    if (this.engine.currentPlayerId !== seat) {
      client.send('error', { message: 'Ce n\'est pas ton tour.' })
      return
    }
    const next = applyPlayCard(this.engine, seat, msg.card, msg.chosenSuit)
    if (next === this.engine) {
      client.send('error', { message: 'Coup invalide.' })
      return
    }
    // Le joueur a joué lui-même → réinitialise son compteur d'inactivité.
    this.autoSkipCount[seat] = 0
    this.clearTurnTimer()
    this.engine = next
    this.applyAutoSkips()
    this.afterEngineChange()
  }

  /** Résout automatiquement les tours qui ne peuvent pas être contrés. */
  private applyAutoSkips(): void {
    if (!this.engine.pendingEffect || this.engine.isOver) return
    const { engine, skipped } = resolveAutoSkips(
      this.engine, makeRng(Date.now()), Array.from(this.pseudoBySeat),
    )
    this.engine = engine
    for (const s of skipped) this.broadcast('auto_skip', s)
  }

  private handleDrawCard(client: Client): void {
    const seat = this.seatOf(client.sessionId)
    if (seat === null || this.state.phase !== 'PLAYING') return
    if (this.engine.currentPlayerId !== seat) {
      client.send('error', { message: 'Ce n\'est pas ton tour.' })
      return
    }
    this.autoSkipCount[seat] = 0
    this.clearTurnTimer()
    this.engine = applyDraw(this.engine, seat, makeRng(Date.now()))
    this.afterEngineChange()
  }

  // ── Après chaque changement du moteur ─────────────────────────────────────

  private afterEngineChange(): void {
    if (this.engine.isOver) this.state.phase = 'GAME_OVER'
    this.syncPublic()
    this.sendPrivateStateToAll()

    if (this.engine.isOver) {
      this.clearTurnTimer()
      this.finishGame(this.engine.winnerId as 0 | 1)
      this.clock.setTimeout(() => this.disconnect(), 5000)
    } else {
      this.scheduleBotIfNeeded()
      this.armTurnTimer()
    }
  }

  // ── Anti-inactivité ─────────────────────────────────────────────────────────

  /** (Re)démarre le minuteur d'inactivité pour le joueur humain dont c'est le tour. */
  private armTurnTimer(): void {
    this.clearTurnTimer()
    if (this.state.phase !== 'PLAYING' || this.engine.isOver) return

    const seat = this.engine.currentPlayerId as 0 | 1
    if (this.botSeat === seat) return                       // le bot est géré à part
    if (this.sessionBySeat[seat] === null) return           // siège vide
    // Joueur déconnecté : la logique de reconnexion (onLeave) s'en charge.
    if (this.getPlayerSchemaForSeat(seat)?.connected === false) return

    this.turnTimer = this.clock.setTimeout(
      () => this.onTurnTimeout(seat),
      DiJoujRoom.TURN_SECONDS * 1000,
    )
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) { this.turnTimer.clear(); this.turnTimer = null }
  }

  /** Le joueur n'a pas joué à temps : on joue à sa place, puis forfait après 3 fois. */
  private onTurnTimeout(seat: 0 | 1): void {
    if (this.state.phase !== 'PLAYING' || this.engine.isOver) return
    if (this.engine.currentPlayerId !== seat) return

    // Joue à la place du joueur inactif via l'heuristique du bot (coup légal garanti).
    const action = botPlay(this.engine, seat)
    let next: GameState
    if (action.type === 'draw') {
      next = applyDraw(this.engine, seat, makeRng(Date.now()))
    } else {
      next = applyPlayCard(this.engine, seat, action.card, action.chosenSuit)
      if (next === this.engine) next = applyDraw(this.engine, seat, makeRng(Date.now()))
    }
    this.engine = next
    this.autoSkipCount[seat]++
    this.broadcast('auto_skip', { playerId: seat, pseudo: this.pseudoBySeat[seat] })

    // 3 auto-skips consécutifs → forfait : le joueur inactif perd.
    if (this.autoSkipCount[seat] >= DiJoujRoom.MAX_AUTO_SKIPS) {
      const winner = (1 - seat) as 0 | 1
      this.clearTurnTimer()
      this.state.phase = 'GAME_OVER'
      this.broadcast('forfeit', { loserUid: this.uidBySeat[seat] })
      this.syncPublic()
      this.finishGame(winner)
      this.clock.setTimeout(() => this.disconnect(), 2000)
      return
    }

    this.applyAutoSkips()
    this.afterEngineChange()
  }

  // ── Bot ────────────────────────────────────────────────────────────────────

  private scheduleBotIfNeeded(): void {
    if (this.botSeat === null) return
    if (this.engine.currentPlayerId !== this.botSeat) return
    if (this.engine.isOver) return

    this.clock.setTimeout(() => {
      if (this.engine.isOver || this.engine.currentPlayerId !== this.botSeat) return

      const action = botPlay(this.engine, this.botSeat!)
      if (action.type === 'draw') {
        this.engine = applyDraw(this.engine, this.botSeat!, makeRng(Date.now()))
      } else {
        this.engine = applyPlayCard(
          this.engine,
          this.botSeat!,
          action.card,
          action.chosenSuit,
        )
      }
      this.applyAutoSkips()
      this.afterEngineChange()
    }, 1500)
  }

  // ── Fin de partie ──────────────────────────────────────────────────────────

  private finishGame(winnerSeat?: 0 | 1): void {
    if (this.finished) return
    this.finished = true
    this.clearTurnTimer()

    if (this.state.phase !== 'GAME_OVER') this.state.phase = 'GAME_OVER'
    this.syncPublic()
    this.sendPrivateStateToAll()

    const winnerPseudo = winnerSeat !== undefined ? this.pseudoBySeat[winnerSeat] : null
    const goldWon = this.bet > 0 ? this.bet * 2 : 0
    // bet = mise misée PAR JOUEUR (pas le pot total — goldWon reste this.bet * 2,
    // c'est bien le gain réel crédité côté client).
    if (this.bet > 0 && winnerPseudo) {
      const winnerUid = winnerSeat !== undefined ? this.uidBySeat[winnerSeat] : ''
      console.log('[leaderboard] addWageredGold appelé:', { winner: winnerPseudo, bet: this.bet, game: 'dijouj' })
      void addWageredGold(winnerPseudo, this.bet, 'dijouj', winnerUid || undefined).catch((e) =>
        console.error('[leaderboard] addWageredGold error:', e))
    }

    this.broadcast('game_over', {
      aborted:     false,
      winnerSeat,
      winnerPseudo,
      goldWon,
    })
  }

  // ── Synchronisation publique ───────────────────────────────────────────────

  private syncPublic(): void {
    const e = this.engine
    if (!e) return

    this.state.currentPlayer = e.currentPlayerId
    this.state.deckCount     = e.drawPile.length

    const top = e.discardPile[e.discardPile.length - 1]
    if (top) {
      this.state.topCard.suit  = top.suit
      this.state.topCard.value = top.value
    }

    this.state.chosenSuit = e.chosenSuit ?? ''

    if (e.pendingEffect?.type === 'draw2') {
      this.state.pendingEffectType  = 'draw2'
      this.state.pendingEffectCount = e.pendingEffect.count
    } else if (e.pendingEffect?.type === 'skip') {
      this.state.pendingEffectType  = 'skip'
      this.state.pendingEffectCount = 0
    } else {
      this.state.pendingEffectType  = ''
      this.state.pendingEffectCount = 0
    }

    for (const [, ps] of this.state.players) {
      ps.handCount = e.players[ps.seat]?.hand.length ?? 0
    }
  }

  // ── État privé ────────────────────────────────────────────────────────────

  private sendPrivateStateTo(client: Client, seat: 0 | 1): void {
    const e   = this.engine
    const opp = (1 - seat) as 0 | 1
    const me  = e.players[seat]
    const top = e.discardPile[e.discardPile.length - 1]
    const oppPs = this.getPlayerSchemaForSeat(opp)

    client.send('game_state', {
      seat,
      phase:         this.state.phase,
      currentPlayer: e.currentPlayerId,
      deckCount:     e.drawPile.length,
      topCard:       top ? { suit: top.suit, value: top.value } : null,
      chosenSuit:    e.chosenSuit,
      pendingEffect: e.pendingEffect,
      you:           { hand: me.hand },
      opponents: [{
        pseudo:      this.pseudoBySeat[opp],
        handCount:   e.players[opp].hand.length,
        seat:        opp,
        connected:   oppPs?.connected ?? true,
        isBot:       this.botSeat === opp,
        uid:         oppPs?.uid ?? '',
        avatarType:  oppPs?.avatarType ?? 'initial',
        avatarEmoji: oppPs?.avatarEmoji ?? '',
        avatarImage: oppPs?.avatarImage ?? '',
        level:       oppPs?.level ?? 1,
      }],
      isOver:   e.isOver,
      winnerId: e.winnerId,
    })
  }

  private sendPrivateStateToAll(): void {
    for (const client of this.clients) {
      const seat = this.seatOf(client.sessionId)
      if (seat !== null) this.sendPrivateStateTo(client, seat)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getPlayerSchemaForSeat(seat: 0 | 1): PlayerDjSchema | null {
    for (const [, ps] of this.state.players) {
      if (ps.seat === seat) return ps
    }
    return null
  }

  private seatOf(sessionId: string): 0 | 1 | null {
    if (this.sessionBySeat[0] === sessionId) return 0
    if (this.sessionBySeat[1] === sessionId) return 1
    return null
  }
}

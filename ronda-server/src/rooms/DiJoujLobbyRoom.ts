import { Room, Client } from 'colyseus'
import { Schema, type, MapSchema } from '@colyseus/schema'
import { createInitialState } from '../engine-dijouj/deal'
import { applyPlayCard, applyDraw } from '../engine-dijouj/game'
import type { GameState, Card, Suit } from '../engine-dijouj/types'
import { generateCode, registerCode, unregisterCode } from './registry'
import { addWageredGold } from '../db/queries'
import { resolveAutoSkips } from './autoSkip'

// ── Schéma Colyseus (état public du lobby) ────────────────────────────────────

class DiJoujSlot extends Schema {
  @type('string')  pseudo    = ''
  @type('boolean') isAdmin   = false
  @type('boolean') isBot     = false
  @type('boolean') connected = false
  @type('uint8')   seat      = 0
}

class DiJoujLobbyState extends Schema {
  @type('string')             code  = ''
  @type('string')             phase = 'WAITING'
  @type({ map: DiJoujSlot }) slots = new MapSchema<DiJoujSlot>()
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

// ── Room lobby Di Jouj (2 ou 4 joueurs) ───────────────────────────────────────

export class DiJoujLobbyRoom extends Room<DiJoujLobbyState> {
  maxClients = 4

  private engine!: GameState
  private pc = 0
  private bet = 0
  private sessionBySeat: (string | null)[] = []
  private pseudoBySeat:  string[]           = []
  private isBotSeat:     boolean[]          = []
  private forfeitedSeats = new Set<number>()
  private reconnectSeconds = Number(process.env.RECONNECT_SECONDS ?? 60)
  private finished = false

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  onCreate(options?: { bet?: number }): void {
    this.state = new DiJoujLobbyState()
    this.setPrivate(true)
    this.bet = Math.max(0, Math.floor(Number(options?.bet ?? 0)) || 0)

    const code = generateCode()
    this.state.code = code
    this.setMetadata({ code })
    registerCode(code, this.roomId, 'dijouj-lobby')

    this.onMessage('start_game', (client) => this.handleStart(client))

    this.onMessage('play_card', (client, msg: { card: Card; chosenSuit?: Suit }) => {
      const seat = this.seatOf(client.sessionId)
      if (seat === null || this.state.phase !== 'PLAYING') return
      if (this.engine.currentPlayerId !== seat) {
        client.send('error', { message: 'Ce n\'est pas ton tour.' }); return
      }
      const next = applyPlayCard(this.engine, seat, msg.card, msg.chosenSuit)
      if (next === this.engine) { client.send('error', { message: 'Coup invalide.' }); return }
      this.engine = next
      if (this.engine.pendingEffect && !this.engine.isOver) {
        const { engine, skipped } = resolveAutoSkips(
          this.engine, makeRng(Date.now()), this.pseudoBySeat,
        )
        this.engine = engine
        for (const s of skipped) this.broadcast('auto_skip', s)
      }
      this.afterEngineChange()
    })

    this.onMessage('draw_card', (client) => {
      const seat = this.seatOf(client.sessionId)
      if (seat === null || this.state.phase !== 'PLAYING') return
      if (this.engine.currentPlayerId !== seat) {
        client.send('error', { message: 'Ce n\'est pas ton tour.' }); return
      }
      this.engine = applyDraw(this.engine, seat, makeRng(Date.now()))
      this.afterEngineChange()
    })
  }

  onJoin(client: Client, options: { pseudo: string }): void {
    if (this.state.phase !== 'WAITING') throw new Error('La partie a déjà commencé.')

    const pseudo = (options?.pseudo ?? 'Joueur').slice(0, 24)
    const slot = new DiJoujSlot()
    slot.pseudo    = pseudo
    slot.isAdmin   = this.state.slots.size === 0
    slot.isBot     = false
    slot.connected = true
    slot.seat      = this.state.slots.size
    this.state.slots.set(client.sessionId, slot)
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    const slot = this.state.slots.get(client.sessionId)
    if (slot) slot.connected = false

    if (consented && this.state.phase === 'PLAYING') {
      const leaverSeat = this.seatOf(client.sessionId)
      if (this.pc === 2) {
        // 1v1 : l'adversaire gagne
        const oppSeat = leaverSeat === 0 ? 1 : 0
        this.finishGame(oppSeat)
        this.clock.setTimeout(() => this.disconnect(), 800)
        return
      }
      // 3+ joueurs : le partant est retiré, les autres continuent
      if (leaverSeat !== null) {
        this.forfeitedSeats.add(leaverSeat)
        this.broadcast('player_forfeited', {
          seat:   leaverSeat,
          pseudo: this.pseudoBySeat[leaverSeat] ?? 'Joueur',
        })
        this.resolveForfeitedTurns()
        if (!this.engine.isOver) this.sendPrivateStateToAll()
      }
      return
    }

    if (consented || this.state.phase !== 'PLAYING') {
      if (this.state.phase === 'WAITING') {
        this.state.slots.delete(client.sessionId)
        this.reassignAdminIfNeeded()
      }
      return
    }

    const seat = this.seatOf(client.sessionId)
    if (seat !== null) {
      this.broadcast('opponent_disconnected', { seat }, { except: client })
    }

    try {
      await this.allowReconnection(client, this.reconnectSeconds)
      if (slot) slot.connected = true
      if (seat !== null) {
        this.broadcast('opponent_reconnected', { seat })
        this.sendPrivateStateTo(client, seat)
      }
    } catch {
      this.broadcast('game_over', { aborted: true, reason: 'player_left' })
      this.disconnect()
    }
  }

  onDispose(): void {
    if (this.state.code) unregisterCode(this.state.code)
  }

  // ── Lobby ─────────────────────────────────────────────────────────────────────

  private reassignAdminIfNeeded(): void {
    const slots = [...this.state.slots.values()]
    if (slots.length > 0 && !slots.some(s => s.isAdmin)) slots[0].isAdmin = true
  }

  private handleStart(client: Client): void {
    if (this.state.phase !== 'WAITING') return
    const slot = this.state.slots.get(client.sessionId)
    if (!slot?.isAdmin) { client.send('error', { message: 'Seul l\'hôte peut lancer.' }); return }

    const humanSlots = [...this.state.slots.values()].filter(s => s.connected && !s.isBot)
    if (humanSlots.length < 2) { client.send('error', { message: 'Il faut au moins 2 joueurs.' }); return }

    this.startGame()
  }

  // ── Démarrage ─────────────────────────────────────────────────────────────────

  private startGame(): void {
    // Lobby ami : seulement les humains connectés, sans bots
    const humans = [...this.state.slots.entries()].filter(([, s]) => s.connected && !s.isBot)
    const pc = humans.length

    this.sessionBySeat = new Array(pc).fill(null)
    this.pseudoBySeat  = new Array(pc).fill('')
    this.isBotSeat     = new Array(pc).fill(false)

    humans.forEach(([sid, s], i) => {
      this.sessionBySeat[i] = sid
      this.pseudoBySeat[i]  = s.pseudo
      s.seat = i
    })

    this.pc = pc
    this.engine = createInitialState(pc, makeRng(Date.now()))
    this.state.phase = 'PLAYING'

    this.broadcast('game_start', { code: this.state.code })
    this.sendPrivateStateToAll()
    // Pas de bots → pas besoin de scheduleBotIfNeeded
  }

  // ── Après chaque changement moteur ────────────────────────────────────────────

  private afterEngineChange(): void {
    // Résoudre les tours des joueurs ayant abandonné avant d'envoyer l'état
    if (this.forfeitedSeats.size > 0 && !this.engine.isOver) {
      this.resolveForfeitedTurns()
    }
    if (this.engine.isOver) this.state.phase = 'GAME_OVER'
    this.sendPrivateStateToAll()

    if (this.engine.isOver) {
      this.finishGame(this.engine.winnerId ?? undefined)
      this.clock.setTimeout(() => this.disconnect(), 5000)
    }
  }

  /**
   * Joue automatiquement (draw) pour chaque joueur qui a abandonné,
   * aussi longtemps que c'est son tour.
   */
  private resolveForfeitedTurns(): void {
    let iter = 0
    while (
      !this.engine.isOver &&
      this.state.phase === 'PLAYING' &&
      this.forfeitedSeats.has(this.engine.currentPlayerId) &&
      iter < this.pc
    ) {
      iter++
      this.engine = applyDraw(this.engine, this.engine.currentPlayerId, makeRng(Date.now()))
      // Appliquer également l'auto-skip si le joueur suivant ne peut pas contrer
      if (this.engine.pendingEffect && !this.engine.isOver) {
        const { engine, skipped } = resolveAutoSkips(this.engine, makeRng(Date.now()), this.pseudoBySeat)
        this.engine = engine
        for (const s of skipped) this.broadcast('auto_skip', s)
      }
    }
    if (this.engine.isOver) this.state.phase = 'GAME_OVER'
  }

  // ── Fin de partie ─────────────────────────────────────────────────────────────

  private finishGame(winnerSeat?: number): void {
    if (this.finished) return
    this.finished = true
    if (this.state.phase !== 'GAME_OVER') this.state.phase = 'GAME_OVER'
    this.sendPrivateStateToAll()

    const winnerPseudo = winnerSeat !== undefined ? (this.pseudoBySeat[winnerSeat] ?? null) : null
    const goldWon = this.bet > 0 ? this.bet * this.pc : 0
    if (this.bet > 0 && winnerPseudo) {
      addWageredGold(winnerPseudo, goldWon, 'dijouj')
    }

    this.broadcast('game_over', {
      aborted:     false,
      winnerSeat,
      winnerPseudo,
      goldWon,
    })
  }

  // ── Envoi d'état privé ────────────────────────────────────────────────────────

  private sendPrivateStateTo(client: Client, seat: number): void {
    const e   = this.engine
    const top = e.discardPile[e.discardPile.length - 1]

    const opponents = []
    for (let s = 0; s < this.pc; s++) {
      if (s === seat) continue
      const isBot = this.isBotSeat[s]
      let connected = true
      if (!isBot) {
        const sid = this.sessionBySeat[s]
        if (sid) {
          const sl = this.state.slots.get(sid)
          connected = sl?.connected ?? true
        }
      }
      opponents.push({
        pseudo:    this.pseudoBySeat[s],
        handCount: e.players[s]?.hand.length ?? 0,
        seat:      s,
        connected,
        isBot,
      })
    }

    client.send('game_state', {
      seat,
      phase:         this.state.phase,
      currentPlayer: e.currentPlayerId,
      deckCount:     e.drawPile.length,
      topCard:       top ? { suit: top.suit, value: top.value } : null,
      chosenSuit:    e.chosenSuit,
      pendingEffect: e.pendingEffect,
      you:           { hand: e.players[seat]?.hand ?? [] },
      opponents,
      isOver:        e.isOver,
      winnerId:      e.winnerId,
    })
  }

  private sendPrivateStateToAll(): void {
    for (const client of this.clients) {
      const seat = this.seatOf(client.sessionId)
      if (seat !== null) this.sendPrivateStateTo(client, seat)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private seatOf(sessionId: string): number | null {
    const idx = this.sessionBySeat.indexOf(sessionId)
    return idx === -1 ? null : idx
  }
}

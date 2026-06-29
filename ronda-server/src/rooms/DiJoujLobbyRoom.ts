import { Room, Client } from 'colyseus'
import { Schema, type, MapSchema } from '@colyseus/schema'
import { createInitialState } from '../engine-dijouj/deal'
import { applyPlayCard, applyDraw } from '../engine-dijouj/game'
import type { GameState, Card, Suit } from '../engine-dijouj/types'
import { botPlay } from '../ai-dijouj/bot'
import { generateCode, registerCode, unregisterCode } from './registry'

// ── Schéma Colyseus (état public du lobby) ────────────────────────────────────

class DiJoujSlot extends Schema {
  @type('string')  pseudo    = ''
  @type('boolean') isAdmin   = false
  @type('boolean') isBot     = false
  @type('boolean') connected = false
  @type('uint8')   seat      = 0
}

class DiJoujLobbyState extends Schema {
  @type('string')             code        = ''
  @type('string')             phase       = 'WAITING'
  @type('uint8')              playerCount = 2
  @type({ map: DiJoujSlot }) slots       = new MapSchema<DiJoujSlot>()
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
  private sessionBySeat: (string | null)[] = []
  private pseudoBySeat:  string[]           = []
  private isBotSeat:     boolean[]          = []
  private reconnectSeconds = Number(process.env.RECONNECT_SECONDS ?? 60)
  private finished = false

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  onCreate(): void {
    this.state = new DiJoujLobbyState()
    this.setPrivate(true)

    const code = generateCode()
    this.state.code = code
    this.setMetadata({ code })
    registerCode(code, this.roomId, 'dijouj-lobby')

    this.onMessage('set_player_count', (client, msg: { count: 2 | 4 }) => {
      if (this.state.phase !== 'WAITING') return
      const slot = this.state.slots.get(client.sessionId)
      if (!slot?.isAdmin) return
      if (msg.count === 2 || msg.count === 4) {
        this.state.playerCount = msg.count
        this.maxClients = msg.count
      }
    })

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
      const oppSeat = ([0, 1, 2, 3] as const).find(s => s !== this.seatOf(client.sessionId))!
      this.finishGame(oppSeat)
      this.clock.setTimeout(() => this.disconnect(), 800)
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
    const pc = this.state.playerCount as 2 | 4

    // Assign seats to humans first
    const humans = [...this.state.slots.entries()].filter(([, s]) => s.connected && !s.isBot)
    this.sessionBySeat = new Array(pc).fill(null)
    this.pseudoBySeat  = new Array(pc).fill('')
    this.isBotSeat     = new Array(pc).fill(false)

    humans.forEach(([sid, s], i) => {
      if (i >= pc) return
      this.sessionBySeat[i] = sid
      this.pseudoBySeat[i]  = s.pseudo
      s.seat = i
    })

    // Fill remaining seats with bots
    let botIdx = 0
    for (let seat = 0; seat < pc; seat++) {
      if (this.sessionBySeat[seat] !== null) continue
      botIdx++
      const botId  = `bot-${seat}-${botIdx}`
      const botSlot = new DiJoujSlot()
      botSlot.pseudo    = `Bot ${botIdx}`
      botSlot.isBot     = true
      botSlot.connected = true
      botSlot.seat      = seat
      this.state.slots.set(botId, botSlot)
      this.pseudoBySeat[seat] = `Bot ${botIdx}`
      this.isBotSeat[seat]    = true
    }

    this.engine = createInitialState(pc, makeRng(Date.now()))
    this.state.phase = 'PLAYING'

    this.broadcast('game_start', { code: this.state.code })
    this.sendPrivateStateToAll()
    this.scheduleBotIfNeeded()
  }

  // ── Après chaque changement moteur ────────────────────────────────────────────

  private afterEngineChange(): void {
    if (this.engine.isOver) this.state.phase = 'GAME_OVER'
    this.sendPrivateStateToAll()

    if (this.engine.isOver) {
      this.finishGame(this.engine.winnerId ?? undefined)
      this.clock.setTimeout(() => this.disconnect(), 5000)
    } else {
      this.scheduleBotIfNeeded()
    }
  }

  // ── Bot ───────────────────────────────────────────────────────────────────────

  private scheduleBotIfNeeded(): void {
    if (!this.engine || this.engine.isOver) return
    const seat = this.engine.currentPlayerId
    if (!this.isBotSeat[seat]) return

    const delay = Math.floor(makeRng(Date.now())() * 1000) + 1500 // 1500–2500ms
    this.clock.setTimeout(() => {
      if (!this.engine || this.engine.isOver || this.engine.currentPlayerId !== seat) return
      const action = botPlay(this.engine, seat)
      if (action.type === 'draw') {
        this.engine = applyDraw(this.engine, seat, makeRng(Date.now()))
      } else {
        this.engine = applyPlayCard(this.engine, seat, action.card, action.chosenSuit)
      }
      this.afterEngineChange()
    }, delay)
  }

  // ── Fin de partie ─────────────────────────────────────────────────────────────

  private finishGame(winnerSeat?: number): void {
    if (this.finished) return
    this.finished = true
    if (this.state.phase !== 'GAME_OVER') this.state.phase = 'GAME_OVER'
    this.sendPrivateStateToAll()
    this.broadcast('game_over', {
      aborted:      false,
      winnerSeat,
      winnerPseudo: winnerSeat !== undefined ? (this.pseudoBySeat[winnerSeat] ?? null) : null,
    })
  }

  // ── Envoi d'état privé ────────────────────────────────────────────────────────

  private sendPrivateStateTo(client: Client, seat: number): void {
    const e   = this.engine
    const top = e.discardPile[e.discardPile.length - 1]
    const pc  = this.state.playerCount

    const opponents = []
    for (let s = 0; s < pc; s++) {
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

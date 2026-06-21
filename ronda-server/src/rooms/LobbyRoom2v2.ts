import { Room, Client } from 'colyseus'
import { Schema, type, MapSchema } from '@colyseus/schema'
import { v4 as uuid } from 'uuid'
import {
  createInitialState2v2,
  startNewDeal2v2,
  applyAction2v2,
} from '../engine2v2/index2v2'
import type { GameState2v2, PlayerId2v2 } from '../engine2v2/types2v2'
import { teamOf } from '../engine2v2/types2v2'
import type { Card, Combination, GameEvent, Value } from '../engine/types'
import { getObservableState2v2 } from '../ai2v2/observable2v2'
import { chooseAction2v2 } from '../ai2v2/bot2v2'
import { createMemory2v2, updateMemory2v2, type AiMemory2v2 } from '../ai2v2/memory2v2'
import { recordGame, touchPlayer } from '../db/queries'
import { generateCode, registerCode, unregisterCode } from './registry'

// ── Schéma Colyseus (lobby public) ────────────────────────────────────────────

class LobbySlot extends Schema {
  @type('string') pseudo = ''
  @type('int8') team = -1 // -1 = non choisie, 0 = équipe A, 1 = équipe B
  @type('boolean') isAdmin = false
  @type('boolean') isBot = false
  @type('boolean') connected = false
  @type('int8') seat = -1 // assigné au démarrage (0..3)
}

class LobbyState extends Schema {
  @type('string') code = ''
  @type('string') phase = 'WAITING' // 'WAITING' | 'PLAYING'
  @type({ map: LobbySlot }) slots = new MapSchema<LobbySlot>()
}

// ── Outils ─────────────────────────────────────────────────────────────────────

const EVENT_POINTS: Record<GameEvent, number> = {
  caida: 1, ara_khamssa: 5, ara_7dach: 11, missa: 1, ronda: 1, tringa: 5, contre: 0,
}

function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const SEATS_OF_TEAM: Record<0 | 1, [PlayerId2v2, PlayerId2v2]> = { 0: [0, 2], 1: [1, 3] }

// ── Room lobby + partie 2v2 ────────────────────────────────────────────────────

export class LobbyRoom2v2 extends Room<LobbyState> {
  maxClients = 4

  private engine: GameState2v2 | null = null
  private sessionBySeat: (string | null)[] = [null, null, null, null]
  private pseudoBySeat: string[] = ['', '', '', '']
  private isBotSeat: boolean[] = [false, false, false, false]
  private mems: AiMemory2v2[] = []
  private dealConfirmed = new Set<PlayerId2v2>()
  private startedAt = 0
  private recorded = false
  private reconnectSeconds = Number(process.env.RECONNECT_SECONDS ?? 60)

  // ── Lifecycle ───────────────────────────────────────────────────────────

  onCreate(): void {
    this.state = new LobbyState()
    this.maxClients = 4

    const code = generateCode()
    this.state.code = code
    this.setMetadata({ code })
    this.setPrivate(true)
    registerCode(code, this.roomId)

    this.onMessage('choose_team', (client, msg: { team: 0 | 1 }) => {
      if (this.state.phase !== 'WAITING') return
      const slot = this.state.slots.get(client.sessionId)
      if (slot && (msg.team === 0 || msg.team === 1)) slot.team = msg.team
    })

    this.onMessage('start_game', (client) => this.handleStart(client))
    this.onMessage('play_card', (client, msg: { card: Card }) =>
      this.handleAction(client, (seat) => ({ type: 'PLAY_CARD', playerId: seat, card: msg.card })),
    )
    this.onMessage('declare', (client, msg: { combination: Combination }) =>
      this.handleAction(client, (seat) => ({ type: 'DECLARE', playerId: seat, combination: msg.combination })),
    )
    this.onMessage('contest', (client, msg: { accusedPlayer: PlayerId2v2; accusedValue: Value }) =>
      this.handleAction(client, (seat) => ({
        type: 'CONTEST', playerId: seat, accusedPlayer: msg.accusedPlayer, accusedValue: msg.accusedValue,
      })),
    )
    this.onMessage('continue_deal', (client) => this.handleContinueDeal(client))
  }

  onJoin(client: Client, options: { pseudo: string }): void {
    if (this.state.phase !== 'WAITING') throw new Error('La partie a déjà commencé.')
    const pseudo = (options?.pseudo ?? 'Joueur').slice(0, 24)
    touchPlayer(pseudo)

    const slot = new LobbySlot()
    slot.pseudo = pseudo
    slot.team = -1
    slot.isAdmin = this.state.slots.size === 0 // le 1er = admin
    slot.isBot = false
    slot.connected = true
    this.state.slots.set(client.sessionId, slot)
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    const slot = this.state.slots.get(client.sessionId)
    if (slot) slot.connected = false

    if (consented || this.state.phase !== 'PLAYING') {
      // En lobby : on retire le joueur (et on réattribue l'admin si besoin).
      if (this.state.phase === 'WAITING') {
        this.state.slots.delete(client.sessionId)
        this.reassignAdminIfNeeded()
      }
      return
    }

    // En partie : on laisse 60 s pour se reconnecter.
    const seat = this.seatOf(client.sessionId)
    if (seat !== null) this.broadcast('opponent_disconnected', { seat }, { except: client })
    try {
      await this.allowReconnection(client, this.reconnectSeconds)
      if (slot) slot.connected = true
      if (seat !== null) {
        this.broadcast('opponent_reconnected', { seat })
        this.sendGameStateTo(client, seat)
      }
    } catch {
      this.broadcast('game_over', { aborted: true, reason: 'player_left' })
      this.disconnect()
    }
  }

  onDispose(): void {
    if (this.state.code) unregisterCode(this.state.code)
  }

  // ── Lobby ─────────────────────────────────────────────────────────────────

  private reassignAdminIfNeeded(): void {
    const slots = [...this.state.slots.values()]
    if (slots.length > 0 && !slots.some((s) => s.isAdmin)) {
      slots[0].isAdmin = true
    }
  }

  private handleStart(client: Client): void {
    if (this.state.phase !== 'WAITING') return
    const slot = this.state.slots.get(client.sessionId)
    if (!slot?.isAdmin) {
      client.send('error', { message: 'Seul l’hôte peut lancer la partie.' })
      return
    }
    const connectedHumans = [...this.state.slots.values()].filter((s) => s.connected && !s.isBot)
    if (connectedHumans.length < 2) {
      client.send('error', { message: 'Il faut au moins 2 joueurs.' })
      return
    }
    this.startGame()
  }

  private startGame(): void {
    // Affectation des sièges : équipes A = {0,2}, B = {1,3}.
    const humans = [...this.state.slots.entries()].filter(([, s]) => s.connected && !s.isBot)
    const assigned: (string | null)[] = [null, null, null, null]
    const used: Record<0 | 1, number> = { 0: 0, 1: 0 }

    // 1) Joueurs ayant choisi une équipe.
    const deferred: [string, LobbySlot][] = []
    for (const [sid, s] of humans) {
      const t = s.team === 0 || s.team === 1 ? (s.team as 0 | 1) : null
      if (t !== null && used[t] < 2) {
        assigned[SEATS_OF_TEAM[t][used[t]]] = sid
        used[t]++
      } else {
        deferred.push([sid, s])
      }
    }
    // 2) Joueurs sans équipe (ou équipe pleine) → équipe la moins remplie.
    for (const [sid] of deferred) {
      const t: 0 | 1 = used[0] <= used[1] ? 0 : 1
      assigned[SEATS_OF_TEAM[t][used[t]]] = sid
      used[t]++
    }

    // 3) Sièges restants → bots.
    let botIdx = 0
    for (let seat = 0 as PlayerId2v2; seat < 4; seat = (seat + 1) as PlayerId2v2) {
      const sid = assigned[seat]
      if (sid !== null) {
        const s = this.state.slots.get(sid)!
        s.seat = seat
        s.team = teamOf(seat)
        this.sessionBySeat[seat] = sid
        this.pseudoBySeat[seat] = s.pseudo
        this.isBotSeat[seat] = false
      } else {
        botIdx++
        const botId = `bot-${seat}`
        const bs = new LobbySlot()
        bs.pseudo = `Bot ${botIdx}`
        bs.seat = seat
        bs.team = teamOf(seat)
        bs.isBot = true
        bs.connected = true
        this.state.slots.set(botId, bs)
        this.sessionBySeat[seat] = null
        this.pseudoBySeat[seat] = bs.pseudo
        this.isBotSeat[seat] = true
      }
    }

    const firstDealer = Math.floor(Math.random() * 4) as PlayerId2v2
    this.engine = createInitialState2v2(makeRng(Date.now()), firstDealer)
    this.mems = [createMemory2v2(), createMemory2v2(), createMemory2v2(), createMemory2v2()]
    this.startedAt = Date.now()
    this.state.phase = 'PLAYING'

    this.broadcast('game_start', { code: this.state.code })
    this.syncAfterChange('WAITING', this.engine.eventSeq, true)
  }

  // ── Partie ──────────────────────────────────────────────────────────────

  private handleAction(
    client: Client,
    build: (seat: PlayerId2v2) =>
      | { type: 'PLAY_CARD'; playerId: PlayerId2v2; card: Card }
      | { type: 'DECLARE'; playerId: PlayerId2v2; combination: Combination }
      | { type: 'CONTEST'; playerId: PlayerId2v2; accusedPlayer: PlayerId2v2; accusedValue: Value },
  ): void {
    if (!this.engine || this.state.phase !== 'PLAYING' || this.engine.phase !== 'PLAYING') {
      client.send('error', { message: 'La partie n’est pas en cours.' })
      return
    }
    const seat = this.seatOf(client.sessionId)
    if (seat === null) return
    this.applyAndSync(build(seat), client)
  }

  private applyAndSync(action: ReturnType<Parameters<LobbyRoom2v2['handleAction']>[1]>, client?: Client): void {
    if (!this.engine) return
    const prevPhase = this.engine.phase
    const prevSeq = this.engine.eventSeq
    try {
      this.engine = applyAction2v2(this.engine, action, makeRng(Date.now()))
    } catch (e) {
      client?.send('error', { message: (e as Error).message })
      return
    }
    // Mémoire des bots : on enregistre le coup observé.
    const played = action.type === 'PLAY_CARD' ? { byPlayer: action.playerId, card: action.card } : undefined
    const contested = action.type === 'CONTEST' ? action.accusedValue : undefined
    for (const p of [0, 1, 2, 3] as PlayerId2v2[]) {
      this.mems[p] = updateMemory2v2(
        this.mems[p],
        getObservableState2v2(this.engine, p),
        played,
        action.playerId === p ? contested : undefined,
      )
    }
    this.syncAfterChange(prevPhase, prevSeq, false)
  }

  private syncAfterChange(prevPhase: string, prevSeq: number, isStart: boolean): void {
    if (!this.engine) return
    this.sendGameStateToAll()

    if (!isStart && this.engine.eventSeq !== prevSeq) {
      for (const ev of this.engine.lastEvents) {
        this.broadcast('event', { type: ev, points: EVENT_POINTS[ev] })
      }
    }

    if (this.engine.phase === 'DEAL_END' && prevPhase !== 'DEAL_END') {
      this.dealConfirmed.clear()
      this.broadcast('deal_end', {
        scores: [this.engine.teams[0].score, this.engine.teams[1].score],
        captured: [this.engine.teams[0].captured.length, this.engine.teams[1].captured.length],
        dealNumber: this.engine.dealNumber,
      })
      return
    }

    if (this.engine.phase === 'GAME_OVER') {
      this.finishGame()
      return
    }

    this.scheduleBotIfNeeded()
  }

  private handleContinueDeal(client: Client): void {
    if (!this.engine || this.engine.phase !== 'DEAL_END') return
    const seat = this.seatOf(client.sessionId)
    if (seat === null) return
    this.dealConfirmed.add(seat)

    // On attend la confirmation de tous les humains connectés.
    const humanSeats = ([0, 1, 2, 3] as PlayerId2v2[]).filter((s) => !this.isBotSeat[s])
    const allConfirmed = humanSeats.every((s) => this.dealConfirmed.has(s))
    if (!allConfirmed) {
      this.broadcast('deal_confirm', { seat })
      return
    }

    this.dealConfirmed.clear()
    this.engine = startNewDeal2v2(
      {
        scores: [this.engine.teams[0].score, this.engine.teams[1].score],
        dealer: ((this.engine.dealer + 3) % 4) as PlayerId2v2,
        dealNumber: this.engine.dealNumber + 1,
      },
      makeRng(Date.now()),
    )
    this.syncAfterChange('DEAL_END', this.engine.eventSeq, true)
  }

  // ── Bots ────────────────────────────────────────────────────────────────

  private scheduleBotIfNeeded(): void {
    if (!this.engine || this.engine.phase !== 'PLAYING') return
    const seat = this.engine.currentPlayer
    if (!this.isBotSeat[seat]) return

    const delay = Math.floor(Math.random() * 1000) + 1500 // 1500–2500 ms
    this.clock.setTimeout(() => {
      if (!this.engine || this.engine.phase !== 'PLAYING' || this.engine.currentPlayer !== seat) return
      const action = chooseAction2v2(getObservableState2v2(this.engine, seat), seat, 'medium', this.mems[seat])
      this.applyAndSync(action)
    }, delay)
  }

  // ── Fin de partie ─────────────────────────────────────────────────────────

  private finishGame(): void {
    if (!this.engine || this.recorded) return
    this.recorded = true
    const scores: [number, number] = [this.engine.teams[0].score, this.engine.teams[1].score]
    const winnerTeam = scores[0] >= 41 ? 0 : scores[1] >= 41 ? 1 : null
    const winnerPseudo =
      winnerTeam === null ? null : `${this.pseudoBySeat[SEATS_OF_TEAM[winnerTeam][0]]} & ${this.pseudoBySeat[SEATS_OF_TEAM[winnerTeam][1]]}`

    recordGame({
      id: uuid(),
      player1_pseudo: `${this.pseudoBySeat[0]} & ${this.pseudoBySeat[2]}`,
      player2_pseudo: `${this.pseudoBySeat[1]} & ${this.pseudoBySeat[3]}`,
      winner_pseudo: winnerPseudo,
      duration_seconds: Math.round((Date.now() - this.startedAt) / 1000),
    })

    this.broadcast('game_over', { aborted: false, winnerTeam, winnerPseudo, scores })
  }

  // ── Synchronisation de l'état de jeu (par client) ──────────────────────────

  private sendGameStateTo(client: Client, seat: PlayerId2v2): void {
    if (!this.engine) return
    const e = this.engine
    client.send('game_state', {
      seat,
      phase: e.phase,
      currentSeat: e.currentPlayer,
      dealer: e.dealer,
      deckCount: e.deck.length,
      dealNumber: e.dealNumber,
      roundNumber: e.roundNumber,
      isMabqach: e.isMabqach,
      table: e.table,
      lastPlayed: e.lastPlayed,
      lastCapture: e.lastCapture,
      lastEvents: e.lastEvents,
      eventSeq: e.eventSeq,
      teams: [
        { score: e.teams[0].score, capturedCount: e.teams[0].captured.length },
        { score: e.teams[1].score, capturedCount: e.teams[1].captured.length },
      ],
      players: ([0, 1, 2, 3] as PlayerId2v2[]).map((p) => ({
        seat: p,
        pseudo: this.pseudoBySeat[p],
        isBot: this.isBotSeat[p],
        team: teamOf(p),
        handCount: e.players[p].hand.length,
        declaredCombo: e.players[p].declaredCombo,
      })),
      you: {
        hand: e.players[seat].hand,
        pendingCombo: e.players[seat].pendingCombo,
        declaredCombo: e.players[seat].declaredCombo,
        lostComboRight: e.players[seat].lostComboRight,
        playedThisRound: e.players[seat].playedThisRound,
      },
    })
  }

  private sendGameStateToAll(): void {
    for (const client of this.clients) {
      const seat = this.seatOf(client.sessionId)
      if (seat !== null) this.sendGameStateTo(client, seat)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private seatOf(sessionId: string): PlayerId2v2 | null {
    const idx = this.sessionBySeat.indexOf(sessionId)
    return idx === -1 ? null : (idx as PlayerId2v2)
  }
}

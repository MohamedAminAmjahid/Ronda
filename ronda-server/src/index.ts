import http from 'node:http'
import express from 'express'
import cors from 'cors'
import { Server } from 'colyseus'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { initDatabase } from './db/database'
import {
  getStats, getLeaderboard, getRecentGames,
  getWeeklyLeaderboard, getWeeklyStats, getUserLeague, processWeeklyReset,
} from './db/queries'
import { RondaRoom } from './rooms/RondaRoom'
import { LobbyRoom2v2 } from './rooms/LobbyRoom2v2'
import { DiJoujRoom } from './rooms/DiJoujRoom'
import { DiJoujLobbyRoom } from './rooms/DiJoujLobbyRoom'
import { resolveCode, resolveCodeEntry } from './rooms/registry'

const PORT = Number(process.env.PORT ?? 2567)
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*'

// ── Base de données ────────────────────────────────────────────────────────────
initDatabase()

// ── HTTP (Express) ───────────────────────────────────────────────────────────
const app = express()
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',') }))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }))
app.get('/stats/:pseudo', (req, res) => res.json(getStats(req.params.pseudo)))
app.get('/leaderboard', (_req, res) => res.json(getLeaderboard()))
app.get('/games/recent', (_req, res) => res.json(getRecentGames()))

// Résolution d'un code de partie → roomId (pour client.joinById).
app.get('/room/:code', (req, res) => {
  const roomId = resolveCode(req.params.code)
  if (!roomId) return res.status(404).json({ error: 'Code de partie inconnu.' })
  return res.json({ roomId })
})

// Détection du type de room par code (1v1 'ronda' ou 2v2 'ronda2v2').
app.get('/room/:code/type', (req, res) => {
  const entry = resolveCodeEntry(req.params.code)
  if (!entry) return res.status(404).json({ error: 'Code de partie inconnu.' })
  return res.json({ type: entry.type, roomId: entry.roomId })
})

// ── Ligues & classement hebdomadaire ───────────────────────────────────────────

// Classement de la semaine courante pour une ligue.
app.get('/leaderboard/weekly', (req, res) => {
  const league = typeof req.query.league === 'string' ? req.query.league : 'Bronze'
  return res.json(getWeeklyLeaderboard(league))
})

// Détail par jeu pour un joueur cette semaine.
app.get('/leaderboard/weekly/stats/:username', (req, res) => {
  return res.json(getWeeklyStats(req.params.username))
})

// Ligue courante d'un joueur.
app.get('/league/:username', (req, res) => {
  return res.json({ league: getUserLeague(req.params.username) })
})

// Reset hebdomadaire (admin uniquement) → promotions/rétrogradations + récompenses.
app.post('/league/reset', (req, res) => {
  if (!process.env.ADMIN_KEY || req.header('x-admin-key') !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Non autorisé.' })
  }
  return res.json({ rewards: processWeeklyReset() })
})

// ── Colyseus ─────────────────────────────────────────────────────────────────
const httpServer = http.createServer(app)
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) })

gameServer.define('ronda', RondaRoom)
gameServer.define('ronda2v2', LobbyRoom2v2)
gameServer.define('dijouj', DiJoujRoom)
gameServer.define('dijouj-lobby', DiJoujLobbyRoom)

gameServer.listen(PORT)
console.log(`[ronda-server] écoute sur :${PORT}`)

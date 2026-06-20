import http from 'node:http'
import express from 'express'
import cors from 'cors'
import { Server } from 'colyseus'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { initDatabase } from './db/database'
import { getStats, getLeaderboard, getRecentGames } from './db/queries'
import { RondaRoom } from './rooms/RondaRoom'
import { resolveCode } from './rooms/registry'

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

// ── Colyseus ─────────────────────────────────────────────────────────────────
const httpServer = http.createServer(app)
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) })

gameServer.define('ronda', RondaRoom)

gameServer.listen(PORT)
console.log(`[ronda-server] écoute sur :${PORT}`)

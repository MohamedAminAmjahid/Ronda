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
import { adminAuth, adminDb, firebaseReady, getUsername, FieldValue } from './firebaseAdmin'
import { sendPushNotification } from './notifications'
import { stripe, stripeReady, WEBHOOK_SECRET, PACKS } from './stripe'
import type { Transaction } from 'firebase-admin/firestore'

const PORT = Number(process.env.PORT ?? 2567)
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*'

const corsOptions: cors.CorsOptions = {
  origin: CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
}

// ── Base de données ────────────────────────────────────────────────────────────
initDatabase()

// ── HTTP (Express) ───────────────────────────────────────────────────────────
const app = express()
app.use(cors(corsOptions))
app.options('*', cors(corsOptions))   // preflight pour toutes les routes

// ── Webhook Stripe (corps brut obligatoire pour vérifier la signature) ────────
app.post('/payment/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripeReady() || !stripe) return res.status(503).json({ error: 'stripe_unavailable' })
  const sig = req.headers['stripe-signature']
  if (typeof sig !== 'string' || !WEBHOOK_SECRET) return res.status(400).json({ error: 'no_signature' })
  let event
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, WEBHOOK_SECRET)
  } catch (e) {
    console.error('[webhook] signature invalide:', e)
    return res.status(400).json({ error: 'invalid_signature' })
  }
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as { metadata?: { uid?: string; packId?: string } }
    const uid    = pi.metadata?.uid
    const packId = pi.metadata?.packId
    const pack   = packId ? PACKS[packId] : null
    if (uid && pack && firebaseReady()) {
      try {
        await adminDb().collection('users').doc(uid).set(
          { gold: FieldValue.increment(pack.gold) }, { merge: true }
        )
        console.log(`[webhook] +${pack.gold} gold → ${uid}`)
      } catch (e) {
        console.error('[webhook] crédit gold échoué:', e)
      }
    }
  }
  return res.json({ received: true })
})

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

// ── Gold : cadeaux & transferts (serveur autoritaire) ──────────────────────────

const DAILY_TRANSFER_LIMIT = 200
const MAX_AMOUNT = 1_000_000

/** Date du jour YYYY-MM-DD (quota quotidien). */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Vérifie un token Firebase et renvoie l'uid, ou null. */
async function uidFromToken(token: unknown): Promise<string | null> {
  if (typeof token !== 'string' || !token) return null
  try {
    const decoded = await adminAuth().verifyIdToken(token)
    return decoded.uid
  } catch (e) {
    console.error('[gold] token invalide:', e)
    return null
  }
}

// Offrir un cadeau (simulation illimitée, sans débit émetteur).
app.post('/gold/gift', async (req, res) => {
  if (!firebaseReady()) return res.status(503).json({ error: 'firebase_unavailable' })
  const { fromToken, toUid, amount } = (req.body ?? {}) as { fromToken?: string; toUid?: string; amount?: number }
  if (typeof toUid !== 'string' || typeof amount !== 'number' || amount <= 0 || amount > MAX_AMOUNT) {
    return res.status(400).json({ error: 'bad_params' })
  }
  const fromUid = await uidFromToken(fromToken)
  if (!fromUid) return res.status(401).json({ error: 'unauthorized' })
  try {
    const db = adminDb()
    await db.collection('users').doc(toUid).set({ gold: FieldValue.increment(amount) }, { merge: true })
    // Historique (on ignore les crédits à soi-même : récompenses de quête).
    if (fromUid !== toUid) {
      const [fromName, toName] = await Promise.all([getUsername(fromUid), getUsername(toUid)])
      await db.collection('goldHistory').add({
        fromUid, fromName, toUid, toName, amount, type: 'gift',
        createdAt: FieldValue.serverTimestamp(),
      })
    }
    return res.json({ ok: true })
  } catch (e) {
    console.error('[/gold/gift] erreur:', e)
    return res.status(500).json({ error: 'server_error' })
  }
})

// Transférer du gold (gratuit, plafonné à 200/jour, débite l'émetteur).
app.post('/gold/transfer', async (req, res) => {
  if (!firebaseReady()) return res.status(503).json({ error: 'firebase_unavailable' })
  const { fromToken, toUid, amount } = (req.body ?? {}) as { fromToken?: string; toUid?: string; amount?: number }
  if (typeof toUid !== 'string' || typeof amount !== 'number' || amount <= 0 || amount > MAX_AMOUNT) {
    return res.status(400).json({ error: 'bad_params' })
  }
  const fromUid = await uidFromToken(fromToken)
  if (!fromUid) return res.status(401).json({ error: 'unauthorized' })
  if (fromUid === toUid) return res.status(400).json({ error: 'self_transfer' })

  try {
    const db = adminDb()
    const fromRef = db.collection('users').doc(fromUid)
    const toRef   = db.collection('users').doc(toUid)
    const today   = todayStr()

    const outcome = await db.runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(fromRef)
      const data = snap.data() ?? {}
      const gold = (data.gold as number) ?? 0
      const sent = data.dailyTransferDate === today ? ((data.dailyTransferSent as number) ?? 0) : 0
      const remaining = Math.max(0, DAILY_TRANSFER_LIMIT - sent)
      if (amount > gold)      return { ok: false as const, reason: 'balance', remaining, gold }
      if (amount > remaining) return { ok: false as const, reason: 'quota',   remaining, gold }
      tx.set(fromRef, { gold: gold - amount, dailyTransferSent: sent + amount, dailyTransferDate: today }, { merge: true })
      tx.set(toRef, { gold: FieldValue.increment(amount) }, { merge: true })
      return { ok: true as const, gold: gold - amount, remaining: remaining - amount }
    })

    if (!outcome.ok) {
      return res.json({ ok: false, reason: outcome.reason, remaining: outcome.remaining })
    }
    // Historique (hors transaction).
    const [fromName, toName] = await Promise.all([getUsername(fromUid), getUsername(toUid)])
    await db.collection('goldHistory').add({
      fromUid, fromName, toUid, toName, amount, type: 'transfer',
      createdAt: FieldValue.serverTimestamp(),
    })
    return res.json({ ok: true, gold: outcome.gold, remaining: outcome.remaining })
  } catch (e) {
    console.error('[/gold/transfer] erreur:', e)
    return res.status(500).json({ error: 'server_error' })
  }
})

// ── Paiements Stripe ──────────────────────────────────────────────────────────

// Crée un PaymentIntent et retourne le clientSecret au client.
app.post('/payment/create-intent', async (req, res) => {
  if (!stripeReady() || !stripe) return res.status(503).json({ error: 'stripe_unavailable' })
  const { fromToken, packId } = (req.body ?? {}) as { fromToken?: string; packId?: string }
  const pack = packId ? PACKS[packId] : null
  if (!pack) return res.status(400).json({ error: 'invalid_pack' })
  const uid = await uidFromToken(fromToken)
  if (!uid) return res.status(401).json({ error: 'unauthorized' })
  try {
    const intent = await stripe.paymentIntents.create({
      amount:   pack.amount,
      currency: pack.currency,
      metadata: { uid, packId: packId! },
      automatic_payment_methods: { enabled: true },
    })
    return res.json({ clientSecret: intent.client_secret })
  } catch (e) {
    console.error('[/payment/create-intent] erreur:', e)
    return res.status(500).json({ error: 'server_error' })
  }
})

// ── Notifications push (déclenchées après une action côté client) ──────────────

// Invitation de partie reçue.
app.post('/notify/invite', async (req, res) => {
  const { fromToken, toUid, game } = (req.body ?? {}) as { fromToken?: string; toUid?: string; game?: string }
  const fromUid = await uidFromToken(fromToken)
  if (!fromUid || typeof toUid !== 'string') return res.status(401).json({ error: 'unauthorized' })
  const fromName = await getUsername(fromUid)
  const gameLabel = game === 'ronda' ? 'Ronda' : 'Di Jouj'
  void sendPushNotification(toUid, '🎮 Invitation', `${fromName} t'invite à jouer (${gameLabel})`, { type: 'invite' })
  return res.json({ ok: true })
})

// Message privé reçu.
app.post('/notify/message', async (req, res) => {
  const { fromToken, toUid } = (req.body ?? {}) as { fromToken?: string; toUid?: string }
  const fromUid = await uidFromToken(fromToken)
  if (!fromUid || typeof toUid !== 'string') return res.status(401).json({ error: 'unauthorized' })
  const fromName = await getUsername(fromUid)
  void sendPushNotification(toUid, `💬 ${fromName}`, "Tu as reçu un message", { type: 'message', fromUid })
  return res.json({ ok: true })
})

// Demande d'ami reçue.
app.post('/notify/friend-request', async (req, res) => {
  const { fromToken, toUid } = (req.body ?? {}) as { fromToken?: string; toUid?: string }
  const fromUid = await uidFromToken(fromToken)
  if (!fromUid || typeof toUid !== 'string') return res.status(401).json({ error: 'unauthorized' })
  const fromName = await getUsername(fromUid)
  void sendPushNotification(toUid, '👥 Demande d\'ami', `${fromName} veut être ton ami`, { type: 'friend_request' })
  return res.json({ ok: true })
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

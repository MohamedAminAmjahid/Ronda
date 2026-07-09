import http from 'node:http'
import express from 'express'
import cors from 'cors'
import { Server } from 'colyseus'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { initDatabase } from './db/database'
import {
  getStats, getLeaderboard, getRecentGames,
  getWeeklyLeaderboard, getWeeklyStats, getUserLeague, processWeeklyReset,
  debugWeeklyScores, addWageredGold,
} from './db/queries'
import {
  createWeeklyTournament, registerPlayer, generateBracket,
  checkForfaits, distributePrizes, reportMatchResult, getCurrentTournament,
  type Tournament, type BracketRound, type BracketMatch,
} from './db/tournamentQueries'
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
console.log('🔥 [firebase] firebaseReady():', firebaseReady())

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
app.get('/leaderboard/weekly', async (req, res) => {
  const league = typeof req.query.league === 'string' ? req.query.league : 'Bronze'
  const result = await getWeeklyLeaderboard(league)
  console.log('[leaderboard] GET /leaderboard/weekly:', { league, entries: result.length })
  return res.json(result)
})

// Détail par jeu pour un joueur cette semaine.
app.get('/leaderboard/weekly/stats/:username', async (req, res) => {
  return res.json(await getWeeklyStats(req.params.username))
})

// Enregistre une mise gagnée au classement hebdo — utilisé pour les parties
// vs bot (repli matchmaking, hors-ligne) qui ne passent par aucune Room et où
// addWageredGold n'est donc jamais appelé côté Room.
app.post('/leaderboard/record', async (req, res) => {
  const { username, amount, game } = req.body as { username?: string; amount?: number; game?: string }
  if (!username || !amount || (game !== 'ronda' && game !== 'dijouj')) {
    return res.status(400).json({ error: 'Paramètres manquants' })
  }
  await addWageredGold(username, Number(amount), game)
  return res.json({ ok: true })
})

// Ligue courante d'un joueur.
app.get('/league/:username', (req, res) => {
  return res.json({ league: getUserLeague(req.params.username) })
})

// Reset hebdomadaire (admin uniquement) → promotions/rétrogradations + récompenses.
app.post('/league/reset', async (req, res) => {
  if (!process.env.ADMIN_KEY || req.header('x-admin-key') !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Non autorisé.' })
  }
  return res.json({ rewards: await processWeeklyReset() })
})

// Diagnostic (admin uniquement) : contenu brut de weekly_scores, pour inspecter
// la collection Firestore sans accès console. { db: false } = Firestore Admin
// non initialisé (credentials absents) — distingue ce cas de "collection vide".
app.get('/debug/weekly-scores', async (req, res) => {
  if (!process.env.ADMIN_KEY || req.header('x-admin-key') !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Non autorisé.' })
  }
  return res.json(await debugWeeklyScores())
})

// Test direct (admin uniquement) : force un appel addWageredGold pour
// vérifier de bout en bout l'écriture Firestore sans dépendre d'une vraie
// partie. Un doc weekly_scores/{semaine}_TestUser_ronda doit apparaître.
app.post('/debug/test-leaderboard', async (req, res) => {
  if (!process.env.ADMIN_KEY || req.header('x-admin-key') !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Non autorisé.' })
  }
  const ready = firebaseReady()
  if (!ready) return res.json({ ok: false, reason: 'Firebase Admin non initialisé', firebaseReady: ready })
  await addWageredGold('TestUser', 100, 'ronda')
  return res.json({ ok: true, firebaseReady: ready })
})

// ── Tournois hebdomadaires ──────────────────────────────────────────────────

/** Mêmes règles que les gardes admin inline ci-dessus (league/reset, debug/*),
 * extraites ici en middleware réutilisable pour les nouvelles routes /tournament/admin/*. */
function adminGuard(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!process.env.ADMIN_KEY || req.header('x-admin-key') !== process.env.ADMIN_KEY) {
    res.status(401).json({ error: 'Non autorisé.' })
    return
  }
  next()
}

/** Convertit un Timestamp Firestore Admin en ISO string (JSON-friendly), ou null. */
function serializeTs(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | null | undefined
  return t?.toDate ? t.toDate().toISOString() : null
}

function serializeMatch(m: BracketMatch) {
  return { ...m, deadline: serializeTs(m.deadline) }
}

function serializeTournament(t: Tournament) {
  return {
    ...t,
    createdAt: serializeTs(t.createdAt),
    registrationDeadline: serializeTs(t.registrationDeadline),
    startAt: serializeTs(t.startAt),
    finishAt: serializeTs(t.finishAt),
    bracket: (t.bracket ?? []).map((r: BracketRound) => ({ ...r, matches: r.matches.map(serializeMatch) })),
  }
}

// Tournoi de la semaine courante (404 si l'admin ne l'a pas encore créé).
app.get('/tournament/current', async (_req, res) => {
  try {
    const t = await getCurrentTournament()
    if (!t) return res.status(404).json({ error: 'no_tournament' })
    return res.json(serializeTournament(t))
  } catch (e) {
    console.error('[/tournament/current] erreur:', e)
    return res.status(500).json({ error: 'server_error' })
  }
})

// Inscription au tournoi de la semaine courante. uid dérivé du token Firebase
// (jamais du body — déviation volontaire du schéma { uid, username } suggéré :
// faire confiance à un uid fourni par le client permettrait de débiter
// l'entryFee de N'IMPORTE QUEL compte, même pattern que /gold/gift et
// /gold/transfer plus bas dans ce fichier).
app.post('/tournament/register', async (req, res) => {
  if (!firebaseReady()) return res.status(503).json({ error: 'firebase_unavailable' })
  const { fromToken, username } = (req.body ?? {}) as { fromToken?: string; username?: string }
  const uid = await uidFromToken(fromToken)
  if (!uid) return res.status(401).json({ error: 'unauthorized' })
  if (typeof username !== 'string' || !username.trim()) return res.status(400).json({ error: 'bad_params' })
  try {
    const t = await getCurrentTournament()
    if (!t) return res.status(404).json({ error: 'no_tournament' })
    await registerPlayer(t.weekId, uid, username.trim(), t.entryFee)
    return res.json({ ok: true })
  } catch (e) {
    console.error('[/tournament/register] erreur:', e)
    return res.status(400).json({ error: (e as Error).message })
  }
})

// Déclare le résultat d'un match (déclencheur : un des deux joueurs, identifié
// par son token — jamais winnerUid/loserUid bruts sans vérification). N'avance
// le bracket QUE quand les deux joueurs ont rapporté le MÊME vainqueur
// (reportMatchResult) — anti-triche demandé, implémenté via double-confirmation
// plutôt qu'un unique appel non vérifié à recordMatchWinner.
app.post('/tournament/report-win', async (req, res) => {
  if (!firebaseReady()) return res.status(503).json({ error: 'firebase_unavailable' })
  const { fromToken, matchId, winnerUid } = (req.body ?? {}) as {
    fromToken?: string; matchId?: string; winnerUid?: string
  }
  const reporterUid = await uidFromToken(fromToken)
  if (!reporterUid) return res.status(401).json({ error: 'unauthorized' })
  if (typeof matchId !== 'string' || typeof winnerUid !== 'string') {
    return res.status(400).json({ error: 'bad_params' })
  }
  try {
    const result = await reportMatchResult(matchId, reporterUid, winnerUid)
    return res.json({ ok: true, result })
  } catch (e) {
    console.error('[/tournament/report-win] erreur:', e)
    return res.status(400).json({ error: (e as Error).message })
  }
})

// Crée le tournoi de la semaine courante (admin uniquement, idempotent).
app.post('/tournament/admin/create', adminGuard, async (_req, res) => {
  try {
    const id = await createWeeklyTournament()
    return res.json({ ok: true, tournamentId: id })
  } catch (e) {
    console.error('[/tournament/admin/create] erreur:', e)
    return res.status(500).json({ error: (e as Error).message })
  }
})

// Génère le bracket du tournoi (admin uniquement).
app.post('/tournament/admin/generate-bracket', adminGuard, async (req, res) => {
  const { tournamentId } = (req.body ?? {}) as { tournamentId?: string }
  if (typeof tournamentId !== 'string') return res.status(400).json({ error: 'bad_params' })
  try {
    await generateBracket(tournamentId)
    return res.json({ ok: true })
  } catch (e) {
    console.error('[/tournament/admin/generate-bracket] erreur:', e)
    return res.status(400).json({ error: (e as Error).message })
  }
})

// Force le traitement des forfaits (deadlines dépassées) — admin uniquement.
app.post('/tournament/admin/check-forfaits', adminGuard, async (req, res) => {
  const { tournamentId } = (req.body ?? {}) as { tournamentId?: string }
  if (typeof tournamentId !== 'string') return res.status(400).json({ error: 'bad_params' })
  try {
    await checkForfaits(tournamentId)
    return res.json({ ok: true })
  } catch (e) {
    console.error('[/tournament/admin/check-forfaits] erreur:', e)
    return res.status(400).json({ error: (e as Error).message })
  }
})

// Distribue le prizePool au podium (admin uniquement).
app.post('/tournament/admin/distribute-prizes', adminGuard, async (req, res) => {
  const { tournamentId } = (req.body ?? {}) as { tournamentId?: string }
  if (typeof tournamentId !== 'string') return res.status(400).json({ error: 'bad_params' })
  try {
    await distributePrizes(tournamentId)
    return res.json({ ok: true })
  } catch (e) {
    console.error('[/tournament/admin/distribute-prizes] erreur:', e)
    return res.status(400).json({ error: (e as Error).message })
  }
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

import http from 'node:http'
import express from 'express'
import cors from 'cors'
import cron from 'node-cron'
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
  checkForfaits, distributePrizes, recordMatchWinner, getCurrentTournament,
  type Tournament, type BracketRound, type BracketMatch,
} from './db/tournamentQueries'
import { cleanupGlobalChat } from './db/globalChat'
import { cleanupExpiredChallenges } from './db/challengeQueries'
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

// Classement de la semaine courante pour une ligue, avec filtre géographique
// optionnel (pays et/ou ville — onglets Global/Maroc/France/Ma ville de
// LeaderboardScreen.tsx).
app.get('/leaderboard/weekly', async (req, res) => {
  const league = typeof req.query.league === 'string' ? req.query.league : 'Bronze'
  const country = typeof req.query.country === 'string' ? req.query.country : undefined
  const city = typeof req.query.city === 'string' ? req.query.city : undefined
  const result = await getWeeklyLeaderboard(league, { country, city })
  console.log('[leaderboard] GET /leaderboard/weekly:', { league, country, city, entries: result.length })
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
  const { username, amount, game, uid } = req.body as {
    username?: string; amount?: number; game?: string; uid?: string
  }
  if (!username || !amount || (game !== 'ronda' && game !== 'dijouj')) {
    return res.status(400).json({ error: 'Paramètres manquants' })
  }
  await addWageredGold(username, Number(amount), game, uid)
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

/** Lit un match de tournoi et vérifie que `uid` en est bien l'un des deux
 * joueurs — garde commune à forfeit-absent/forfeit-self, pour ne jamais
 * laisser un utilisateur authentifié déclencher un forfait sur un match
 * auquel il ne participe pas. */
async function loadMatchAsPlayer(
  matchId: string, uid: string,
): Promise<{ player1Uid: string; player2Uid: string; status: string } | null> {
  const snap = await adminDb().collection('tournament_matches').doc(matchId).get()
  if (!snap.exists) return null
  const m = snap.data() as { player1Uid: string; player2Uid: string; status: string }
  if (uid !== m.player1Uid && uid !== m.player2Uid) return null
  return m
}

// Le joueur PRÉSENT dans le lobby (room Colyseus rejointe, en attente depuis
// 10 min) déclare que son adversaire ne s'est jamais présenté → il gagne par
// forfait. uid dérivé du token (jamais du body brut comme le suggérait
// { matchId, presentUid } — n'importe qui aurait pu forcer une victoire sur
// le match de quelqu'un d'autre), et vérifié comme participant réel du match.
app.post('/tournament/forfeit-absent', async (req, res) => {
  if (!firebaseReady()) return res.status(503).json({ error: 'firebase_unavailable' })
  const { fromToken, matchId } = (req.body ?? {}) as { fromToken?: string; matchId?: string }
  const presentUid = await uidFromToken(fromToken)
  if (!presentUid) return res.status(401).json({ error: 'unauthorized' })
  if (typeof matchId !== 'string') return res.status(400).json({ error: 'bad_params' })
  try {
    const match = await loadMatchAsPlayer(matchId, presentUid)
    if (!match) return res.status(403).json({ error: 'not_a_player' })
    if (match.status === 'done' || match.status === 'forfeit') return res.json({ ok: true }) // déjà tranché
    await recordMatchWinner(matchId, presentUid, true)
    return res.json({ ok: true })
  } catch (e) {
    console.error('[/tournament/forfeit-absent] erreur:', e)
    return res.status(400).json({ error: (e as Error).message })
  }
})

// Le joueur présent renonce lui-même (bouton "Annuler et perdre le match") —
// l'AUTRE joueur du match est déclaré vainqueur. uid dérivé du token, comme
// forfeit-absent ; l'adversaire est déduit du match (le client n'a plus
// besoin de connaître son uid, contrairement à l'ancien système filterBy).
app.post('/tournament/forfeit-self', async (req, res) => {
  if (!firebaseReady()) return res.status(503).json({ error: 'firebase_unavailable' })
  const { fromToken, matchId } = (req.body ?? {}) as { fromToken?: string; matchId?: string }
  const selfUid = await uidFromToken(fromToken)
  if (!selfUid) return res.status(401).json({ error: 'unauthorized' })
  if (typeof matchId !== 'string') return res.status(400).json({ error: 'bad_params' })
  try {
    const match = await loadMatchAsPlayer(matchId, selfUid)
    if (!match) return res.status(403).json({ error: 'not_a_player' })
    if (match.status === 'done' || match.status === 'forfeit') return res.json({ ok: true })
    const opponentUid = selfUid === match.player1Uid ? match.player2Uid : match.player1Uid
    await recordMatchWinner(matchId, opponentUid, true)
    return res.json({ ok: true })
  } catch (e) {
    console.error('[/tournament/forfeit-self] erreur:', e)
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

// Supprime un tournoi (doc + tous ses matches) — admin uniquement. Outil de
// réinitialisation manuelle (ex. tournoi créé par erreur, bracket corrompu à
// régénérer de zéro) : ne vérifie volontairement pas le statut, l'admin est
// seul juge de l'opportunité de supprimer un tournoi 'running'/'finished'.
app.delete('/tournament/admin/reset', adminGuard, async (req, res) => {
  if (!firebaseReady()) return res.status(503).json({ error: 'firebase_unavailable' })
  const { tournamentId } = (req.body ?? {}) as { tournamentId?: string }
  if (typeof tournamentId !== 'string') return res.status(400).json({ error: 'bad_params' })
  try {
    const matches = await adminDb()
      .collection('tournament_matches')
      .where('tournamentId', '==', tournamentId)
      .get()
    const batch = adminDb().batch()
    matches.docs.forEach((d) => batch.delete(d.ref))
    batch.delete(adminDb().collection('tournaments').doc(tournamentId))
    await batch.commit()
    return res.json({ ok: true, deleted: matches.size + 1 })
  } catch (e) {
    console.error('[/tournament/admin/reset] erreur:', e)
    return res.status(500).json({ error: (e as Error).message })
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

// Défi entre amis reçu.
app.post('/notify/challenge', async (req, res) => {
  const { fromToken, toUid, stake } = (req.body ?? {}) as { fromToken?: string; toUid?: string; stake?: number }
  const fromUid = await uidFromToken(fromToken)
  if (!fromUid || typeof toUid !== 'string') return res.status(401).json({ error: 'unauthorized' })
  const fromName = await getUsername(fromUid)
  const stakeAmount = Math.max(0, Math.floor(Number(stake) || 0))
  void sendPushNotification(
    toUid, `⚔️ ${fromName} te défie !`, `Mise : ${stakeAmount} 🪙 — Accepte le défi !`, { type: 'challenge' },
  )
  return res.json({ ok: true })
})

// Défi accepté — notifie l'auteur du défi.
app.post('/notify/challenge-accepted', async (req, res) => {
  const { fromToken, toUid } = (req.body ?? {}) as { fromToken?: string; toUid?: string }
  const fromUid = await uidFromToken(fromToken)
  if (!fromUid || typeof toUid !== 'string') return res.status(401).json({ error: 'unauthorized' })
  const fromName = await getUsername(fromUid)
  void sendPushNotification(
    toUid, '⚔️ Défi accepté !', `${fromName} a accepté ton défi — rejoins la partie !`, { type: 'challenge_accepted' },
  )
  return res.json({ ok: true })
})

// ── Cron : cycle hebdomadaire du tournoi ────────────────────────────────────
// Suppose une seule instance du serveur (pas de coordinateur distribué) —
// avec plusieurs instances Railway, chaque réplique exécuterait ces tâches
// indépendamment. createWeeklyTournament() est déjà idempotent (par doc
// weekId), donc sans risque en double ; generateBracket()/distributePrizes()
// vérifient le statut avant d'agir mais ne sont pas protégées par une
// transaction couvrant toute leur durée — un doublon exact au même instant
// reste possible en théorie sur un déploiement multi-instances (pas le cas
// ici, mais à garder en tête si la config Railway change).

// Chaque lundi à 00:00 UTC → crée automatiquement le tournoi de la semaine.
cron.schedule('0 0 * * 1', async () => {
  console.log('[cron] Création automatique du tournoi hebdomadaire...')
  try {
    const id = await createWeeklyTournament()
    console.log('[cron] Tournoi créé:', id)
  } catch (e) {
    console.error('[cron] Erreur création tournoi:', e)
  }
})

// Chaque vendredi à 00:00 UTC → génère le bracket automatiquement.
cron.schedule('0 0 * * 5', async () => {
  console.log('[cron] Génération automatique du bracket...')
  try {
    const t = await getCurrentTournament()
    // 'registration' = complet avant même la deadline (dernier slot pris,
    // voir registerPlayer) — generateBracket() accepte déjà les deux statuts ;
    // se limiter à 'open' comme suggéré aurait laissé un tournoi complet tôt
    // bloqué sans bracket jusqu'à une action admin manuelle.
    if (t && (t.status === 'open' || t.status === 'registration')) {
      await generateBracket(t.weekId)
      console.log('[cron] Bracket généré pour:', t.weekId)
    }
  } catch (e) {
    console.error('[cron] Erreur génération bracket:', e)
  }
})

// Chaque dimanche à 23:00 UTC → distribue les prix automatiquement.
cron.schedule('0 23 * * 0', async () => {
  console.log('[cron] Distribution automatique des prix...')
  try {
    const t = await getCurrentTournament()
    if (t && t.status === 'finished') {
      await distributePrizes(t.weekId)
      console.log('[cron] Prix distribués pour:', t.weekId)
    }
  } catch (e) {
    console.error('[cron] Erreur distribution prix:', e)
  }
})

// Toutes les heures → vérifie les matches dont la fenêtre fixe (voir
// matchDeadline, tournamentQueries.ts) est dépassée sans vainqueur déclaré.
cron.schedule('0 * * * *', async () => {
  try {
    const t = await getCurrentTournament()
    if (t && t.status === 'running') {
      await checkForfaits(t.weekId)
    }
  } catch (e) {
    console.error('[cron] Erreur checkForfaits:', e)
  }
})

// Toutes les 10 minutes → purge le chat mondial au-delà des 200 derniers
// messages (voir globalChat.ts — nettoyage nécessairement côté serveur,
// la règle de suppression Firestore ne permettant à personne d'effacer les
// messages d'un autre auteur).
cron.schedule('*/10 * * * *', () => {
  void cleanupGlobalChat()
})

// Toutes les 30 minutes → supprime les défis 'pending' expirés (24h, voir
// challengeQueries.ts). Un défi accepté/décliné/terminé n'est jamais purgé
// ici, seul le statut 'pending' est concerné.
cron.schedule('*/30 * * * *', () => {
  void cleanupExpiredChallenges()
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

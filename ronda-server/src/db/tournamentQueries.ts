import { Timestamp } from 'firebase-admin/firestore'
import { adminDb, firebaseReady, getPublicProfile, FieldValue } from '../firebaseAdmin'
import { generateCode } from '../rooms/registry'
import { currentWeekStart } from './queries'
import { notifyBracketReady, notifyYourTurn, notifyChampion } from '../notifications'
import { ALL_BOTS, getBotAvatar, type BotIdentity } from '../botNames'

/** true si cet uid désigne un bot de repli (schéma bot_<prénom>, voir botNames.ts). */
function isBotUid(uid: string): boolean {
  return uid.startsWith('bot_')
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type TournamentStatus = 'open' | 'registration' | 'running' | 'finished'
export type MatchStatus = 'pending' | 'ready' | 'playing' | 'done' | 'forfeit'

export interface BracketMatch {
  matchId: string
  player1Uid: string | null
  player2Uid: string | null
  winnerUid: string | null
  roomCode: string | null
  deadline: Timestamp | null
  status: MatchStatus
}

export interface BracketRound {
  round: number
  matches: BracketMatch[]
}

export interface Tournament {
  weekId: string
  game: 'ronda'
  status: TournamentStatus
  entryFee: number
  prizePool: number
  maxPlayers: number
  participants: string[]
  participantNames: Record<string, string>
  participantAvatars: Record<string, { avatarType: string; avatarEmoji: string; avatarImage: string }>
  bracket: BracketRound[]
  champion: string | null
  createdAt: Timestamp
  registrationDeadline: Timestamp
  startAt: Timestamp
  finishAt: Timestamp
  /** true une fois distributePrizes() exécuté (idempotence). */
  prizesDistributed?: boolean
}

export interface TournamentMatch {
  tournamentId: string
  round: number
  player1Uid: string
  player2Uid: string
  player1Name: string
  player2Name: string
  winnerUid: string | null
  roomCode: string | null
  status: MatchStatus
  deadline: Timestamp
  createdAt: Timestamp
}

const MAX_PLAYERS = 16

/** Répartition du prizePool : champion, finaliste, 2× demi-finalistes. */
const PRIZE_SPLIT = { champion: 0.60, runnerUp: 0.25, semiFinalist: 0.075 }

/**
 * Fenêtres de match fixes du week-end (UTC), ancrées sur le lundi de la
 * semaine courante (currentWeekStart()) — remplace l'ancienne fenêtre
 * glissante de 24h "à partir de maintenant" par des horaires calendaires
 * identiques pour tous les matches d'un même tour :
 *   Round 1 (tous les tours SAUF les 2 derniers) : vendredi 20h → samedi 20h
 *   Round 2 (avant-dernier tour)                  : samedi 20h → dimanche 20h
 *   Finale (dernier tour)                          : dimanche 20h → 23h
 * `roundNumber`/`totalRounds` déterminent la fenêtre par DISTANCE À LA
 * FINALE plutôt qu'un round↔fenêtre fixe : un bracket à moins de 4 tours
 * (effectif réduit) saute simplement les fenêtres les plus anciennes plutôt
 * que de déborder sur une 4e fenêtre inexistante.
 */
function matchDeadline(totalRounds: number, roundNumber: number): Timestamp {
  const monday = new Date(`${currentWeekStart()}T00:00:00Z`)
  const at = (dayOffset: number, hour: number) => {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + dayOffset)
    d.setUTCHours(hour, 0, 0, 0)
    return d
  }
  const sat20 = at(5, 20) // samedi 20h UTC
  const sun20 = at(6, 20) // dimanche 20h UTC
  const sun23 = at(6, 23) // dimanche 23h UTC

  const distanceFromFinal = totalRounds - roundNumber // 0 = finale, 1 = avant-dernier tour, 2+ = round 1
  if (distanceFromFinal === 0) return Timestamp.fromDate(sun23)
  if (distanceFromFinal === 1) return Timestamp.fromDate(sun20)
  return Timestamp.fromDate(sat20)
}

function tournamentsCol() {
  return adminDb().collection('tournaments')
}
function matchesCol() {
  return adminDb().collection('tournament_matches')
}

/** Lundi (UTC, YYYY-MM-DD) → identifiant de semaine ISO 8601 (ex. '2026-W28'). */
function isoWeekId(mondayStr: string): string {
  const monday = new Date(`${mondayStr}T00:00:00Z`)
  const thursday = new Date(monday)
  thursday.setUTCDate(monday.getUTCDate() + 3) // jeudi de CETTE semaine (référence ISO)
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4))
  const firstDow = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDow + 3)
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000))
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** ID du tournoi de la semaine courante (sans lecture Firestore). */
export function currentTournamentId(): string {
  return isoWeekId(currentWeekStart())
}

/**
 * Crée le tournoi de la semaine courante (idempotent — renvoie l'id existant
 * si déjà créé). weekId (doc ID) au format ISO '2026-W28'.
 * registrationDeadline = jeudi 23:59:59, startAt = vendredi 00:00:00,
 * finishAt = dimanche 23:59:59 (UTC, semaine courante).
 */
export async function createWeeklyTournament(): Promise<string> {
  if (!firebaseReady()) throw new Error('firebase_unavailable')
  const monday = currentWeekStart()
  const weekId = isoWeekId(monday)
  const ref = tournamentsCol().doc(weekId)
  const snap = await ref.get()
  if (snap.exists) return weekId

  const mondayDate = new Date(`${monday}T00:00:00Z`)
  const thu = new Date(mondayDate); thu.setUTCDate(mondayDate.getUTCDate() + 3); thu.setUTCHours(23, 59, 59, 999)
  const fri = new Date(mondayDate); fri.setUTCDate(mondayDate.getUTCDate() + 4); fri.setUTCHours(0, 0, 0, 0)
  const sun = new Date(mondayDate); sun.setUTCDate(mondayDate.getUTCDate() + 6); sun.setUTCHours(23, 59, 59, 999)

  await ref.set({
    weekId, game: 'ronda', status: 'open',
    entryFee: 0, prizePool: 0, maxPlayers: MAX_PLAYERS,
    participants: [], participantNames: {}, participantAvatars: {},
    bracket: [], champion: null,
    createdAt: FieldValue.serverTimestamp(),
    registrationDeadline: Timestamp.fromDate(thu),
    startAt: Timestamp.fromDate(fri),
    finishAt: Timestamp.fromDate(sun),
  })
  return weekId
}

/**
 * Inscrit un joueur : vérifie le statut du tournoi, l'absence de doublon, le
 * solde d'or (si entryFee > 0), déduit l'entryFee et l'ajoute au prizePool.
 * Passe le tournoi en 'registration' quand le dernier slot vient d'être pris
 * (signal « complet, prêt pour le bracket » — distinct de 'open').
 */
export async function registerPlayer(
  tournamentId: string, uid: string, username: string, entryFee: number,
): Promise<void> {
  if (!firebaseReady()) throw new Error('firebase_unavailable')
  const profile = await getPublicProfile(uid)
  const tRef = tournamentsCol().doc(tournamentId)
  const userRef = adminDb().collection('users').doc(uid)

  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(tRef)
    if (!snap.exists) throw new Error('tournament_not_found')
    const data = snap.data() as Tournament
    if (data.status !== 'open') throw new Error('registration_closed')
    const participants = data.participants ?? []
    if (participants.includes(uid)) throw new Error('already_registered')
    const maxPlayers = data.maxPlayers ?? MAX_PLAYERS
    if (participants.length >= maxPlayers) throw new Error('tournament_full')

    if (entryFee > 0) {
      const userSnap = await tx.get(userRef)
      const gold = (userSnap.data()?.gold as number) ?? 0
      if (gold < entryFee) throw new Error('insufficient_gold')
      tx.set(userRef, { gold: gold - entryFee }, { merge: true })
    }

    const nextCount = participants.length + 1
    tx.set(tRef, {
      participants: [...participants, uid],
      [`participantNames.${uid}`]: username,
      [`participantAvatars.${uid}`]: {
        avatarType: profile.avatarType, avatarEmoji: profile.avatarEmoji, avatarImage: profile.avatarImage,
      },
      prizePool: FieldValue.increment(entryFee),
      ...(nextCount >= maxPlayers ? { status: 'registration' } : {}),
    }, { merge: true })
  })
}

/** Mélange Fisher-Yates (nouveau tableau, ne mute pas l'entrée). */
function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Prochaine puissance de 2 ≥ n, plafonnée à 16 (= maxPlayers par défaut,
 * voir registerPlayer). Un tournoi à 2 inscrits reste à 2 (pas de padding
 * inutile) — seul un effectif NON puissance de 2 est complété avec des bots. */
function nextPowerOf2(n: number): number {
  if (n <= 2) return 2
  if (n <= 4) return 4
  if (n <= 8) return 8
  return 16
}

/**
 * Crée le profil fantôme Firestore d'un bot ajouté au tournoi, s'il n'existe
 * pas déjà (idempotent — un bot déjà créé par le repli matchmaking client, ou
 * par un tournoi précédent, est réutilisé tel quel). Port Admin SDK de
 * getOrCreateBotProfile (client, botFallback.ts) : même structure de profil,
 * pour que le bot soit indiscernable d'un vrai joueur partout où son profil
 * peut être consulté (bracket, avatar, historique…).
 */
async function ensureBotProfile(bot: BotIdentity): Promise<void> {
  try {
    const ref = adminDb().collection('users').doc(bot.uid)
    const snap = await ref.get()
    if (snap.exists) return
    const gamesPlayed  = randInt(50, 250)
    const rondaPlayed  = Math.round(gamesPlayed * 0.5)
    const dijoujPlayed = gamesPlayed - rondaPlayed
    const winRate      = randInt(40, 70) / 100
    const rondaWon     = Math.round(rondaPlayed  * winRate)
    const dijoujWon    = Math.round(dijoujPlayed * winRate)
    await ref.set({
      username: bot.name, usernameLower: bot.name.toLowerCase(), isBot: true,
      level: randInt(3, 18), xp: 0, gold: randInt(500, 3000),
      gamesPlayed, gamesWon: rondaWon + dijoujWon, onlineGamesPlayed: 0,
      rondaPlayed, rondaWon, dijoujPlayed, dijoujWon,
      avatarType: 'image', avatarEmoji: '', avatarImage: getBotAvatar(bot.avatarIdx, bot.female),
      avatarFrame: 'none', statsPublic: true, goldHistoryPublic: false, friendCount: 0,
      createdAt: FieldValue.serverTimestamp(), lastSeen: FieldValue.serverTimestamp(),
    })
  } catch (e) {
    console.error('[tournament] ensureBotProfile:', e)
  }
}

/**
 * Résout immédiatement tout match 'ready' opposant deux bots : aucun des deux
 * ne rejoindra jamais une vraie Room pour "jouer" — sans ce court-circuit, un
 * tel match resterait bloqué jusqu'à la fenêtre fixe du tour (voir
 * matchDeadline) puis le prochain passage de checkForfaits. Cascade bornée au
 * nombre de tours max (16 joueurs → 4 tours) : résoudre un bot-vs-bot peut
 * faire apparaître un AUTRE bot-vs-bot au tour suivant.
 */
async function resolveBotVsBotMatches(tournamentId: string): Promise<void> {
  for (let iter = 0; iter < 4; iter++) {
    const snap = await matchesCol().where('tournamentId', '==', tournamentId).get()
    const botVsBot = snap.docs.filter((d) => {
      const m = d.data() as TournamentMatch
      return m.status === 'ready' && isBotUid(m.player1Uid) && isBotUid(m.player2Uid)
    })
    if (botVsBot.length === 0) return
    for (const doc of botVsBot) {
      const m = doc.data() as TournamentMatch
      const winnerUid = Math.random() < 0.5 ? m.player1Uid : m.player2Uid
      await recordMatchWinner(doc.id, winnerUid)
    }
  }
}

/**
 * Génère le bracket : complète d'abord avec des bots aléatoires jusqu'à la
 * prochaine puissance de 2 si l'effectif humain n'en est pas déjà une (jamais
 * bloqué en attente d'inscriptions supplémentaires), mélange les participants,
 * crée les matches du tour 1 (bye automatique si nombre impair malgré le
 * padding — cas limite avec 0 bot disponible), et la structure vide des tours
 * suivants. Propage les byes vers les tours suivants (cascade possible avec
 * plusieurs byes) puis active tout match devenu complet. Crée les docs
 * tournament_matches pour tous les matches immédiatement jouables (tour 1 ET
 * ceux activés par cascade de byes). Passe le tournoi en 'running'.
 */
export async function generateBracket(tournamentId: string): Promise<void> {
  if (!firebaseReady()) throw new Error('firebase_unavailable')
  const tRef = tournamentsCol().doc(tournamentId)
  const snap = await tRef.get()
  if (!snap.exists) throw new Error('tournament_not_found')
  const data = snap.data() as Tournament
  if (data.status !== 'open' && data.status !== 'registration') throw new Error('bracket_already_generated')

  const humanParticipants = data.participants ?? []
  const names: Record<string, string> = { ...(data.participantNames ?? {}) }
  const avatars: Record<string, { avatarType: string; avatarEmoji: string; avatarImage: string }> =
    { ...(data.participantAvatars ?? {}) }

  // Complète avec des bots aléatoires jusqu'à la prochaine puissance de 2 —
  // seulement si au moins 2 humains sont déjà inscrits (sinon même un seul
  // bot ne suffirait pas à constituer un vrai match, et 0 inscrit ne doit pas
  // se transformer en "tournoi 100% bots").
  const participants = [...humanParticipants]
  const addedBots: BotIdentity[] = []
  if (participants.length >= 2) {
    const targetSize = nextPowerOf2(participants.length)
    const availableBots = shuffle(ALL_BOTS.filter((b) => !participants.includes(b.uid)))
    while (participants.length < targetSize && availableBots.length > 0) {
      const bot = availableBots.pop()!
      await ensureBotProfile(bot)
      participants.push(bot.uid)
      names[bot.uid] = bot.name
      avatars[bot.uid] = { avatarType: 'image', avatarEmoji: '', avatarImage: getBotAvatar(bot.avatarIdx, bot.female) }
      addedBots.push(bot)
    }
  }
  // Minimum absolu : même complété de TOUS les bots disponibles (plus de 60
  // au total, jamais atteint en pratique), impossible de constituer un
  // bracket à au moins 2 joueurs → seul cas où l'erreur est encore renvoyée.
  if (participants.length < 2) throw new Error('not_enough_players')

  const shuffled = shuffle(participants)

  const round1: BracketMatch[] = []
  for (let i = 0; i < shuffled.length; i += 2) {
    const p1 = shuffled[i]
    const p2 = shuffled[i + 1] ?? null // bye si nombre impair de joueurs
    const matchId = `${tournamentId}_r1_${round1.length}`
    round1.push(
      p2 === null
        ? { matchId, player1Uid: p1, player2Uid: null, winnerUid: p1, roomCode: null, deadline: null, status: 'done' }
        : { matchId, player1Uid: p1, player2Uid: p2, winnerUid: null, roomCode: null, deadline: null, status: 'pending' },
    )
  }

  const totalRounds = Math.ceil(Math.log2(participants.length))
  const bracket: BracketRound[] = [{ round: 1, matches: round1 }]
  let prevCount = round1.length
  for (let r = 2; r <= totalRounds; r++) {
    const count = Math.ceil(prevCount / 2)
    const matches: BracketMatch[] = Array.from({ length: count }, (_, i) => ({
      matchId: `${tournamentId}_r${r}_${i}`,
      player1Uid: null, player2Uid: null, winnerUid: null,
      roomCode: null, deadline: null, status: 'pending' as MatchStatus,
    }))
    bracket.push({ round: r, matches })
    prevCount = count
  }

  // Propage les vainqueurs de bye vers le tour suivant (round par round, dans
  // l'ordre : une cascade de plusieurs byes se résout donc correctement).
  for (let r = 0; r < bracket.length - 1; r++) {
    for (let i = 0; i < bracket[r].matches.length; i++) {
      const m = bracket[r].matches[i]
      if (m.status !== 'done' || !m.winnerUid) continue
      const nextIdx = Math.floor(i / 2)
      const slot: 'player1Uid' | 'player2Uid' = i % 2 === 0 ? 'player1Uid' : 'player2Uid'
      bracket[r + 1].matches[nextIdx] = { ...bracket[r + 1].matches[nextIdx], [slot]: m.winnerUid }
    }
  }
  // Active tout match dont les deux joueurs sont maintenant connus (tour 1
  // normal, ou tour suivant complété par une cascade de byes).
  for (const round of bracket) {
    for (const m of round.matches) {
      if (m.status === 'pending' && m.player1Uid && m.player2Uid) {
        m.status = 'ready'
        m.roomCode = generateCode()
        m.deadline = matchDeadline(bracket.length, round.round)
      }
    }
  }

  const batch = adminDb().batch()
  batch.set(tRef, {
    bracket, status: 'running',
    // Le tournoi ne connaissait que les inscrits humains jusqu'ici — persiste
    // les bots ajoutés pour que /tournament/current les affiche comme des
    // participants à part entière (nom + avatar), pas seulement dans le bracket.
    ...(addedBots.length > 0 ? { participants, participantNames: names, participantAvatars: avatars } : {}),
  }, { merge: true })
  const readyMatches: BracketMatch[] = []
  for (const round of bracket) {
    for (const m of round.matches) {
      if (m.status !== 'ready') continue
      readyMatches.push(m)
      batch.set(matchesCol().doc(m.matchId), {
        tournamentId, round: round.round,
        player1Uid: m.player1Uid, player2Uid: m.player2Uid,
        player1Name: names[m.player1Uid!] ?? 'Joueur', player2Name: names[m.player2Uid!] ?? 'Joueur',
        winnerUid: null, roomCode: m.roomCode, status: 'ready', deadline: m.deadline,
        createdAt: FieldValue.serverTimestamp(),
      })
    }
  }
  await batch.commit()

  // Résout tout de suite les matches bot-vs-bot (voir resolveBotVsBotMatches)
  // AVANT de calculer les notifications ci-dessous : sans ça, on notifierait
  // "à toi de jouer" pour un match qui ne sera jamais réellement joué.
  if (addedBots.length > 0) await resolveBotVsBotMatches(tournamentId)

  // Notifications best-effort, APRÈS le commit (jamais dans la transaction/le
  // batch : un retry de transaction renverrait sinon plusieurs fois le même
  // push). Un participant qui a un bye immédiat (pas de match 'ready' à ce
  // tour) reçoit seulement notifyBracketReady, pas notifyYourTurn. Les bots
  // n'ont ni compte ni appareil : jamais notifiés, dans aucun des deux cas.
  void notifyBracketReady(humanParticipants).catch((e) => console.error('[tournament] notifyBracketReady:', e))
  for (const m of readyMatches) {
    if (!m.player1Uid || !m.player2Uid || !m.deadline) continue
    if (isBotUid(m.player1Uid) && isBotUid(m.player2Uid)) continue // déjà résolu ci-dessus
    const deadline = m.deadline.toDate()
    if (!isBotUid(m.player1Uid)) {
      void notifyYourTurn(m.player1Uid, names[m.player2Uid] ?? 'Joueur', deadline)
        .catch((e) => console.error('[tournament] notifyYourTurn:', e))
    }
    if (!isBotUid(m.player2Uid)) {
      void notifyYourTurn(m.player2Uid, names[m.player1Uid] ?? 'Joueur', deadline)
        .catch((e) => console.error('[tournament] notifyYourTurn:', e))
    }
  }
}

/** Trouve un match dans le bracket par matchId. Renvoie les indices [round, match] ou null. */
function findInBracket(bracket: BracketRound[], matchId: string): [number, number] | null {
  for (let r = 0; r < bracket.length; r++) {
    const i = bracket[r].matches.findIndex(m => m.matchId === matchId)
    if (i !== -1) return [r, i]
  }
  return null
}

/**
 * Marque un match comme gagné, avance le vainqueur au match correspondant du
 * tour suivant (le crée en 'ready' dès que ses deux joueurs sont connus), ou
 * désigne le champion si c'était la finale. `viaForfeit` marque le match
 * 'forfeit' plutôt que 'done' (compte-rendu différent côté client), sans
 * changer la logique d'avancement du bracket.
 */
export async function recordMatchWinner(
  matchId: string, winnerUid: string, viaForfeit = false,
): Promise<void> {
  if (!firebaseReady()) throw new Error('firebase_unavailable')
  const matchRef = matchesCol().doc(matchId)
  const matchSnap = await matchRef.get()
  if (!matchSnap.exists) throw new Error('match_not_found')
  const match = matchSnap.data() as TournamentMatch
  if (match.status === 'done' || match.status === 'forfeit') return // idempotent
  if (winnerUid !== match.player1Uid && winnerUid !== match.player2Uid) throw new Error('invalid_winner')

  const tournamentId = match.tournamentId
  const tRef = tournamentsCol().doc(tournamentId)

  const result = await adminDb().runTransaction(async (tx) => {
    const tSnap = await tx.get(tRef)
    if (!tSnap.exists) throw new Error('tournament_not_found')
    const tData = tSnap.data() as Tournament
    const bracket: BracketRound[] = tData.bracket ?? []

    const pos = findInBracket(bracket, matchId)
    if (!pos) throw new Error('bracket_match_not_found')
    const [roundIdx, matchIdx] = pos
    bracket[roundIdx].matches[matchIdx] = {
      ...bracket[roundIdx].matches[matchIdx], winnerUid, status: viaForfeit ? 'forfeit' : 'done',
    }

    const nextRoundIdx = roundIdx + 1
    let finished = false
    let readyNext: { player1Uid: string; player2Uid: string; deadline: Timestamp } | null = null

    if (nextRoundIdx < bracket.length) {
      const nextMatchIdx = Math.floor(matchIdx / 2)
      const slot: 'player1Uid' | 'player2Uid' = matchIdx % 2 === 0 ? 'player1Uid' : 'player2Uid'
      const next = { ...bracket[nextRoundIdx].matches[nextMatchIdx], [slot]: winnerUid }

      if (next.player1Uid && next.player2Uid) {
        next.status = 'ready'
        next.roomCode = generateCode()
        next.deadline = matchDeadline(bracket.length, bracket[nextRoundIdx].round)
        tx.set(matchesCol().doc(next.matchId), {
          tournamentId, round: bracket[nextRoundIdx].round,
          player1Uid: next.player1Uid, player2Uid: next.player2Uid,
          player1Name: tData.participantNames?.[next.player1Uid] ?? 'Joueur',
          player2Name: tData.participantNames?.[next.player2Uid] ?? 'Joueur',
          winnerUid: null, roomCode: next.roomCode, status: 'ready', deadline: next.deadline,
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true })
        readyNext = { player1Uid: next.player1Uid, player2Uid: next.player2Uid, deadline: next.deadline }
      }
      bracket[nextRoundIdx].matches[nextMatchIdx] = next
    } else {
      finished = true
    }

    tx.set(matchRef, { winnerUid, status: viaForfeit ? 'forfeit' : 'done' }, { merge: true })
    tx.set(tRef, {
      bracket,
      ...(finished ? { champion: winnerUid, status: 'finished' } : {}),
    }, { merge: true })

    return { readyNext, participantNames: tData.participantNames ?? {} }
  })

  // Le prochain match peut être bot-vs-bot (ex. deux forfaits d'humains
  // absents dans des branches différentes du bracket) — résolu tout de suite,
  // sinon bloqué jusqu'à la fenêtre fixe du tour puis checkForfaits.
  if (result.readyNext && isBotUid(result.readyNext.player1Uid) && isBotUid(result.readyNext.player2Uid)) {
    await resolveBotVsBotMatches(tournamentId)
  } else if (result.readyNext) {
    // Notification best-effort, APRÈS le commit de la transaction — jamais À
    // L'INTÉRIEUR : un retry de transaction (contention) renverrait sinon le
    // même push plusieurs fois. Pas explicitement demandé pour les tours 2+
    // (seul generateBracket → round 1 l'est), mais l'omettre laisserait les
    // joueurs sans notification à partir des quarts de finale. Un bot n'a ni
    // compte ni appareil : jamais notifié.
    const { player1Uid, player2Uid, deadline } = result.readyNext
    const names = result.participantNames
    const d = deadline.toDate()
    if (!isBotUid(player1Uid)) {
      void notifyYourTurn(player1Uid, names[player2Uid] ?? 'Joueur', d)
        .catch((e) => console.error('[tournament] notifyYourTurn:', e))
    }
    if (!isBotUid(player2Uid)) {
      void notifyYourTurn(player2Uid, names[player1Uid] ?? 'Joueur', d)
        .catch((e) => console.error('[tournament] notifyYourTurn:', e))
    }
  }
}


/**
 * Vérifie les matches 'ready' dont le deadline est dépassé sans vainqueur
 * déclaré : aucun signal de présence par match n'existe à ce stade (v1) pour
 * départager objectivement qui a fait forfait entre deux HUMAINS → tirage au
 * sort. Si un seul des deux est un bot, l'humain gagne automatiquement (un
 * bot ne peut jamais "se présenter" pour jouer, ce n'est donc jamais lui qui
 * a fait défaut).
 */
export async function checkForfaits(tournamentId: string): Promise<void> {
  if (!firebaseReady()) throw new Error('firebase_unavailable')
  const now = Date.now()
  // Un seul where() d'égalité (tournamentId) + filtrage du statut côté code :
  // combiner un where('status', 'in', […]) avec where('tournamentId', '==', …)
  // nécessiterait un index composite Firestore à créer manuellement (même
  // convention que getWeeklyLeaderboard dans queries.ts, qui l'évite pareil).
  const snap = await matchesCol().where('tournamentId', '==', tournamentId).get()

  for (const doc of snap.docs) {
    const m = doc.data() as TournamentMatch
    if (m.status !== 'ready' && m.status !== 'playing') continue
    const deadlineMs = m.deadline?.toMillis?.() ?? 0
    if (!deadlineMs || deadlineMs > now) continue
    const p1Bot = isBotUid(m.player1Uid)
    const p2Bot = isBotUid(m.player2Uid)
    const winnerUid = p1Bot === p2Bot
      ? (Math.random() < 0.5 ? m.player1Uid : m.player2Uid) // deux humains OU deux bots → tirage au sort
      : (p1Bot ? m.player2Uid : m.player1Uid) // un seul bot → l'humain gagne
    await recordMatchWinner(doc.id, winnerUid, true)
  }
}

/**
 * Distribue le prizePool : champion 60%, finaliste 25%, les deux
 * demi-finalistes 7.5% chacun. Idempotent (prizesDistributed). Le champion
 * reçoit aussi le badge 'champion' dans users/{uid}.trophies[].
 *
 * Un bot (padding automatique du bracket, voir generateBracket) n'a pas de
 * vrai compte : add() l'exclut de rewards, donc il ne reçoit ni or ni
 * trophée — sa part n'est pas redistribuée, elle reste simplement non
 * attribuée (choix délibéré, plus simple qu'une redistribution proportionnelle
 * au meilleur humain restant).
 */
export async function distributePrizes(tournamentId: string): Promise<void> {
  if (!firebaseReady()) throw new Error('firebase_unavailable')
  const tRef = tournamentsCol().doc(tournamentId)
  const snap = await tRef.get()
  if (!snap.exists) throw new Error('tournament_not_found')
  const data = snap.data() as Tournament
  if (data.prizesDistributed) return
  if (data.status !== 'finished' || !data.champion) throw new Error('tournament_not_finished')

  const prizePool = data.prizePool ?? 0
  const bracket = data.bracket ?? []
  const champion = data.champion

  const finalRound = bracket[bracket.length - 1]
  const finalMatch = finalRound?.matches?.[0]
  const runnerUp = finalMatch
    ? (finalMatch.winnerUid === finalMatch.player1Uid ? finalMatch.player2Uid : finalMatch.player1Uid)
    : null

  const semiRound = bracket[bracket.length - 2]
  const semiFinalists = (semiRound?.matches ?? [])
    .map(m => (m.winnerUid === m.player1Uid ? m.player2Uid : m.player1Uid))
    .filter((uid): uid is string => !!uid)

  const rewards = new Map<string, number>()
  const add = (uid: string | null, share: number) => {
    if (!uid || prizePool <= 0 || isBotUid(uid)) return
    const amount = Math.round(prizePool * share)
    if (amount > 0) rewards.set(uid, (rewards.get(uid) ?? 0) + amount)
  }
  add(champion, PRIZE_SPLIT.champion)
  add(runnerUp, PRIZE_SPLIT.runnerUp)
  for (const uid of semiFinalists.slice(0, 2)) add(uid, PRIZE_SPLIT.semiFinalist)

  // 'Champion Semaine 28' plutôt qu'un tag générique 'champion' : un joueur
  // qui remporte plusieurs tournois doit pouvoir les distinguer dans son
  // profil (users/{uid}.trophies[] est un tableau, arrayUnion ne déduplique
  // que des chaînes strictement identiques — un tag générique aurait
  // silencieusement fusionné plusieurs victoires en une seule entrée).
  const trophyLabel = `Champion Semaine ${tournamentId.split('-W')[1] ?? tournamentId}`

  const batch = adminDb().batch()
  for (const [uid, amount] of rewards) {
    const patch: Record<string, unknown> = { gold: FieldValue.increment(amount) }
    if (uid === champion) patch.trophies = FieldValue.arrayUnion(trophyLabel)
    batch.set(adminDb().collection('users').doc(uid), patch, { merge: true })
  }
  batch.set(tRef, { prizesDistributed: true }, { merge: true })
  await batch.commit()

  if (!isBotUid(champion)) {
    const championReward = rewards.get(champion) ?? 0
    void notifyChampion(champion, championReward).catch((e) => console.error('[tournament] notifyChampion:', e))
  }
}

/** Tournoi de la semaine courante, ou null s'il n'a pas encore été créé. */
export async function getCurrentTournament(): Promise<Tournament | null> {
  if (!firebaseReady()) return null
  const id = currentTournamentId()
  const snap = await tournamentsCol().doc(id).get()
  if (!snap.exists) return null
  return { ...(snap.data() as Tournament), weekId: id }
}

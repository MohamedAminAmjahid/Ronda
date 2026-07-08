import { getDbOrNull } from './database'
import { adminDb, firebaseReady, FieldValue } from '../firebaseAdmin'

export interface GameRecord {
  id: string
  player1_pseudo: string
  player2_pseudo: string
  winner_pseudo: string | null
  duration_seconds: number
}

export interface StatRecord {
  pseudo: string
  games_played: number
  games_won: number
  last_seen: string
}

// Toutes les requêtes sont des no-op si la persistance est désactivée
// (better-sqlite3 absent). Le jeu reste pleinement jouable.

/** Enregistre une partie terminée et met à jour les stats des deux joueurs. */
export function recordGame(g: GameRecord): void {
  const db = getDbOrNull()
  if (!db) return

  const insertGame = db.prepare(`
    INSERT INTO games (id, player1_pseudo, player2_pseudo, winner_pseudo, duration_seconds)
    VALUES (@id, @player1_pseudo, @player2_pseudo, @winner_pseudo, @duration_seconds)
  `)
  const upsertStat = db.prepare(`
    INSERT INTO stats (pseudo, games_played, games_won, last_seen)
    VALUES (@pseudo, 1, @won, datetime('now'))
    ON CONFLICT(pseudo) DO UPDATE SET
      games_played = games_played + 1,
      games_won    = games_won + @won,
      last_seen    = datetime('now')
  `)

  const tx = db.transaction((rec: GameRecord) => {
    insertGame.run(rec)
    upsertStat.run({ pseudo: rec.player1_pseudo, won: rec.winner_pseudo === rec.player1_pseudo ? 1 : 0 })
    upsertStat.run({ pseudo: rec.player2_pseudo, won: rec.winner_pseudo === rec.player2_pseudo ? 1 : 0 })
  })
  tx(g)
}

/** Met à jour last_seen (crée la ligne si absente) à la connexion. */
export function touchPlayer(pseudo: string): void {
  const db = getDbOrNull()
  if (!db) return
  db.prepare(`
    INSERT INTO stats (pseudo, games_played, games_won, last_seen)
    VALUES (@pseudo, 0, 0, datetime('now'))
    ON CONFLICT(pseudo) DO UPDATE SET last_seen = datetime('now')
  `).run({ pseudo })
}

/** Stats d'un joueur (null si jamais vu ou persistance désactivée). */
export function getStats(pseudo: string): StatRecord | null {
  const db = getDbOrNull()
  if (!db) return null
  return (db.prepare('SELECT * FROM stats WHERE pseudo = ?').get(pseudo) as StatRecord) ?? null
}

/** Classement par victoires (vide si persistance désactivée). */
export function getLeaderboard(limit = 20): StatRecord[] {
  const db = getDbOrNull()
  if (!db) return []
  return db.prepare('SELECT * FROM stats ORDER BY games_won DESC, games_played DESC LIMIT ?').all(limit) as StatRecord[]
}

/** Dernières parties (vide si persistance désactivée). */
export function getRecentGames(limit = 20): GameRecord[] {
  const db = getDbOrNull()
  if (!db) return []
  return db.prepare('SELECT * FROM games ORDER BY created_at DESC LIMIT ?').all(limit) as GameRecord[]
}

// ── Ligues & classement hebdomadaire ───────────────────────────────────────────

/** Ligues par ordre croissant (Bronze le plus bas, Légende le plus haut). */
export const LEAGUES = ['Bronze', 'Argent', 'Or', 'Platine', 'Diamond', 'Master', 'Légende'] as const
export type League = (typeof LEAGUES)[number]

/** Récompenses du top 3 d'une ligue à chaque reset hebdomadaire. */
const TOP_REWARDS = [500, 300, 150]
const PROMOTE_COUNT = 3
const DEMOTE_COUNT = 3

export interface WeeklyScoreRecord {
  username: string
  week_start: string
  game: string
  gold_wagered: number
  league: string
}

export interface WeeklyEntry {
  username:    string
  week_start:  string
  totalGold:   number
  rondaGold:   number
  dijoujGold:  number
  league:      string
}

export interface WeeklyStats {
  rondaGold:  number
  dijoujGold: number
  totalGold:  number
}

export interface WeeklyReward {
  username: string
  goldReward: number
}

/** Lundi 00:00 UTC de la semaine contenant `d`, au format YYYY-MM-DD. */
function mondayUTC(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = date.getUTCDay() // 0 = dimanche … 6 = samedi
  const shift = day === 0 ? -6 : 1 - day // ramène au lundi
  date.setUTCDate(date.getUTCDate() + shift)
  return date.toISOString().slice(0, 10)
}

/** Lundi (UTC) de la semaine courante. */
export function currentWeekStart(): string {
  return mondayUTC(new Date())
}

function promote(league: string): string {
  const i = LEAGUES.indexOf(league as League)
  if (i < 0) return 'Bronze'
  return LEAGUES[Math.min(i + 1, LEAGUES.length - 1)]
}

function demote(league: string): string {
  const i = LEAGUES.indexOf(league as League)
  if (i < 0) return 'Bronze'
  return LEAGUES[Math.max(i - 1, 0)]
}

/** Ligue courante d'un joueur (Bronze par défaut / persistance désactivée). */
export function getUserLeague(username: string): League {
  const db = getDbOrNull()
  if (!db) return 'Bronze'
  const row = db.prepare('SELECT current_league FROM league_history WHERE username = ?').get(username) as
    | { current_league: string }
    | undefined
  const league = row?.current_league
  return (LEAGUES as readonly string[]).includes(league ?? '') ? (league as League) : 'Bronze'
}

/**
 * Incrémente l'or misé d'un joueur pour la semaine courante, dans Firestore
 * (SQLite sur Railway n'a pas de volume persistant → table vidée à chaque
 * restart, voir historique). Un doc par (semaine, joueur, jeu) — pas un seul
 * doc par (semaine, joueur) : sinon un doc partagé entre ronda et dijouj
 * perdrait la répartition par jeu (un des deux champs `game`/`gold` écraserait
 * l'autre), qui alimente rondaGold/dijoujGold affichés dans le classement.
 * league reste lu depuis SQLite (league_history, inchangé).
 */
export async function addWageredGold(
  username: string, amount: number, game: 'ronda' | 'dijouj' = 'ronda',
): Promise<void> {
  const week = currentWeekStart()
  // Log très visible en tête de fonction — tire à CHAQUE appel, avant tout
  // check, pour distinguer "jamais appelée" de "appelée mais no-op".
  console.log('🏆 [leaderboard] addWageredGold APPELÉ:', { username, amount, game, week })
  if (!firebaseReady()) {
    // Firestore Admin non initialisé (credentials absents) → no-op silencieux
    // sans ce log, ce qui ressemble exactement à "le classement ne se met
    // jamais à jour".
    console.log('[leaderboard] addWageredGold: SKIP (Firestore Admin non initialisé)', { username, amount, game })
    return
  }
  if (amount <= 0) return
  const league = getUserLeague(username)
  console.log('[leaderboard] addWageredGold:', { username, week, game, amount, league })
  const docId = `${week}_${username}_${game}`
  try {
    // set({merge:true}) + increment() en un seul appel atomique — crée le doc
    // s'il n'existe pas encore, sinon incrémente `gold` sans écraser le reste.
    await adminDb().collection('weekly_scores').doc(docId).set({
      username, week, game, league,
      updatedAt: FieldValue.serverTimestamp(),
      gold: FieldValue.increment(amount),
    }, { merge: true })
  } catch (e) {
    console.error('[leaderboard] addWageredGold Firestore error:', e)
  }
}

interface WeeklyScoreDoc { username: string; week: string; game: string; gold?: number; league: string }

/**
 * Classement hebdomadaire agrégé (Ronda + Di Jouj) pour une ligue, depuis
 * Firestore.
 *
 * On NE filtre PAS la requête Firestore sur le champ `league` du doc : ce
 * champ est figé au moment du pari (addWageredGold ne le met à jour qu'à
 * l'écriture), donc si league_history.current_league change en cours de
 * semaine (reset hebdo après que des joueurs ont déjà parié), un joueur
 * promu/rétrogradé deviendrait invisible du classement de sa ligue ACTUELLE.
 * C'est le même bug que l'ancienne requête SQL corrigeait déjà via un JOIN
 * sur league_history — on reproduit la même correction ici : on récupère tous
 * les docs de la semaine, on agrège par joueur, puis on filtre sur la ligue
 * COURANTE (getUserLeague, toujours en SQLite).
 */
export async function getWeeklyLeaderboard(league: string): Promise<WeeklyEntry[]> {
  if (!firebaseReady()) return []
  const week = currentWeekStart()
  const snap = await adminDb().collection('weekly_scores').where('week', '==', week).get()

  const totals = new Map<string, { rondaGold: number; dijoujGold: number }>()
  for (const doc of snap.docs) {
    const d = doc.data() as WeeklyScoreDoc
    const acc = totals.get(d.username) ?? { rondaGold: 0, dijoujGold: 0 }
    if (d.game === 'ronda') acc.rondaGold += d.gold ?? 0
    else if (d.game === 'dijouj') acc.dijoujGold += d.gold ?? 0
    totals.set(d.username, acc)
  }

  const entries: WeeklyEntry[] = []
  for (const [username, g] of totals) {
    if (getUserLeague(username) !== league) continue
    entries.push({
      username, week_start: week,
      totalGold: g.rondaGold + g.dijoujGold,
      rondaGold: g.rondaGold, dijoujGold: g.dijoujGold,
      league,
    })
  }
  entries.sort((a, b) => b.totalGold - a.totalGold || a.username.localeCompare(b.username))
  return entries.slice(0, 50)
}

/** Détail par jeu pour un joueur cette semaine. */
export async function getWeeklyStats(username: string): Promise<WeeklyStats> {
  if (!firebaseReady()) return { rondaGold: 0, dijoujGold: 0, totalGold: 0 }
  const week = currentWeekStart()
  const snap = await adminDb().collection('weekly_scores')
    .where('username', '==', username).where('week', '==', week).get()
  let rondaGold = 0
  let dijoujGold = 0
  for (const doc of snap.docs) {
    const d = doc.data() as WeeklyScoreDoc
    if (d.game === 'ronda') rondaGold += d.gold ?? 0
    else if (d.game === 'dijouj') dijoujGold += d.gold ?? 0
  }
  return { rondaGold, dijoujGold, totalGold: rondaGold + dijoujGold }
}

/**
 * Contenu brut de weekly_scores (diagnostic — voir GET /debug/weekly-scores,
 * protégé par x-admin-key), depuis Firestore. `db: false` distingue
 * explicitement "Firestore Admin non initialisé" de "collection vide".
 */
export async function debugWeeklyScores(): Promise<{ db: boolean; rows: WeeklyScoreRecord[] }> {
  if (!firebaseReady()) return { db: false, rows: [] }
  const snap = await adminDb().collection('weekly_scores').orderBy('week', 'desc').limit(500).get()
  const rows: WeeklyScoreRecord[] = snap.docs.map((doc) => {
    const d = doc.data() as WeeklyScoreDoc
    return { username: d.username, week_start: d.week, game: d.game, gold_wagered: d.gold ?? 0, league: d.league }
  })
  return { db: true, rows }
}

/**
 * Reset hebdomadaire : pour la dernière semaine ayant de l'activité, promeut le
 * top 3 et rétrograde le bottom 3 de chaque ligue (Bronze ne descend pas,
 * Légende ne monte pas), met à jour `league_history` (SQLite, inchangé), et
 * retourne les récompenses d'or à créditer au top 3 de chaque ligue.
 *
 * Standings lus depuis Firestore (weekly_scores) — league_history reste en
 * SQLite comme demandé. Ici on groupe volontairement par le champ `league` du
 * DOC (figé au moment du pari), pas la ligue courante : le reset évalue
 * chaque joueur dans la division où il a effectivement joué cette semaine —
 * comportement identique à l'ancienne requête SQL (WHERE league = ?).
 */
export async function processWeeklyReset(): Promise<WeeklyReward[]> {
  if (!firebaseReady()) return []
  const db = getDbOrNull()
  if (!db) return []

  const latestSnap = await adminDb().collection('weekly_scores').orderBy('week', 'desc').limit(1).get()
  if (latestSnap.empty) return []
  const week = (latestSnap.docs[0].data() as WeeklyScoreDoc).week

  // Lectures Firestore d'abord (en parallèle), écriture SQLite ensuite dans
  // une seule transaction — pas d'await entre les lignes de la transaction.
  const perLeagueStandings = await Promise.all(LEAGUES.map(async (league) => {
    const snap = await adminDb().collection('weekly_scores')
      .where('week', '==', week).where('league', '==', league).get()
    const totals = new Map<string, number>()
    for (const doc of snap.docs) {
      const d = doc.data() as WeeklyScoreDoc
      totals.set(d.username, (totals.get(d.username) ?? 0) + (d.gold ?? 0))
    }
    const standings = [...totals.entries()]
      .map(([username, gold_wagered]) => ({ username, gold_wagered }))
      .sort((a, b) => b.gold_wagered - a.gold_wagered || a.username.localeCompare(b.username))
    return { league, standings }
  }))

  const rewards: WeeklyReward[] = []
  const resetDate = currentWeekStart()

  const upsertHistory = db.prepare(`
    INSERT INTO league_history (username, current_league, last_week_rank, last_reset)
    VALUES (@username, @league, @rank, @reset)
    ON CONFLICT(username) DO UPDATE SET
      current_league = @league,
      last_week_rank = @rank,
      last_reset     = @reset
  `)

  const apply = db.transaction(() => {
    for (const { league, standings } of perLeagueStandings) {
      const n = standings.length
      standings.forEach((row, idx) => {
        const rank = idx + 1
        let newLeague: string = league

        if (idx < PROMOTE_COUNT) {
          newLeague = promote(league)
          rewards.push({ username: row.username, goldReward: TOP_REWARDS[idx] ?? 0 })
        } else if (idx >= n - DEMOTE_COUNT) {
          newLeague = demote(league)
        }

        upsertHistory.run({ username: row.username, league: newLeague, rank, reset: resetDate })
      })
    }
  })
  apply()

  return rewards
}

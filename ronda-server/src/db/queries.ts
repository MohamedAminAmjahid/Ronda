import { getDbOrNull } from './database'

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
  gold_wagered: number
  league: string
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
 * Incrémente l'or misé d'un joueur pour la semaine courante (crée la ligne si
 * absente, avec la ligue courante du joueur). No-op si persistance désactivée.
 */
export function addWageredGold(username: string, amount: number): void {
  const db = getDbOrNull()
  if (!db || amount <= 0) return
  const week = currentWeekStart()
  const league = getUserLeague(username)
  db.prepare(`
    INSERT INTO weekly_scores (username, week_start, gold_wagered, league)
    VALUES (@username, @week, @amount, @league)
    ON CONFLICT(username, week_start) DO UPDATE SET
      gold_wagered = gold_wagered + @amount
  `).run({ username, week, amount, league })
}

/** Classement de la semaine courante pour une ligue, trié par or misé décroissant. */
export function getWeeklyLeaderboard(league: string): WeeklyScoreRecord[] {
  const db = getDbOrNull()
  if (!db) return []
  const week = currentWeekStart()
  return db.prepare(`
    SELECT username, week_start, gold_wagered, league
    FROM weekly_scores
    WHERE week_start = ? AND league = ?
    ORDER BY gold_wagered DESC, username ASC
  `).all(week, league) as WeeklyScoreRecord[]
}

/**
 * Reset hebdomadaire : pour la dernière semaine ayant de l'activité, promeut le
 * top 3 et rétrograde le bottom 3 de chaque ligue (Bronze ne descend pas,
 * Légende ne monte pas), met à jour `league_history`, et retourne les
 * récompenses d'or à créditer au top 3 de chaque ligue.
 */
export function processWeeklyReset(): WeeklyReward[] {
  const db = getDbOrNull()
  if (!db) return []

  const latest = db.prepare('SELECT MAX(week_start) AS w FROM weekly_scores').get() as { w: string | null }
  const week = latest?.w
  if (!week) return []

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
    for (const league of LEAGUES) {
      const standings = db.prepare(`
        SELECT username, gold_wagered FROM weekly_scores
        WHERE week_start = ? AND league = ?
        ORDER BY gold_wagered DESC, username ASC
      `).all(week, league) as { username: string; gold_wagered: number }[]

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

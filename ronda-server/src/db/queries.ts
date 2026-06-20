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

import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

// Typage minimal de better-sqlite3 (chargé paresseusement). On évite l'import
// statique pour que le serveur démarre même si le module natif n'est pas
// compilé localement (ex. Windows sans Visual Studio). En production (Railway,
// Linux) le module s'installe normalement et la persistance s'active.
export interface SqliteStatement {
  run(...params: unknown[]): unknown
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown
}
export interface SqliteDb {
  pragma(source: string): unknown
  exec(source: string): unknown
  prepare(source: string): SqliteStatement
  transaction<T extends (...args: never[]) => unknown>(fn: T): T
}

let db: SqliteDb | null = null
let attempted = false

/**
 * Initialise SQLite si better-sqlite3 est disponible. Sinon, le serveur tourne
 * sans persistance (les requêtes deviennent des no-op). Idempotent.
 */
export function initDatabase(path = process.env.DATABASE_PATH ?? './data/ronda.db'): SqliteDb | null {
  if (attempted) return db
  attempted = true

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3') as new (p: string) => SqliteDb
    mkdirSync(dirname(path), { recursive: true })
    db = new Database(path)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    migrate(db)
    console.log(`[db] SQLite prêt (${path})`)
  } catch (e) {
    console.warn(
      `[db] better-sqlite3 indisponible — persistance désactivée (${(e as Error).message})`,
    )
    db = null
  }
  return db
}

/** Instance SQLite courante, ou null si la persistance est désactivée. */
export function getDbOrNull(): SqliteDb | null {
  return db
}

function migrate(database: SqliteDb): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id              TEXT PRIMARY KEY,
      player1_pseudo  TEXT NOT NULL,
      player2_pseudo  TEXT NOT NULL,
      winner_pseudo   TEXT,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stats (
      pseudo        TEXT PRIMARY KEY,
      games_played  INTEGER NOT NULL DEFAULT 0,
      games_won     INTEGER NOT NULL DEFAULT 0,
      last_seen     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_games_created_at ON games (created_at);

    CREATE TABLE IF NOT EXISTS weekly_scores (
      username     TEXT NOT NULL,
      week_start   TEXT NOT NULL, -- ISO date du lundi (ex. 2026-06-23)
      gold_wagered INTEGER NOT NULL DEFAULT 0,
      league       TEXT NOT NULL DEFAULT 'Bronze',
      PRIMARY KEY (username, week_start)
    );

    CREATE TABLE IF NOT EXISTS league_history (
      username       TEXT PRIMARY KEY,
      current_league TEXT NOT NULL DEFAULT 'Bronze',
      last_week_rank INTEGER,
      last_reset     TEXT -- date du dernier reset traité
    );

    CREATE INDEX IF NOT EXISTS idx_weekly_week_league ON weekly_scores (week_start, league);
  `)
}

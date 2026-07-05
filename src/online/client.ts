import { Client, Room } from 'colyseus.js'

// URL du serveur Colyseus. En dev : ws://localhost:2567.
// En prod : définir EXPO_PUBLIC_SERVER_URL (wss://…railway.app) dans .env.local.
const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'ws://localhost:2567'

let client: Client | null = null

/** Singleton Colyseus (créé à la 1re utilisation). */
export function getClient(): Client {
  if (!client) client = new Client(SERVER_URL)
  return client
}

/** Base HTTP dérivée de l'URL WS (ws→http, wss→https) pour les routes REST. */
export function httpBase(): string {
  return SERVER_URL.replace(/^ws/, 'http')
}

/** Partie rapide : rejoint la 1re room publique en attente, ou en crée une. */
export function joinOrCreate(pseudo: string, bet = 0): Promise<Room> {
  return getClient().joinOrCreate('ronda', { pseudo, bet })
}

/** Crée une partie privée (code partagé). */
export function createPrivate(pseudo: string): Promise<Room> {
  return getClient().create('ronda', { pseudo, private: true })
}

/** Rejoint par code : résout code→roomId via HTTP puis joinById (tout type de room). */
export async function joinByCode(pseudo: string, code: string, uid?: string): Promise<Room> {
  const res = await fetch(`${httpBase()}/room/${encodeURIComponent(code.trim().toUpperCase())}`)
  if (!res.ok) throw new Error('Code de partie introuvable.')
  const { roomId } = (await res.json()) as { roomId: string }
  return getClient().joinById(roomId, { pseudo, uid })
}

/** Crée un lobby 2v2 (l'hôte reçoit un code à partager). */
export function createLobby2v2(pseudo: string): Promise<Room> {
  return getClient().create('ronda2v2', { pseudo })
}

/** Partie rapide Di Jouj (matchmaking public). */
export function joinDiJoujQuick(pseudo: string, bet = 0, uid?: string): Promise<Room> {
  return getClient().joinOrCreate('dijouj', { pseudo, bet, uid })
}

/** Partie privée Di Jouj (code à partager). */
export function createDiJoujPrivate(pseudo: string, uid?: string): Promise<Room> {
  return getClient().create('dijouj', { pseudo, private: true, uid })
}

/** Crée un lobby Di Jouj (l'hôte choisit 2 ou 4 joueurs, code à partager). */
export function createDiJoujLobby(pseudo: string): Promise<Room> {
  return getClient().create('dijouj-lobby', { pseudo })
}

export interface WeeklyEntry {
  username:   string
  week_start: string
  totalGold:  number
  rondaGold:  number
  dijoujGold: number
  league:     string
}

export interface WeeklyStats {
  rondaGold:  number
  dijoujGold: number
  totalGold:  number
}

/** Classement hebdomadaire agrégé (Ronda + Di Jouj) d'une ligue. */
export async function fetchWeeklyLeaderboard(league: string): Promise<WeeklyEntry[]> {
  const res = await fetch(`${httpBase()}/leaderboard/weekly?league=${encodeURIComponent(league)}`)
  if (!res.ok) throw new Error('Classement indisponible.')
  return (await res.json()) as WeeklyEntry[]
}

/** Détail par jeu pour un joueur cette semaine. */
export async function fetchWeeklyStats(username: string): Promise<WeeklyStats> {
  const res = await fetch(`${httpBase()}/leaderboard/weekly/stats/${encodeURIComponent(username)}`)
  if (!res.ok) return { rondaGold: 0, dijoujGold: 0, totalGold: 0 }
  return (await res.json()) as WeeklyStats
}

/** Ligue courante d'un joueur. */
export async function fetchUserLeague(username: string): Promise<string> {
  const res = await fetch(`${httpBase()}/league/${encodeURIComponent(username)}`)
  if (!res.ok) throw new Error('Ligue indisponible.')
  const { league } = (await res.json()) as { league: string }
  return league
}

export type RoomType = 'ronda' | 'ronda2v2' | 'dijouj' | 'dijouj-lobby'

/** Détecte le type de room associé à un code (pour router 1v1 vs lobby 2v2). */
export async function roomTypeByCode(
  code: string,
): Promise<{ type: RoomType; roomId: string }> {
  const res = await fetch(
    `${httpBase()}/room/${encodeURIComponent(code.trim().toUpperCase())}/type`,
  )
  if (!res.ok) throw new Error('Code de partie introuvable.')
  return (await res.json()) as { type: RoomType; roomId: string }
}

import { Client, Room } from 'colyseus.js'
import { getAuth } from 'firebase/auth'
import { firebaseApp } from '../firebase/config'

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

/**
 * Rejoint (ou crée) la room d'un match de tournoi : les deux joueurs appellent
 * joinOrCreate avec le MÊME tournamentMatchId, et RondaRoom.filterBy(['tournamentMatchId'])
 * côté serveur les apparie automatiquement dans la même room — pas de code à
 * échanger, contrairement à une partie entre amis classique. Le roomCode
 * stocké dans le bracket (tournamentQueries.ts) est purement cosmétique et
 * n'est jamais utilisé pour ce join.
 */
export function joinTournamentMatch(pseudo: string, matchId: string, uid?: string): Promise<Room> {
  return getClient().joinOrCreate('ronda', { pseudo, uid, tournamentMatchId: matchId })
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

const LEADERBOARD_TIMEOUT_MS = 5000

/** Classement hebdomadaire agrégé (Ronda + Di Jouj) d'une ligue.
 * Abandonne après 5 s (Railway qui met du temps à se réveiller à froid, etc.)
 * plutôt que de laisser l'écran tourner indéfiniment. */
export async function fetchWeeklyLeaderboard(league: string): Promise<WeeklyEntry[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LEADERBOARD_TIMEOUT_MS)
  try {
    const res = await fetch(
      `${httpBase()}/leaderboard/weekly?league=${encodeURIComponent(league)}`,
      { signal: controller.signal },
    )
    if (!res.ok) throw new Error('Classement indisponible.')
    return (await res.json()) as WeeklyEntry[]
  } finally {
    clearTimeout(timeout)
  }
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

/** Ligue courante d'un joueur — variante best-effort (repli 'Bronze', ne lève jamais). */
export async function fetchUserLeagueByUsername(username: string): Promise<string> {
  try {
    const res = await fetch(`${httpBase()}/league/${encodeURIComponent(username)}`)
    const data = (await res.json()) as { league?: string }
    return data.league ?? 'Bronze'
  } catch {
    return 'Bronze'
  }
}

/**
 * Enregistre une mise gagnée au classement hebdomadaire. À utiliser pour les
 * parties vs bot (repli matchmaking, hors-ligne) : elles ne passent par aucune
 * Room Colyseus, donc addWageredGold n'est jamais appelé côté serveur sans cet
 * appel explicite. Best-effort — ne bloque jamais l'écran de fin de partie.
 */
export async function recordLeaderboardScore(
  username: string, amount: number, game: 'ronda' | 'dijouj',
): Promise<void> {
  console.log('📊 [leaderboard] recordLeaderboardScore appelé:', { username, amount, game })
  try {
    const res = await fetch(`${httpBase()}/leaderboard/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, amount, game }),
    })
    console.log('📊 [leaderboard] réponse:', res.status, await res.text())
  } catch (e) {
    console.error('[client] recordLeaderboardScore:', e)
  }
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

// ── Tournois hebdomadaires ────────────────────────────────────────────────────

/**
 * Clé AsyncStorage partagée entre online/store.ts (écrit quand un match de
 * tournoi se termine en victoire, juste après reportMatchWin) et
 * TournamentScreen.tsx (lu au focus pour afficher la modale « tu avances/tu
 * es champion », puis effacé). Vit ici plutôt que dans store.ts pour que
 * TournamentScreen.tsx (qui importe déjà ce fichier) n'ait pas besoin
 * d'importer online/store.ts juste pour cette constante.
 */
export const TOURNAMENT_ADVANCE_KEY = 'ronda_tournament_advance_pending'

export interface TournamentAdvancePending {
  matchId: string
  isFinal: boolean
  goldWon: number
}

export type TournamentStatus = 'open' | 'registration' | 'running' | 'finished'
export type MatchStatus = 'pending' | 'ready' | 'playing' | 'done' | 'forfeit'

export interface BracketMatch {
  matchId: string
  player1Uid: string | null
  player2Uid: string | null
  winnerUid: string | null
  roomCode: string | null
  /** ISO string (sérialisé par le serveur), ou null. */
  deadline: string | null
  status: MatchStatus
}

export interface BracketRound {
  round: number
  matches: BracketMatch[]
}

export interface TournamentAvatar {
  avatarType: string
  avatarEmoji: string
  avatarImage: string
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
  participantAvatars: Record<string, TournamentAvatar>
  bracket: BracketRound[]
  champion: string | null
  createdAt: string | null
  registrationDeadline: string | null
  startAt: string | null
  finishAt: string | null
}

/** Token d'identité Firebase de l'utilisateur courant, ou null si déconnecté.
 * Dupliqué (volontairement) depuis online/serverApi.ts : serverApi.ts importe
 * déjà httpBase() depuis CE fichier — importer idToken() en sens inverse
 * créerait un import circulaire entre les deux modules. */
async function idToken(): Promise<string | null> {
  const u = getAuth(firebaseApp).currentUser
  if (!u) return null
  try { return await u.getIdToken() } catch { return null }
}

/** Tournoi de la semaine courante, ou null si l'admin ne l'a pas encore créé. */
export async function fetchCurrentTournament(): Promise<Tournament | null> {
  const res = await fetch(`${httpBase()}/tournament/current`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Tournoi indisponible.')
  return (await res.json()) as Tournament
}

/**
 * Inscrit l'utilisateur courant au tournoi de la semaine. `uid` n'est pas
 * envoyé au serveur (qui le dérive lui-même d'un token Firebase vérifié —
 * voir ronda-server/src/index.ts) ; gardé dans la signature pour matcher
 * l'API demandée, mais un uid client non authentifié ne serait jamais fiable
 * pour débiter un entryFee.
 */
export async function registerForTournament(_uid: string, username: string): Promise<void> {
  const fromToken = await idToken()
  if (!fromToken) throw new Error('unauthorized')
  const res = await fetch(`${httpBase()}/tournament/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromToken, username }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'registration_failed')
  }
}

/**
 * Déclare le vainqueur d'un match de tournoi tel que vu par l'utilisateur
 * courant (double-confirmation côté serveur : n'avance le bracket que quand
 * les DEUX joueurs rapportent le même vainqueur). `loserUid` n'est pas
 * envoyé — le serveur déduit l'autre joueur depuis le match lui-même —
 * gardé dans la signature pour matcher l'API demandée.
 */
export async function reportMatchWin(matchId: string, winnerUid: string, _loserUid: string): Promise<void> {
  const fromToken = await idToken()
  if (!fromToken) throw new Error('unauthorized')
  const res = await fetch(`${httpBase()}/tournament/report-win`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromToken, matchId, winnerUid }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'report_failed')
  }
}

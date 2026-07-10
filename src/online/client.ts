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

/** Rejoint une partie en cours en tant que SPECTATEUR (lecture seule). Résout le
 * code via /room/:code (même endpoint que joinByCode) puis joinById avec le flag
 * spectate → RondaRoom.onJoin place le client comme spectateur (aucun siège). */
export async function spectateByCode(code: string, pseudo = 'Spectateur'): Promise<Room> {
  const res = await fetch(`${httpBase()}/room/${encodeURIComponent(code.trim().toUpperCase())}`)
  if (!res.ok) throw new Error('Partie introuvable.')
  const { roomId } = (await res.json()) as { roomId: string }
  return getClient().joinById(roomId, { pseudo, spectate: true })
}

/**
 * Rejoint la room d'un match de tournoi par son roomCode (assigné par
 * generateBracket, tournamentQueries.ts). `asCreator` (déterministe : le
 * player1Uid du match crée toujours, voir TournamentScreen.tsx handlePlay)
 * réclame directement ce code précis + le tournamentMatchId (RondaRoom.onCreate,
 * options.code) ; l'autre joueur rejoint dessus, avec quelques tentatives
 * espacées le temps que le créateur ouvre son écran, avant de créer lui-même
 * en dernier recours (ex. si le créateur n'ouvre jamais l'écran). Sans ce
 * rôle assigné à l'avance, les deux clients pourraient échouer leur
 * joinByCode EN MÊME TEMPS (room pas encore créée par l'autre) et créer
 * chacun leur propre room sous le même code — un pur essai symétrique
 * "join, sinon create" est donc insuffisant ici, contrairement à un lien
 * d'invitation classique (où un seul côté crée jamais en pratique).
 */
export async function joinTournamentRoom(
  pseudo: string, code: string, matchId: string, asCreator: boolean, uid?: string,
): Promise<Room> {
  if (asCreator) {
    return getClient().create('ronda', { pseudo, uid, private: true, code, tournamentMatchId: matchId })
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await joinByCode(pseudo, code, uid)
    } catch {
      if (attempt < 4) await new Promise((r) => setTimeout(r, 1000))
    }
  }
  // Dernier recours : le créateur désigné n'a jamais ouvert son écran.
  return getClient().create('ronda', { pseudo, uid, private: true, code, tournamentMatchId: matchId })
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

/** Filtre géographique optionnel du classement (onglets Global/Maroc/France/Ma
 * ville de LeaderboardScreen.tsx) — composé avec le filtre de ligue existant. */
export interface GeoFilter {
  country?: string
  city?: string
}

/** Classement hebdomadaire agrégé (Ronda + Di Jouj) d'une ligue, avec filtre
 * géographique optionnel. Abandonne après 5 s (Railway qui met du temps à se
 * réveiller à froid, etc.) plutôt que de laisser l'écran tourner indéfiniment. */
export async function fetchWeeklyLeaderboard(league: string, geo?: GeoFilter): Promise<WeeklyEntry[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LEADERBOARD_TIMEOUT_MS)
  try {
    const params = new URLSearchParams({ league })
    if (geo?.country) params.set('country', geo.country)
    if (geo?.city) params.set('city', geo.city)
    const res = await fetch(
      `${httpBase()}/leaderboard/weekly?${params.toString()}`,
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
  username: string, amount: number, game: 'ronda' | 'dijouj', uid?: string,
): Promise<void> {
  console.log('📊 [leaderboard] recordLeaderboardScore appelé:', { username, amount, game, uid })
  try {
    const res = await fetch(`${httpBase()}/leaderboard/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, amount, game, uid }),
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
 * Clé AsyncStorage partagée entre online/store.ts (écrit dès qu'un match de
 * tournoi se termine en victoire — le serveur a déjà tranché via
 * RondaRoom.finishGame → recordMatchWinner, le client n'a plus qu'à
 * l'afficher) et TournamentScreen.tsx (lu au focus pour la modale « tu
 * avances/tu es champion », puis effacé). Vit ici plutôt que dans store.ts
 * pour que TournamentScreen.tsx (qui importe déjà ce fichier) n'ait pas
 * besoin d'importer online/store.ts juste pour cette constante.
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
 * Le joueur présent dans le lobby (room rejointe, 10 min d'attente écoulées
 * sans que l'adversaire n'apparaisse) déclare forfait de l'absent — il gagne
 * le match. uid dérivé du token côté serveur (jamais envoyé ici).
 */
export async function forfeitAbsent(matchId: string): Promise<void> {
  const fromToken = await idToken()
  if (!fromToken) throw new Error('unauthorized')
  const res = await fetch(`${httpBase()}/tournament/forfeit-absent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromToken, matchId }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'forfeit_failed')
  }
}

/**
 * Le joueur présent renonce lui-même au match ("Annuler et perdre le
 * match") — l'adversaire est déclaré vainqueur (déduit du match côté
 * serveur, jamais transmis par le client).
 */
export async function forfeitSelf(matchId: string): Promise<void> {
  const fromToken = await idToken()
  if (!fromToken) throw new Error('unauthorized')
  const res = await fetch(`${httpBase()}/tournament/forfeit-self`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromToken, matchId }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'forfeit_failed')
  }
}

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
export function joinOrCreate(pseudo: string): Promise<Room> {
  return getClient().joinOrCreate('ronda', { pseudo })
}

/** Crée une partie privée (code partagé). */
export function createPrivate(pseudo: string): Promise<Room> {
  return getClient().create('ronda', { pseudo, private: true })
}

/** Rejoint par code : résout code→roomId via HTTP puis joinById (tout type de room). */
export async function joinByCode(pseudo: string, code: string): Promise<Room> {
  const res = await fetch(`${httpBase()}/room/${encodeURIComponent(code.trim().toUpperCase())}`)
  if (!res.ok) throw new Error('Code de partie introuvable.')
  const { roomId } = (await res.json()) as { roomId: string }
  return getClient().joinById(roomId, { pseudo })
}

/** Crée un lobby 2v2 (l'hôte reçoit un code à partager). */
export function createLobby2v2(pseudo: string): Promise<Room> {
  return getClient().create('ronda2v2', { pseudo })
}

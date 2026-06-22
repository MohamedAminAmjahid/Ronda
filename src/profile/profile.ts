import AsyncStorage from '@react-native-async-storage/async-storage'

// Store singleton du profil joueur, persisté via AsyncStorage.
// - username : généré une seule fois au premier lancement (Joueur#XXXX), puis persisté.
// - gold : monnaie du jeu, démarre à 200.
// Le store est pur côté UI : on s'abonne via subscribeProfile et on lit getProfile().

const STORAGE_KEY = 'ronda_profile'
const ACTIVE_ROOM_KEY = 'ronda_active_room'
const STARTING_GOLD = 200
const MAX_USERNAME = 16

export interface Profile {
  username: string
  gold: number
}

/** Partie en ligne en cours, persistée pour permettre la reconnexion. */
export interface ActiveRoom {
  roomId: string
  roomType: 'ronda' | 'ronda2v2'
  code: string
  /** Jeton Colyseus (room.reconnectionToken) requis par client.reconnect(). */
  reconnectionToken: string
}

type Listener = (profile: Profile) => void

let profile: Profile = { username: '', gold: STARTING_GOLD }
let loaded = false
let loadingPromise: Promise<Profile> | null = null
const listeners = new Set<Listener>()

/** username aléatoire « Joueur#XXXX » (4 chiffres). */
function randomUsername(): string {
  const n = Math.floor(1000 + Math.random() * 9000) // 1000–9999
  return `Joueur#${n}`
}

function emit(): void {
  for (const cb of listeners) cb(profile)
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // stockage indisponible — on garde l'état en mémoire
  }
}

/**
 * Charge le profil depuis AsyncStorage (idempotent). Au premier lancement,
 * génère un username aléatoire et persiste le profil de départ.
 */
export function loadProfile(): Promise<Profile> {
  if (loaded) return Promise.resolve(profile)
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Profile>
        profile = {
          username: parsed.username?.slice(0, MAX_USERNAME) || randomUsername(),
          gold: typeof parsed.gold === 'number' ? parsed.gold : STARTING_GOLD,
        }
      } else {
        profile = { username: randomUsername(), gold: STARTING_GOLD }
      }
    } catch {
      profile = { username: randomUsername(), gold: STARTING_GOLD }
    }
    loaded = true
    await persist()
    emit()
    return profile
  })()

  return loadingPromise
}

/** Profil courant (synchrone). Avant loadProfile(), username peut être vide. */
export function getProfile(): Profile {
  return profile
}

export function setUsername(name: string): void {
  const clean = name.trim().slice(0, MAX_USERNAME)
  if (clean.length === 0 || clean === profile.username) return
  profile = { ...profile, username: clean }
  void persist()
  emit()
}

export function addGold(amount: number): void {
  if (amount === 0) return
  profile = { ...profile, gold: Math.max(0, profile.gold + amount) }
  void persist()
  emit()
}

export function removeGold(amount: number): void {
  if (amount === 0) return
  profile = { ...profile, gold: Math.max(0, profile.gold - amount) }
  void persist()
  emit()
}

/** Abonnement aux changements de profil. Retourne la fonction de désabonnement. */
export function subscribeProfile(cb: Listener): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

// ── Partie en cours (reconnexion) ──────────────────────────────────────────────

let activeRoom: ActiveRoom | null = null
let activeRoomLoaded = false

function sameRoom(a: ActiveRoom | null, b: ActiveRoom | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.roomId === b.roomId &&
    a.roomType === b.roomType &&
    a.code === b.code &&
    a.reconnectionToken === b.reconnectionToken
  )
}

/** Charge la partie en cours persistée (idempotent). */
export async function loadActiveRoom(): Promise<ActiveRoom | null> {
  if (activeRoomLoaded) return activeRoom
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_ROOM_KEY)
    activeRoom = raw ? (JSON.parse(raw) as ActiveRoom) : null
  } catch {
    activeRoom = null
  }
  activeRoomLoaded = true
  return activeRoom
}

export function getActiveRoom(): ActiveRoom | null {
  return activeRoom
}

/** Mémorise la partie en cours (au démarrage d'une partie). No-op si inchangé. */
export function setActiveRoom(room: ActiveRoom): void {
  activeRoomLoaded = true
  if (sameRoom(activeRoom, room)) return
  activeRoom = room
  void AsyncStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify(room)).catch(() => {})
}

/** Efface la partie en cours (fin normale ou départ volontaire). */
export function clearActiveRoom(): void {
  activeRoomLoaded = true
  if (activeRoom === null) return
  activeRoom = null
  void AsyncStorage.removeItem(ACTIVE_ROOM_KEY).catch(() => {})
}

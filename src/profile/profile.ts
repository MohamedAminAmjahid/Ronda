import AsyncStorage from '@react-native-async-storage/async-storage'
import { getAuth } from 'firebase/auth'
import { firebaseApp } from '../firebase/config'
import {
  updateGold as firestoreUpdateGold,
  updateUsernameChanges as firestoreUpdateUsernameChanges,
} from '../firebase/firestore'

// Store singleton du profil joueur, persisté via AsyncStorage.
// - username : généré une seule fois au premier lancement (Joueur#XXXX), puis persisté.
// - gold : monnaie du jeu, démarre à 200.
// Le store est pur côté UI : on s'abonne via subscribeProfile et on lit getProfile().

const STORAGE_KEY = 'ronda_profile'
const ACTIVE_ROOM_KEY = 'ronda_active_room'
const STARTING_GOLD = 200
const MAX_USERNAME = 16
/** Or gagné en remportant une partie (solo ou en ligne). */
export const WIN_REWARD = 20
/** Coût en or d'un changement de pseudo (après le premier, gratuit). */
export const USERNAME_CHANGE_COST = 200

export interface Profile {
  username: string
  gold: number
  gamesPlayed: number
  gamesWon: number
  usernameChanges: number
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

let profile: Profile = {
  username: '',
  gold: STARTING_GOLD,
  gamesPlayed: 0,
  gamesWon: 0,
  usernameChanges: 0,
}
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
          gamesPlayed: typeof parsed.gamesPlayed === 'number' ? parsed.gamesPlayed : 0,
          gamesWon: typeof parsed.gamesWon === 'number' ? parsed.gamesWon : 0,
          usernameChanges: typeof parsed.usernameChanges === 'number' ? parsed.usernameChanges : 0,
        }
      } else {
        profile = {
          username: randomUsername(),
          gold: STARTING_GOLD,
          gamesPlayed: 0,
          gamesWon: 0,
          usernameChanges: 0,
        }
      }
    } catch {
      profile = {
        username: randomUsername(),
        gold: STARTING_GOLD,
        gamesPlayed: 0,
        gamesWon: 0,
        usernameChanges: 0,
      }
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

// ── Helpers de sync Firestore ──────────────────────────────────────────────────

function syncGoldToFirestore(gold: number): void {
  const uid = getAuth(firebaseApp).currentUser?.uid
  if (!uid) return
  void firestoreUpdateGold(uid, gold).catch(() => {})
}

function syncUsernameChangesToFirestore(count: number): void {
  const uid = getAuth(firebaseApp).currentUser?.uid
  if (!uid) return
  void firestoreUpdateUsernameChanges(uid, count).catch(() => {})
}

// ── Mutations ──────────────────────────────────────────────────────────────────

export function setUsername(name: string): void {
  const clean = name.trim().slice(0, MAX_USERNAME)
  if (clean.length === 0 || clean === profile.username) return
  profile = { ...profile, username: clean }
  void persist()
  emit()
}

/** Synchronise le gold depuis Firebase (login sur nouvel appareil). Local uniquement. */
export function setGold(amount: number): void {
  if (amount === profile.gold) return
  profile = { ...profile, gold: amount }
  void persist()
  emit()
}

export function addGold(amount: number): void {
  if (amount === 0) return
  profile = { ...profile, gold: Math.max(0, profile.gold + amount) }
  void persist()
  syncGoldToFirestore(profile.gold)
  emit()
}

export function removeGold(amount: number): void {
  if (amount === 0) return
  profile = { ...profile, gold: Math.max(0, profile.gold - amount) }
  void persist()
  syncGoldToFirestore(profile.gold)
  emit()
}

/** Synchronise usernameChanges depuis Firebase (login sur nouvel appareil). Local uniquement. */
export function setUsernameChanges(count: number): void {
  if (count === profile.usernameChanges) return
  profile = { ...profile, usernameChanges: count }
  void persist()
  emit()
}

/** Incrémente le compteur de changements de pseudo et synchronise avec Firestore. */
export function incrementUsernameChanges(): void {
  profile = { ...profile, usernameChanges: profile.usernameChanges + 1 }
  void persist()
  syncUsernameChangesToFirestore(profile.usernameChanges)
  emit()
}

/**
 * Enregistre le résultat d'une partie terminée : incrémente le compteur de parties,
 * et (si gagnée) le compteur de victoires + crédite WIN_REWARD d'or.
 * Retourne l'or gagné (0 si défaite) pour l'affichage sur l'écran de fin.
 */
export function recordResult(won: boolean): number {
  const reward = won ? WIN_REWARD : 0
  profile = {
    ...profile,
    gamesPlayed: profile.gamesPlayed + 1,
    gamesWon: profile.gamesWon + (won ? 1 : 0),
    gold: profile.gold + reward,
  }
  void persist()
  emit()
  return reward
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

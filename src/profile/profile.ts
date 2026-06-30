import AsyncStorage from '@react-native-async-storage/async-storage'
import { getAuth } from 'firebase/auth'
import { firebaseApp } from '../firebase/config'
import {
  updateGold as firestoreUpdateGold,
  updateUsernameChanges as firestoreUpdateUsernameChanges,
  updateAvatar as firestoreUpdateAvatar,
  giftGold as firestoreGiftGold,
  updateStats as firestoreUpdateStats,
  updateGoldHistoryPublic as firestoreUpdateGoldHistoryPublic,
  logGoldTransaction,
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
/** Plafond quotidien de gold transférable à d'autres joueurs (gratuit). */
export const DAILY_TRANSFER_LIMIT = 200

/** Date du jour au format YYYY-MM-DD (suffisant pour un quota quotidien). */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export interface Profile {
  username: string
  gold: number
  gamesPlayed: number
  gamesWon: number
  usernameChanges: number
  rondaPlayed: number
  rondaWon:    number
  dijoujPlayed: number
  dijoujWon:   number
  avatarType:  'initial' | 'emoji' | 'image'
  avatarEmoji: string
  avatarImage: string
  /** Gold envoyé à d'autres joueurs aujourd'hui (remis à 0 chaque jour). */
  dailyTransferSent: number
  /** Jour (YYYY-MM-DD) associé à dailyTransferSent. */
  dailyTransferDate: string
  /** Historique des cadeaux/transferts visible publiquement (true par défaut). */
  goldHistoryPublic: boolean
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
  rondaPlayed: 0,
  rondaWon:    0,
  dijoujPlayed: 0,
  dijoujWon:   0,
  avatarType:  'initial',
  avatarEmoji: '',
  avatarImage: '',
  dailyTransferSent: 0,
  dailyTransferDate: '',
  goldHistoryPublic: true,
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
          username:       parsed.username?.slice(0, MAX_USERNAME) || randomUsername(),
          gold:           typeof parsed.gold === 'number' ? parsed.gold : STARTING_GOLD,
          gamesPlayed:    typeof parsed.gamesPlayed === 'number' ? parsed.gamesPlayed : 0,
          gamesWon:       typeof parsed.gamesWon === 'number' ? parsed.gamesWon : 0,
          usernameChanges: typeof parsed.usernameChanges === 'number' ? parsed.usernameChanges : 0,
          rondaPlayed:    typeof parsed.rondaPlayed === 'number' ? parsed.rondaPlayed : 0,
          rondaWon:       typeof parsed.rondaWon === 'number' ? parsed.rondaWon : 0,
          dijoujPlayed:   typeof parsed.dijoujPlayed === 'number' ? parsed.dijoujPlayed : 0,
          dijoujWon:      typeof parsed.dijoujWon === 'number' ? parsed.dijoujWon : 0,
          avatarType:     (parsed.avatarType === 'emoji' || parsed.avatarType === 'image') ? parsed.avatarType : 'initial',
          avatarEmoji:    typeof parsed.avatarEmoji === 'string' ? parsed.avatarEmoji : '',
          avatarImage:    typeof parsed.avatarImage === 'string' ? parsed.avatarImage : '',
          // Quota de transfert : remis à 0 si la date sauvegardée n'est pas aujourd'hui.
          dailyTransferSent: (typeof parsed.dailyTransferSent === 'number' && parsed.dailyTransferDate === todayStr())
            ? parsed.dailyTransferSent : 0,
          dailyTransferDate: parsed.dailyTransferDate === todayStr() ? parsed.dailyTransferDate : todayStr(),
          goldHistoryPublic: typeof parsed.goldHistoryPublic === 'boolean' ? parsed.goldHistoryPublic : true,
        }
      } else {
        profile = {
          username: randomUsername(),
          gold: STARTING_GOLD,
          gamesPlayed: 0, gamesWon: 0, usernameChanges: 0,
          rondaPlayed: 0, rondaWon: 0, dijoujPlayed: 0, dijoujWon: 0,
          avatarType: 'initial', avatarEmoji: '', avatarImage: '',
          dailyTransferSent: 0, dailyTransferDate: todayStr(),
          goldHistoryPublic: true,
        }
      }
    } catch {
      profile = {
        username: randomUsername(),
        gold: STARTING_GOLD,
        gamesPlayed: 0, gamesWon: 0, usernameChanges: 0,
        rondaPlayed: 0, rondaWon: 0, dijoujPlayed: 0, dijoujWon: 0,
        avatarType: 'initial', avatarEmoji: '', avatarImage: '',
        dailyTransferSent: 0, dailyTransferDate: todayStr(),
        goldHistoryPublic: true,
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

function syncAvatarToFirestore(type: string, emoji: string, image: string): void {
  const uid = getAuth(firebaseApp).currentUser?.uid
  if (!uid) return
  void firestoreUpdateAvatar(uid, type, emoji, image).catch(() => {})
}

function syncStatsToFirestore(): void {
  const uid = getAuth(firebaseApp).currentUser?.uid
  if (!uid) return
  void firestoreUpdateStats(uid, {
    gamesPlayed:  profile.gamesPlayed,
    gamesWon:     profile.gamesWon,
    rondaPlayed:  profile.rondaPlayed,
    rondaWon:     profile.rondaWon,
    dijoujPlayed: profile.dijoujPlayed,
    dijoujWon:    profile.dijoujWon,
  }).catch(() => {})
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

// ── Transfert de gold entre joueurs (gratuit, plafonné par jour) ────────────────

/** Gold déjà envoyé aujourd'hui (0 si le compteur date d'un autre jour). */
export function getDailyTransferSent(): number {
  return profile.dailyTransferDate === todayStr() ? profile.dailyTransferSent : 0
}

/** Gold encore transférable aujourd'hui (0…DAILY_TRANSFER_LIMIT). */
export function getTransferRemaining(): number {
  return Math.max(0, DAILY_TRANSFER_LIMIT - getDailyTransferSent())
}

export type TransferResult =
  | { ok: true }
  | { ok: false; reason: 'amount' | 'balance' | 'quota' | 'error'; remaining: number }

/** Journalise une transaction de gold dans goldHistory (best-effort). */
function logTransaction(toUid: string, toName: string, amount: number, type: 'gift' | 'transfer'): void {
  const uid = getAuth(firebaseApp).currentUser?.uid
  if (!uid) return
  void logGoldTransaction(uid, profile.username, toUid, toName, amount, type).catch(() => {})
}

/**
 * Transfère `amount` gold vers un autre joueur (gratuit) :
 * vérifie le quota quotidien et le solde, crédite le destinataire côté Firestore,
 * déduit l'émetteur (local + sync) puis met à jour le compteur quotidien.
 */
export async function transferGold(toUid: string, amount: number, toName = ''): Promise<TransferResult> {
  const remaining = getTransferRemaining()
  if (amount <= 0)            return { ok: false, reason: 'amount',  remaining }
  if (amount > profile.gold)  return { ok: false, reason: 'balance', remaining }
  if (amount > remaining)     return { ok: false, reason: 'quota',   remaining }

  try {
    // Crédite le destinataire (incrément atomique). Si l'opération échoue,
    // l'émetteur n'est pas débité.
    await firestoreGiftGold(toUid, amount)
  } catch (e) {
    console.error('[transferGold] échec du crédit destinataire:', e)
    return { ok: false, reason: 'error', remaining }
  }

  // Déduit l'émetteur (sync Firestore via removeGold) et met à jour le quota.
  removeGold(amount)
  profile = {
    ...profile,
    dailyTransferSent: getDailyTransferSent() + amount,
    dailyTransferDate: todayStr(),
  }
  void persist()
  emit()
  logTransaction(toUid, toName, amount, 'transfer')
  return { ok: true }
}

/**
 * Offre `amount` gold à un joueur (simulation, sans limite ni débit).
 * Crédite uniquement le destinataire côté Firestore.
 */
export async function giftGold(toUid: string, amount: number, toName = ''): Promise<void> {
  if (amount <= 0) return
  await firestoreGiftGold(toUid, amount)
  logTransaction(toUid, toName, amount, 'gift')
}

/** Active/désactive la visibilité publique de l'historique de gold (local + Firestore). */
export function setGoldHistoryPublic(value: boolean): void {
  if (value === profile.goldHistoryPublic) return
  profile = { ...profile, goldHistoryPublic: value }
  void persist()
  const uid = getAuth(firebaseApp).currentUser?.uid
  if (uid) void firestoreUpdateGoldHistoryPublic(uid, value).catch(() => {})
  emit()
}

/** Applique la valeur Firebase au login (local uniquement, sans ré-écriture). */
export function setGoldHistoryPublicLocal(value: boolean): void {
  if (value === profile.goldHistoryPublic) return
  profile = { ...profile, goldHistoryPublic: value }
  void persist()
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
export function recordResult(won: boolean, game: 'ronda' | 'dijouj' = 'ronda'): number {
  const reward = won ? WIN_REWARD : 0
  profile = {
    ...profile,
    gamesPlayed:  profile.gamesPlayed + 1,
    gamesWon:     profile.gamesWon + (won ? 1 : 0),
    gold:         profile.gold + reward,
    rondaPlayed:  profile.rondaPlayed  + (game === 'ronda'  ? 1 : 0),
    rondaWon:     profile.rondaWon     + (game === 'ronda'  && won ? 1 : 0),
    dijoujPlayed: profile.dijoujPlayed + (game === 'dijouj' ? 1 : 0),
    dijoujWon:    profile.dijoujWon    + (game === 'dijouj' && won ? 1 : 0),
  }
  void persist()
  // Synchronise stats + or (le gain de victoire modifie le solde) vers Firestore.
  syncStatsToFirestore()
  if (reward > 0) syncGoldToFirestore(profile.gold)
  emit()
  return reward
}

export function setAvatarEmoji(emoji: string): void {
  profile = { ...profile, avatarType: 'emoji', avatarEmoji: emoji, avatarImage: '' }
  void persist()
  syncAvatarToFirestore('emoji', emoji, '')
  emit()
}

export function setAvatarImage(uri: string): void {
  profile = { ...profile, avatarType: 'image', avatarImage: uri, avatarEmoji: '' }
  void persist()
  syncAvatarToFirestore('image', '', uri)
  emit()
}

export function clearAvatar(): void {
  profile = { ...profile, avatarType: 'initial', avatarEmoji: '', avatarImage: '' }
  void persist()
  syncAvatarToFirestore('initial', '', '')
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

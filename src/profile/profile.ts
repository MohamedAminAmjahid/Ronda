import AsyncStorage from '@react-native-async-storage/async-storage'
import { getAuth } from 'firebase/auth'
import { firebaseApp } from '../firebase/config'
import {
  updateGold as firestoreUpdateGold,
  updateUsernameChanges as firestoreUpdateUsernameChanges,
  updateAvatar as firestoreUpdateAvatar,
  updateStats as firestoreUpdateStats,
  updateGoldHistoryPublic as firestoreUpdateGoldHistoryPublic,
  updateCosmetics as firestoreUpdateCosmetics,
  applyReferral, REFERRAL_REWARD,
} from '../firebase/firestore'
import { apiGift, apiTransfer } from '../online/serverApi'
import { markQuestProgress, registerGoldSetter } from '../quests/quests'
import { TABLES, BACKS, DEFAULT_TABLE, DEFAULT_BACK, type CosmeticKind } from '../cosmetics/catalog'
import { FRAMES, DEFAULT_FRAME } from '../cosmetics/avatarFrames'

// Store singleton du profil joueur, persisté via AsyncStorage.
// - username : généré une seule fois au premier lancement (Joueur#XXXX), puis persisté.
// - gold : monnaie du jeu, démarre à 200.
// Le store est pur côté UI : on s'abonne via subscribeProfile et on lit getProfile().

const STORAGE_KEY = 'ronda_profile'
const ACTIVE_ROOM_KEY = 'ronda_active_room'
const REFERRAL_CODE_KEY = 'ronda_referral_code'
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
  /** Cosmétiques : tapis + dos de cartes + cadre d'avatar. */
  table: string
  ownedTables: string[]
  cardBack: string
  ownedBacks: string[]
  avatarFrame: string
  ownedFrames: string[]
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
  table: DEFAULT_TABLE,
  ownedTables: [DEFAULT_TABLE],
  cardBack: DEFAULT_BACK,
  ownedBacks: [DEFAULT_BACK],
  avatarFrame: DEFAULT_FRAME,
  ownedFrames: [DEFAULT_FRAME],
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
          table:       typeof parsed.table === 'string' ? parsed.table : DEFAULT_TABLE,
          ownedTables: Array.isArray(parsed.ownedTables) ? parsed.ownedTables : [DEFAULT_TABLE],
          cardBack:    typeof parsed.cardBack === 'string' ? parsed.cardBack : DEFAULT_BACK,
          ownedBacks:  Array.isArray(parsed.ownedBacks) ? parsed.ownedBacks : [DEFAULT_BACK],
          avatarFrame: typeof parsed.avatarFrame === 'string' ? parsed.avatarFrame : DEFAULT_FRAME,
          ownedFrames: Array.isArray(parsed.ownedFrames) ? parsed.ownedFrames : [DEFAULT_FRAME],
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
          table: DEFAULT_TABLE, ownedTables: [DEFAULT_TABLE], cardBack: DEFAULT_BACK, ownedBacks: [DEFAULT_BACK],
          avatarFrame: DEFAULT_FRAME, ownedFrames: [DEFAULT_FRAME],
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
        table: DEFAULT_TABLE, ownedTables: [DEFAULT_TABLE], cardBack: DEFAULT_BACK, ownedBacks: [DEFAULT_BACK],
        avatarFrame: DEFAULT_FRAME, ownedFrames: [DEFAULT_FRAME],
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

function syncCosmeticsToFirestore(): void {
  const uid = getAuth(firebaseApp).currentUser?.uid
  if (!uid) return
  void firestoreUpdateCosmetics(uid, {
    table:       profile.table,
    ownedTables: profile.ownedTables,
    cardBack:    profile.cardBack,
    ownedBacks:  profile.ownedBacks,
    avatarFrame: profile.avatarFrame,
    ownedFrames: profile.ownedFrames,
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

// Permet au module de quêtes d'appliquer localement le solde renvoyé par le
// serveur après une récompense (sans créer de cycle d'import).
registerGoldSetter(setGold)

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

/**
 * Transfère `amount` gold vers un autre joueur (gratuit, plafonné 200/j).
 * Le serveur Railway est autoritaire : il vérifie le solde et le quota, débite
 * l'émetteur et crédite le destinataire. Le solde local est mis à jour d'après
 * la réponse serveur (sans ré-écriture Firestore).
 */
export async function transferGold(toUid: string, amount: number, _toName = ''): Promise<TransferResult> {
  const remaining = getTransferRemaining()
  if (amount <= 0) return { ok: false, reason: 'amount', remaining }

  const r = await apiTransfer(toUid, amount)
  if (r.ok) {
    if (typeof r.gold === 'number') setGold(r.gold)
    const newRemaining = typeof r.remaining === 'number' ? r.remaining : Math.max(0, remaining - amount)
    profile = { ...profile, dailyTransferSent: DAILY_TRANSFER_LIMIT - newRemaining, dailyTransferDate: todayStr() }
    void persist()
    emit()
    return { ok: true }
  }
  if (r.reason === 'balance') return { ok: false, reason: 'balance', remaining: r.remaining ?? remaining }
  if (r.reason === 'quota')   return { ok: false, reason: 'quota',   remaining: r.remaining ?? 0 }
  return { ok: false, reason: 'error', remaining }
}

/** Coût pour l'émetteur d'un cadeau : 90 % du montant offert (10 % de réduction). */
export function giftCost(amount: number): number {
  return Math.round(amount * 0.9)
}

/**
 * Offre `amount` gold à un joueur : le serveur crédite le destinataire (+journal),
 * et l'émetteur est débité de `giftCost(amount)` (90 %). Lance 'insufficient_gold'
 * si le solde est insuffisant, 'gift_failed' si le crédit serveur échoue.
 */
export async function giftGold(toUid: string, amount: number, _toName = ''): Promise<void> {
  if (amount <= 0) return
  const cost = giftCost(amount)
  if (profile.gold < cost) throw new Error('insufficient_gold')
  const r = await apiGift(toUid, amount)
  if (!r.ok) throw new Error('gift_failed')
  removeGold(cost)
  void markQuestProgress('sendGift')
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

// ── Cosmétiques (tapis + dos de cartes) ─────────────────────────────────────────

/** Équipe un cosmétique déjà possédé. */
export function equipCosmetic(kind: CosmeticKind, id: string): void {
  if (kind === 'table') {
    if (!profile.ownedTables.includes(id) || profile.table === id) return
    profile = { ...profile, table: id }
  } else if (kind === 'back') {
    if (!profile.ownedBacks.includes(id) || profile.cardBack === id) return
    profile = { ...profile, cardBack: id }
  } else {
    if (!profile.ownedFrames.includes(id) || profile.avatarFrame === id) return
    profile = { ...profile, avatarFrame: id }
  }
  void persist()
  syncCosmeticsToFirestore()
  emit()
}

/**
 * Achète un cosmétique : déduit le gold, l'ajoute aux possessions et l'équipe.
 * Si déjà possédé → équipe simplement. Renvoie false si solde insuffisant.
 */
export function buyCosmetic(kind: CosmeticKind, id: string): boolean {
  const def = kind === 'table' ? TABLES.find(t => t.id === id)
    : kind === 'back' ? BACKS.find(b => b.id === id)
    : FRAMES.find(f => f.id === id)
  if (!def) return false
  const owned = kind === 'table' ? profile.ownedTables
    : kind === 'back' ? profile.ownedBacks
    : profile.ownedFrames
  if (owned.includes(id)) { equipCosmetic(kind, id); return true }
  if (profile.gold < def.price) return false

  const newGold = Math.max(0, profile.gold - def.price)
  if (kind === 'table') {
    profile = { ...profile, gold: newGold, ownedTables: [...profile.ownedTables, id], table: id }
  } else if (kind === 'back') {
    profile = { ...profile, gold: newGold, ownedBacks: [...profile.ownedBacks, id], cardBack: id }
  } else {
    profile = { ...profile, gold: newGold, ownedFrames: [...profile.ownedFrames, id], avatarFrame: id }
  }
  void persist()
  syncGoldToFirestore(newGold)
  syncCosmeticsToFirestore()
  emit()
  return true
}

/** Applique les cosmétiques Firebase au login (local uniquement). */
export function setCosmeticsLocal(c: {
  table: string; ownedTables: string[]; cardBack: string; ownedBacks: string[]
  avatarFrame: string; ownedFrames: string[]
}): void {
  profile = {
    ...profile,
    table: c.table, ownedTables: c.ownedTables,
    cardBack: c.cardBack, ownedBacks: c.ownedBacks,
    avatarFrame: c.avatarFrame, ownedFrames: c.ownedFrames,
  }
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
  const wasFirstGame = profile.gamesPlayed === 0
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
  if (won) void markQuestProgress('winGame')
  // Parrainage : déclenché à la TOUTE première partie (anti faux comptes).
  if (wasFirstGame) void maybeApplyReferral()
  return reward
}

/**
 * Si un code de parrainage est en attente (AsyncStorage), l'applique via Firestore
 * à la première partie du joueur, puis crédite localement le +500 et retire le code.
 */
async function maybeApplyReferral(): Promise<void> {
  const uid = getAuth(firebaseApp).currentUser?.uid
  if (!uid) return
  let code: string | null = null
  try {
    code = await AsyncStorage.getItem(REFERRAL_CODE_KEY)
  } catch {
    return
  }
  if (!code) return

  const res = await applyReferral(uid, code)
  if (res.ok) {
    // Reflète localement le +500 crédité côté serveur (increment), sans ré-écriture.
    setGold(profile.gold + REFERRAL_REWARD)
  }
  // Retire le code sauf erreur réseau (pour pouvoir retenter plus tard).
  if (res.ok || res.reason !== 'error') {
    try { await AsyncStorage.removeItem(REFERRAL_CODE_KEY) } catch { /* ignore */ }
  }
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

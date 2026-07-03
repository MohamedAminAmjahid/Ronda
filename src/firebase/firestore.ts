import {
  getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, limit, serverTimestamp,
  onSnapshot, increment, orderBy, documentId,
} from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { firebaseApp } from './config'
import type { User } from './auth'
import { notifyInvite, notifyMessage, notifyFriendRequest } from '../online/serverApi'

export const db = getFirestore(firebaseApp)

export interface UserDoc {
  uid: string
  username: string
  usernameLower: string
  gold: number
  gamesPlayed: number
  gamesWon: number
  rondaPlayed: number
  rondaWon: number
  dijoujPlayed: number
  dijoujWon: number
  usernameChanges: number
  avatarType: string
  avatarEmoji: string
  avatarImage: string
  /** Historique des cadeaux/transferts visible publiquement (true par défaut). */
  goldHistoryPublic: boolean
  /** Statistiques visibles publiquement (true par défaut). */
  statsPublic: boolean
  /** Cosmétiques : tapis + dos de cartes + cadre d'avatar équipés et possédés. */
  table: string
  ownedTables: string[]
  cardBack: string
  ownedBacks: string[]
  avatarFrame: string
  ownedFrames: string[]
  /** Parrainage. */
  referralUsed: boolean
  referredBy: string
  referralCount: number
  xp: number
  level: number
}

/** Cosmétiques synchronisés vers Firestore. */
export interface CosmeticsUpdate {
  table: string
  ownedTables: string[]
  cardBack: string
  ownedBacks: string[]
  avatarFrame: string
  ownedFrames: string[]
}

/** Une entrée de l'historique des cadeaux/transferts de gold. */
export interface GoldHistoryEntry {
  id: string
  fromUid: string
  fromName: string
  toUid: string
  toName: string
  amount: number
  type: 'gift' | 'transfer'
  createdAt: Date | null
}

/** Statistiques de parties synchronisées vers Firestore. */
export interface StatsUpdate {
  gamesPlayed: number
  gamesWon: number
  rondaPlayed: number
  rondaWon: number
  dijoujPlayed: number
  dijoujWon: number
}

export interface FriendDoc {
  uid: string
  username: string
  status: 'pending' | 'accepted'
  avatarType: string
  avatarEmoji: string
  avatarImage: string
  level?: number
  xp?: number
}

/** Profil local utilisé pour initialiser le document Firebase au 1er login. */
export interface LocalProfileSeed {
  username: string
  gold: number
  gamesPlayed: number
  gamesWon: number
  rondaPlayed: number
  rondaWon: number
  dijoujPlayed: number
  dijoujWon: number
  usernameChanges: number
  goldHistoryPublic: boolean
  table: string
  ownedTables: string[]
  cardBack: string
  ownedBacks: string[]
  avatarFrame: string
  ownedFrames: string[]
  xp?: number
  level?: number
}

function userRef(uid: string) {
  return doc(db, 'users', uid)
}

async function getUsername(uid: string): Promise<string> {
  const snap = await getDoc(userRef(uid))
  if (snap.exists() && snap.data().username) return snap.data().username as string
  const authUser = getAuth(firebaseApp).currentUser
  return authUser?.displayName || 'Joueur'
}

/**
 * Vérifie si un username est disponible (insensible à la casse).
 * excludeUid : si le seul document trouvé appartient à cet uid, considéré disponible
 * (l'utilisateur "possède" déjà ce nom).
 */
export async function isUsernameAvailable(username: string, excludeUid?: string): Promise<boolean> {
  const q = query(
    collection(db, 'users'),
    where('usernameLower', '==', username.toLowerCase().trim()),
    limit(1),
  )
  const res = await getDocs(q)
  if (res.empty) return true
  if (excludeUid && res.docs[0].id === excludeUid) return true
  return false
}

/**
 * Crée le profil Firebase au premier login (en reprenant le profil local), sinon
 * met à jour lastSeen. Retourne username + gold + usernameChanges Firebase.
 * Au premier login, si le username local est déjà pris, ajoute un suffixe numérique.
 */
export async function createOrUpdateUser(
  user: User,
  local: LocalProfileSeed,
): Promise<{
  username: string; gold: number; usernameChanges: number; goldHistoryPublic: boolean
  table: string; ownedTables: string[]; cardBack: string; ownedBacks: string[]
  avatarFrame: string; ownedFrames: string[]; statsPublic: boolean
  xp: number; level: number
}> {
  const ref = userRef(user.uid)
  const snap = await getDoc(ref)

  if (!snap.exists()) {
    let finalUsername = local.username
    const available = await isUsernameAvailable(local.username)
    if (!available) {
      const suffix = Math.floor(10 + Math.random() * 90)
      finalUsername = `${local.username.slice(0, 13)}_${suffix}`
    }
    await setDoc(ref, {
      username: finalUsername,
      usernameLower: finalUsername.toLowerCase(),
      gold: local.gold,
      gamesPlayed: local.gamesPlayed,
      gamesWon: local.gamesWon,
      rondaPlayed: local.rondaPlayed,
      rondaWon: local.rondaWon,
      dijoujPlayed: local.dijoujPlayed,
      dijoujWon: local.dijoujWon,
      usernameChanges: local.usernameChanges,
      goldHistoryPublic: local.goldHistoryPublic,
      statsPublic: true,
      table: local.table,
      ownedTables: local.ownedTables,
      cardBack: local.cardBack,
      ownedBacks: local.ownedBacks,
      avatarFrame: local.avatarFrame,
      ownedFrames: local.ownedFrames,
      referralUsed: false,
      referredBy: null,
      referralCount: 0,
      xp: local.xp ?? 0,
      level: local.level ?? 1,
      email: user.email ?? null,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
    })
    return {
      username: finalUsername, gold: local.gold,
      usernameChanges: local.usernameChanges, goldHistoryPublic: local.goldHistoryPublic,
      table: local.table, ownedTables: local.ownedTables,
      cardBack: local.cardBack, ownedBacks: local.ownedBacks,
      avatarFrame: local.avatarFrame, ownedFrames: local.ownedFrames,
      statsPublic: true,
      xp: local.xp ?? 0, level: local.level ?? 1,
    }
  }

  const data = snap.data()
  await updateDoc(ref, { lastSeen: serverTimestamp() })
  return {
    username: (data.username as string) || local.username,
    gold: typeof data.gold === 'number' ? (data.gold as number) : local.gold,
    usernameChanges:
      typeof data.usernameChanges === 'number'
        ? (data.usernameChanges as number)
        : local.usernameChanges,
    goldHistoryPublic:
      typeof data.goldHistoryPublic === 'boolean'
        ? (data.goldHistoryPublic as boolean)
        : true,
    table:       (data.table as string) ?? local.table,
    ownedTables: (data.ownedTables as string[]) ?? local.ownedTables,
    cardBack:    (data.cardBack as string) ?? local.cardBack,
    ownedBacks:  (data.ownedBacks as string[]) ?? local.ownedBacks,
    avatarFrame: (data.avatarFrame as string) ?? local.avatarFrame,
    ownedFrames: (data.ownedFrames as string[]) ?? local.ownedFrames,
    statsPublic: typeof data.statsPublic === 'boolean' ? (data.statsPublic as boolean) : true,
    xp:    typeof data.xp === 'number' ? (data.xp as number) : 0,
    level: typeof data.level === 'number' ? (data.level as number) : 1,
  }
}

/** Active/désactive la visibilité publique des statistiques. */
export async function updateStatsPublic(uid: string, value: boolean): Promise<void> {
  await updateDoc(userRef(uid), { statsPublic: value })
}

/** Met à jour le username et usernameLower dans Firestore. */
export async function updateUsername(uid: string, username: string): Promise<void> {
  await updateDoc(userRef(uid), { username, usernameLower: username.toLowerCase() })
}

/** Met à jour le gold dans Firestore. */
export async function updateGold(uid: string, gold: number): Promise<void> {
  await updateDoc(userRef(uid), { gold })
}

/** Met à jour le compteur de changements de pseudo dans Firestore. */
export async function updateUsernameChanges(uid: string, count: number): Promise<void> {
  await updateDoc(userRef(uid), { usernameChanges: count })
}

/**
 * Crédite le gold d'un utilisateur via un incrément atomique Firestore.
 * Utilisé pour offrir un cadeau (simulation) ou transférer du gold.
 * Aucune vérification de solde : c'est l'appelant qui gère la déduction côté émetteur.
 */
export async function giftGold(toUid: string, amount: number): Promise<void> {
  if (amount <= 0) return
  await updateDoc(userRef(toUid), { gold: increment(amount) })
}

/** Lit l'avatar d'un utilisateur (type, emoji, image). */
export async function getUserAvatar(uid: string): Promise<{
  avatarType: string; avatarEmoji: string; avatarImage: string
}> {
  const snap = await getDoc(userRef(uid))
  const d = snap.data() ?? {}
  return {
    avatarType:  (d.avatarType  as string) ?? 'initial',
    avatarEmoji: (d.avatarEmoji as string) ?? '',
    avatarImage: (d.avatarImage as string) ?? '',
  }
}

/** Synchronise l'avatar dans le document utilisateur Firestore. */
export async function updateAvatar(
  uid: string,
  avatarType: string,
  avatarEmoji: string,
  avatarImage: string,
): Promise<void> {
  await updateDoc(userRef(uid), { avatarType, avatarEmoji, avatarImage })
}

/** Construit un UserDoc à partir d'un document Firestore brut. */
function toUserDoc(id: string, data: Record<string, unknown>): UserDoc {
  return {
    uid: id,
    username: data.username as string,
    usernameLower: (data.usernameLower as string) ?? (data.username as string).toLowerCase(),
    gold: (data.gold as number) ?? 0,
    gamesPlayed: (data.gamesPlayed as number) ?? 0,
    gamesWon: (data.gamesWon as number) ?? 0,
    rondaPlayed: (data.rondaPlayed as number) ?? 0,
    rondaWon: (data.rondaWon as number) ?? 0,
    dijoujPlayed: (data.dijoujPlayed as number) ?? 0,
    dijoujWon: (data.dijoujWon as number) ?? 0,
    usernameChanges: (data.usernameChanges as number) ?? 0,
    avatarType: (data.avatarType as string) ?? 'initial',
    avatarEmoji: (data.avatarEmoji as string) ?? '',
    avatarImage: (data.avatarImage as string) ?? '',
    // Absent → public par défaut (rétro-compat avec les anciens comptes).
    goldHistoryPublic: (data.goldHistoryPublic as boolean) ?? true,
    statsPublic: (data.statsPublic as boolean) ?? true,
    table:       (data.table as string) ?? 'green',
    ownedTables: (data.ownedTables as string[]) ?? ['green'],
    cardBack:    (data.cardBack as string) ?? 'default',
    ownedBacks:  (data.ownedBacks as string[]) ?? ['default'],
    avatarFrame: (data.avatarFrame as string) ?? 'none',
    ownedFrames: (data.ownedFrames as string[]) ?? ['none'],
    referralUsed:  (data.referralUsed as boolean) ?? false,
    referredBy:    (data.referredBy as string) ?? '',
    referralCount: (data.referralCount as number) ?? 0,
    xp:    (data.xp as number) ?? 0,
    level: (data.level as number) ?? 1,
  }
}

/** Recherche un utilisateur par username (insensible à la casse). null si introuvable. */
export async function searchUserByUsername(username: string): Promise<UserDoc | null> {
  const q = query(
    collection(db, 'users'),
    where('usernameLower', '==', username.toLowerCase().trim()),
    limit(1),
  )
  const res = await getDocs(q)
  if (res.empty) return null
  const d = res.docs[0]
  return toUserDoc(d.id, d.data())
}

/** Lit un profil utilisateur complet par son uid. null si introuvable. */
export async function getUserById(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(userRef(uid))
  if (!snap.exists()) return null
  return toUserDoc(snap.id, snap.data())
}

/** Synchronise les statistiques de parties dans Firestore. */
export async function updateStats(uid: string, stats: StatsUpdate): Promise<void> {
  await updateDoc(userRef(uid), { ...stats })
}

/** Synchronise XP et niveau dans Firestore. */
export async function updateXpLevel(uid: string, xp: number, level: number): Promise<void> {
  await updateDoc(userRef(uid), { xp, level })
}

/** Active/désactive la visibilité publique de l'historique de gold. */
export async function updateGoldHistoryPublic(uid: string, value: boolean): Promise<void> {
  await updateDoc(userRef(uid), { goldHistoryPublic: value })
}

/** Synchronise les cosmétiques (tapis + dos de cartes) dans Firestore. */
export async function updateCosmetics(uid: string, cosmetics: CosmeticsUpdate): Promise<void> {
  await updateDoc(userRef(uid), { ...cosmetics })
}

// ── Parrainage ─────────────────────────────────────────────────────────────

/** Récompense de parrainage (créditée aux deux joueurs). */
export const REFERRAL_REWARD = 500

export type ReferralResult =
  | { ok: true; referrerUid: string }
  | { ok: false; reason: 'already' | 'not_found' | 'self' | 'error' }

/** Une entrée de la liste de parrainages (réussi ou en attente). */
export interface ReferralEntry {
  uid: string
  username: string
  date: Date | null
  reward?: number
}

/**
 * Enregistre un filleul « en attente » (compte créé via un lien, pas encore joué)
 * chez le parrain : referrals/{referrerUid}/pending/{newUserUid}. No-op si déjà
 * parrainé ou si le parrain est introuvable / soi-même.
 */
export async function registerPendingReferral(
  referrerUsername: string,
  newUserUid: string,
  newUsername: string,
): Promise<void> {
  try {
    const newSnap = await getDoc(userRef(newUserUid))
    if (newSnap.exists() && newSnap.data().referralUsed === true) return
    const referrer = await searchUserByUsername(referrerUsername)
    if (!referrer || referrer.uid === newUserUid) return
    await setDoc(doc(db, 'referrals', referrer.uid, 'pending', newUserUid), {
      uid: newUserUid,
      username: newUsername,
      createdAt: serverTimestamp(),
    })
  } catch (e) {
    console.error('[registerPendingReferral] erreur:', e)
  }
}

/** Liste des parrainages d'un joueur : réussis (completed) + en attente (pending). */
export async function getReferrals(uid: string): Promise<{ completed: ReferralEntry[]; pending: ReferralEntry[] }> {
  const mapEntry = (d: { id: string; data: () => Record<string, unknown> }): ReferralEntry => {
    const data = d.data()
    return {
      uid: (data.uid as string) ?? d.id,
      username: (data.username as string) ?? '—',
      date: toDate(data.createdAt),
      reward: data.reward as number | undefined,
    }
  }
  try {
    const [comp, pend] = await Promise.all([
      getDocs(query(collection(db, 'referrals', uid, 'completed'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'referrals', uid, 'pending'), orderBy('createdAt', 'desc'))),
    ])
    return {
      completed: comp.docs.map(mapEntry),
      pending: pend.docs.map(mapEntry),
    }
  } catch (e) {
    console.error('[getReferrals] erreur:', e)
    return { completed: [], pending: [] }
  }
}

/**
 * Applique un parrainage : crédite +500 gold au nouvel utilisateur ET au parrain
 * (increment), marque referralUsed/referredBy et incrémente referralCount du parrain.
 * Idempotent : ne fait rien si le nouvel utilisateur a déjà utilisé un parrainage.
 */
export async function applyReferral(
  newUserUid: string,
  referrerUsername: string,
): Promise<ReferralResult> {
  try {
    const newRef = userRef(newUserUid)
    const newSnap = await getDoc(newRef)
    if (!newSnap.exists()) return { ok: false, reason: 'error' }
    if (newSnap.data().referralUsed === true) return { ok: false, reason: 'already' }

    const referrer = await searchUserByUsername(referrerUsername)
    if (!referrer) return { ok: false, reason: 'not_found' }
    if (referrer.uid === newUserUid) return { ok: false, reason: 'self' }

    // Crédite le nouvel utilisateur + marque le parrainage.
    await updateDoc(newRef, {
      gold: increment(REFERRAL_REWARD),
      referralUsed: true,
      referredBy: referrer.uid,
    })
    // Crédite le parrain + incrémente son compteur.
    await updateDoc(userRef(referrer.uid), {
      gold: increment(REFERRAL_REWARD),
      referralCount: increment(1),
    })
    // Historique de parrainage : ajoute aux « réussis », retire des « en attente ».
    const newUsername = (newSnap.data().username as string) ?? 'Joueur'
    await setDoc(doc(db, 'referrals', referrer.uid, 'completed', newUserUid), {
      uid: newUserUid,
      username: newUsername,
      reward: REFERRAL_REWARD,
      createdAt: serverTimestamp(),
    })
    await deleteDoc(doc(db, 'referrals', referrer.uid, 'pending', newUserUid)).catch(() => {})
    return { ok: true, referrerUid: referrer.uid }
  } catch (e) {
    console.error('[applyReferral] erreur:', e)
    return { ok: false, reason: 'error' }
  }
}

// ── Historique des cadeaux / transferts de gold (collection goldHistory) ───────

/** Enregistre une transaction de gold (cadeau ou transfert) dans goldHistory. */
export async function logGoldTransaction(
  fromUid: string,
  fromName: string,
  toUid: string,
  toName: string,
  amount: number,
  type: 'gift' | 'transfer',
): Promise<void> {
  await addDoc(collection(db, 'goldHistory'), {
    fromUid, fromName, toUid, toName, amount, type,
    createdAt: serverTimestamp(),
  })
}

function toHistoryEntry(id: string, data: Record<string, unknown>): GoldHistoryEntry {
  return {
    id,
    fromUid:  (data.fromUid  as string) ?? '',
    fromName: (data.fromName as string) ?? '',
    toUid:    (data.toUid    as string) ?? '',
    toName:   (data.toName   as string) ?? '',
    amount:   (data.amount   as number) ?? 0,
    type:     (data.type === 'transfer' ? 'transfer' : 'gift'),
    createdAt: (data.createdAt as { toDate?: () => Date } | null)?.toDate?.() ?? null,
  }
}

/**
 * Les 10 dernières transactions où `uid` est émetteur OU destinataire,
 * triées par date décroissante. Combine deux requêtes (fromUid / toUid).
 * Nécessite un index composite Firestore (fromUid+createdAt, toUid+createdAt) ;
 * en cas d'erreur (index manquant, hors-ligne), renvoie [].
 */
export async function getGoldHistory(uid: string): Promise<GoldHistoryEntry[]> {
  try {
    const histRef = collection(db, 'goldHistory')

    // Diagnostic : les deux requêtes sont exécutées séparément pour identifier
    // précisément laquelle échoue (règle de sécurité / index composite).
    let sent, received
    try {
      sent = await getDocs(query(histRef, where('fromUid', '==', uid), orderBy('createdAt', 'desc'), limit(10)))
    } catch (e) {
      console.error('[getGoldHistory] requête fromUid échouée:', e)
      throw e
    }
    try {
      received = await getDocs(query(histRef, where('toUid', '==', uid), orderBy('createdAt', 'desc'), limit(10)))
    } catch (e) {
      console.error('[getGoldHistory] requête toUid échouée:', e)
      throw e
    }

    const merged = new Map<string, GoldHistoryEntry>()
    for (const d of [...sent.docs, ...received.docs]) {
      merged.set(d.id, toHistoryEntry(d.id, d.data()))
    }
    return Array.from(merged.values())
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .slice(0, 10)
  } catch (e) {
    console.error('[getGoldHistory] erreur (index composite requis ?):', e)
    return []
  }
}

// ── Présence en ligne ──────────────────────────────────────────────────────

export interface PresenceInfo {
  isOnline: boolean
  lastSeen: Date | null
}

function toDate(ts: unknown): Date | null {
  return (ts as { toDate?: () => Date } | null)?.toDate?.() ?? null
}

/** Met à jour le statut en ligne + lastSeen de l'utilisateur (best-effort). */
export async function setOnlineStatus(uid: string, online: boolean): Promise<void> {
  try {
    await updateDoc(userRef(uid), { isOnline: online, lastSeen: serverTimestamp() })
  } catch {
    // hors-ligne / règles — sans effet
  }
}

/** Écoute en temps réel le statut d'un utilisateur. */
export function subscribeOnlineStatus(uid: string, cb: (info: PresenceInfo) => void): () => void {
  return onSnapshot(
    userRef(uid),
    (snap) => {
      const d = snap.data() ?? {}
      cb({ isOnline: d.isOnline === true, lastSeen: toDate(d.lastSeen) })
    },
    () => cb({ isOnline: false, lastSeen: null }),
  )
}

/**
 * Écoute le statut de plusieurs utilisateurs via des requêtes groupées
 * (chunks de 10, contrainte Firestore `in`). Un seul unsubscribe rend tous
 * les listeners. cb reçoit la map complète { uid: PresenceInfo } à chaque MAJ.
 */
export function subscribeOnlineStatuses(
  uids: string[],
  cb: (map: Record<string, PresenceInfo>) => void,
): () => void {
  if (uids.length === 0) { cb({}); return () => {} }
  const acc: Record<string, PresenceInfo> = {}
  const chunks: string[][] = []
  for (let i = 0; i < uids.length; i += 10) chunks.push(uids.slice(i, i + 10))
  const unsubs = chunks.map((chunk) =>
    onSnapshot(
      query(collection(db, 'users'), where(documentId(), 'in', chunk)),
      (snap) => {
        snap.forEach((d) => {
          const data = d.data()
          acc[d.id] = { isOnline: data.isOnline === true, lastSeen: toDate(data.lastSeen) }
        })
        cb({ ...acc })
      },
      () => { /* ignore */ },
    ),
  )
  return () => { for (const u of unsubs) u() }
}

// ── Amis (sous-collection users/{uid}/friends/{friendUid}) ─────────────────────

function friendRef(ownerUid: string, friendUid: string) {
  return doc(db, 'users', ownerUid, 'friends', friendUid)
}

/** Envoie une demande d'ami : crée une entrée 'pending' chez la cible. */
export async function sendFriendRequest(myUid: string, targetUid: string): Promise<void> {
  console.log('[sendFriendRequest] start', { myUid, targetUid })
  try {
    if (myUid === targetUid) throw new Error("Impossible de s'ajouter soi-même.")

    const authUser = getAuth(firebaseApp).currentUser
    const myUsername = (await getUsername(myUid).catch(() => null))
      || authUser?.displayName
      || 'Joueur'
    console.log('[sendFriendRequest] username:', myUsername)

    await setDoc(friendRef(targetUid, myUid), {
      uid: myUid,
      username: myUsername,
      status: 'pending',
      createdAt: serverTimestamp(),
    })
    notifyFriendRequest(targetUid)
  } catch (e) {
    console.error('[sendFriendRequest] error:', JSON.stringify(e), e)
    throw e
  }
}

/** Accepte une demande : passe les deux côtés en 'accepted'. */
export async function acceptFriendRequest(myUid: string, fromUid: string): Promise<void> {
  const [myUsername, fromUsername] = await Promise.all([getUsername(myUid), getUsername(fromUid)])
  await Promise.all([
    setDoc(friendRef(myUid, fromUid), { uid: fromUid, username: fromUsername, status: 'accepted' }),
    setDoc(friendRef(fromUid, myUid), { uid: myUid, username: myUsername, status: 'accepted' }),
  ])
}

/** Refuse / supprime une demande entrante. */
export async function declineFriendRequest(myUid: string, fromUid: string): Promise<void> {
  await deleteDoc(friendRef(myUid, fromUid))
}

/** Supprime un ami des deux côtés. */
export async function removeFriend(myUid: string, friendUid: string): Promise<void> {
  await Promise.all([
    deleteDoc(friendRef(myUid, friendUid)),
    deleteDoc(friendRef(friendUid, myUid)),
  ])
}

async function readFriends(ownerUid: string, status: FriendDoc['status']): Promise<FriendDoc[]> {
  const q = query(collection(db, 'users', ownerUid, 'friends'), where('status', '==', status))
  const res = await getDocs(q)
  const base = res.docs.map((d) => {
    const data = d.data()
    return { uid: data.uid as string, username: data.username as string, status }
  })
  // Fetch avatar from each friend's user doc in parallel
  const profiles = await Promise.all(base.map((f) => getDoc(userRef(f.uid))))
  return base.map((f, i) => {
    const pd = profiles[i].data() ?? {}
    return {
      ...f,
      avatarType:  (pd.avatarType  as string) ?? 'initial',
      avatarEmoji: (pd.avatarEmoji as string) ?? '',
      avatarImage: (pd.avatarImage as string) ?? '',
    }
  })
}

/** Liste des amis acceptés. */
export function getFriends(uid: string): Promise<FriendDoc[]> {
  return readFriends(uid, 'accepted')
}

/** Demandes d'amis en attente (entrantes). */
export function getPendingRequests(uid: string): Promise<FriendDoc[]> {
  return readFriends(uid, 'pending')
}

/** Écoute en temps réel le nombre de demandes en attente. */
export function subscribePendingCount(
  myUid: string,
  callback: (count: number) => void,
): () => void {
  const q = query(
    collection(db, 'users', myUid, 'friends'),
    where('status', '==', 'pending'),
  )
  return onSnapshot(q, (snap) => callback(snap.size), () => callback(0))
}

// ── Chat (messages privés entre amis) ──────────────────────────────────────────

/** chatId déterministe : [uid1, uid2] triés, séparés par '_'. */
export function getChatId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_')
}

export interface MessageDoc {
  id: string
  fromUid: string
  text: string
  createdAt: Date | null
}

/** Envoie un message (crée le doc chat si nécessaire). */
export async function sendMessage(
  myUid: string,
  friendUid: string,
  text: string,
): Promise<void> {
  const chatId  = getChatId(myUid, friendUid)
  const chatRef = doc(db, 'chats', chatId)
  try {
    // setDoc merge:true crée le doc s'il n'existe pas, ou le met à jour sinon.
    // increment(1) s'initialise à 1 sur un champ absent.
    await setDoc(chatRef, {
      participants:           [myUid, friendUid],
      [`unread_${friendUid}`]: increment(1),
      lastText:               text,
      lastFrom:               myUid,
      lastAt:                 serverTimestamp(),
    }, { merge: true })
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      fromUid:   myUid,
      text,
      createdAt: serverTimestamp(),
    })
    notifyMessage(friendUid)
  } catch (e) {
    console.error('[sendMessage] Firestore error:', e)
    throw e
  }
}

/** Écoute les messages d'un chat en temps réel (triés chronologiquement). */
export function subscribeMessages(
  chatId: string,
  callback: (messages: MessageDoc[]) => void,
): () => void {
  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('createdAt', 'asc'),
  )
  return onSnapshot(q, (snap) =>
    callback(
      snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          fromUid: data.fromUid as string,
          text: data.text as string,
          createdAt: (data.createdAt as { toDate?: () => Date } | null)?.toDate?.() ?? null,
        }
      }),
    ),
  )
}

/** Remet à 0 le compteur de non-lus pour myUid dans ce chat. */
export function markChatRead(chatId: string, myUid: string): Promise<void> {
  return updateDoc(doc(db, 'chats', chatId), {
    [`unread_${myUid}`]: 0,
  }).catch(() => {})
}

/** Écoute le total de messages non-lus (tous amis confondus). */
export function subscribeTotalUnread(
  myUid: string,
  callback: (count: number) => void,
): () => void {
  const q = query(collection(db, 'chats'), where('participants', 'array-contains', myUid))
  return onSnapshot(
    q,
    (snap) => {
      let total = 0
      for (const d of snap.docs) {
        total += ((d.data()[`unread_${myUid}`] as number) ?? 0)
      }
      callback(total)
    },
    () => callback(0),
  )
}

// ── Invitations de partie (entre amis) ────────────────────────────────────────

export interface GameInviteDoc {
  id: string
  fromUid: string
  fromName: string
  toUid: string
  game: 'ronda' | 'dijouj'
  betAmount: number
  status: 'pending' | 'accepted' | 'declined' | 'room_ready'
  roomCode?: string
}

/** Envoie une invitation de partie à un ami. Retourne l'ID du document créé.
 *  Lance 'already_invited' si une invitation pending existe déjà vers cet ami. */
export async function sendGameInvite(
  fromUid: string,
  fromName: string,
  toUid: string,
  game: 'ronda' | 'dijouj',
  betAmount: number,
  roomCode?: string,  // pré-rempli pour les invitations depuis un lobby
): Promise<string> {
  // Vérifie s'il existe déjà une invitation pending vers ce même ami
  // (filtre client-side pour éviter un index composite Firestore)
  const existing = await getDocs(
    query(collection(db, 'gameInvites'), where('fromUid', '==', fromUid)),
  )
  const hasPending = existing.docs.some(
    (d) => d.data().toUid === toUid && d.data().status === 'pending',
  )
  if (hasPending) throw new Error('already_invited')

  const ref = doc(collection(db, 'gameInvites'))
  await setDoc(ref, {
    fromUid, fromName, toUid, game, betAmount,
    status: 'pending',
    ...(roomCode ? { roomCode } : {}),
    createdAt: serverTimestamp(),
  })
  notifyInvite(toUid, game)
  return ref.id
}

/** Écoute les invitations en attente reçues par myUid (filtre côté client). */
export function subscribeIncomingInvites(
  myUid: string,
  cb: (invites: GameInviteDoc[]) => void,
): () => void {
  const q = query(collection(db, 'gameInvites'), where('toUid', '==', myUid))
  return onSnapshot(
    q,
    (snap) => {
      const pending = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<GameInviteDoc, 'id'>) }))
        .filter((inv) => inv.status === 'pending')
      cb(pending)
    },
    () => cb([]),
  )
}

/** Écoute une invitation précise (pour attendre room_ready côté invité). */
export function subscribeInviteById(
  inviteId: string,
  cb: (invite: GameInviteDoc | null) => void,
): () => void {
  return onSnapshot(
    doc(db, 'gameInvites', inviteId),
    (snap) => {
      if (!snap.exists()) { cb(null); return }
      cb({ id: snap.id, ...(snap.data() as Omit<GameInviteDoc, 'id'>) })
    },
    () => cb(null),
  )
}

export function acceptGameInvite(inviteId: string): Promise<void> {
  return updateDoc(doc(db, 'gameInvites', inviteId), { status: 'accepted' })
}

export function declineGameInvite(inviteId: string): Promise<void> {
  return updateDoc(doc(db, 'gameInvites', inviteId), { status: 'declined' })
}

export function updateInviteRoomCode(inviteId: string, roomCode: string): Promise<void> {
  return updateDoc(doc(db, 'gameInvites', inviteId), { status: 'room_ready', roomCode })
}

/** Écoute les non-lus par ami : { [friendUid]: count }. */
export function subscribeFriendUnreadCounts(
  myUid: string,
  callback: (counts: Record<string, number>) => void,
): () => void {
  const q = query(collection(db, 'chats'), where('participants', 'array-contains', myUid))
  return onSnapshot(
    q,
    (snap) => {
      const counts: Record<string, number> = {}
      for (const d of snap.docs) {
        const data = d.data()
        const parts = data.participants as string[]
        const friendUid = parts.find((p) => p !== myUid)
        if (friendUid) counts[friendUid] = (data[`unread_${myUid}`] as number) ?? 0
      }
      callback(counts)
    },
    () => callback({}),
  )
}

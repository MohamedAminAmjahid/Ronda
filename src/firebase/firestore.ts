import {
  getFirestore, doc, getDoc, getDocFromServer, setDoc, addDoc, updateDoc, deleteDoc, deleteField,
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
  /** true = profil fantôme d'un bot de repli matchmaking (voir botFallback.ts). */
  isBot: boolean
  /**
   * Streak de connexion journalière courant. Nouveau champ (voir
   * useDailyBonus.ts, synchronisé à chaque réclamation) — absent sur les
   * comptes existants tant qu'ils n'ont pas réclamé leur bonus au moins une
   * fois après son introduction, d'où le fallback à 0.
   */
  currentStreak: number
  /**
   * Nombre d'amis acceptés — dénormalisé (incrémenté/décrémenté dans
   * acceptFriendRequest/removeFriend) pour permettre un classement global
   * "plus sociable" sans scanner les sous-collections friends de tout le
   * monde. Comme currentStreak, absent → 0 tant que le compte n'a pas eu de
   * mouvement d'amitié depuis l'introduction du champ.
   */
  friendCount: number
  /** Trophées de tournoi hebdomadaire (ex. 'Champion Semaine 28') — écrits
   * uniquement côté serveur via Admin SDK (distributePrizes), jamais par le
   * client. Absent → tableau vide (aucun tournoi remporté). */
  trophies: string[]
  /** Code pays (voir src/data/countries.ts, ex. 'MA') — classement géographique. */
  country: string
  /** Ville en texte libre (ex. 'Casablanca') — classement géographique. */
  city: string
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
  /** Pour les classements « Amis » (TrophiesScreen) — pas utilisé ailleurs. */
  gold?: number
  gamesWon?: number
  gamesPlayed?: number
  currentStreak?: number
  friendCount?: number
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
  avatarType?: string
  avatarEmoji?: string
  avatarImage?: string
  xp?: number
  level?: number
  country?: string
  city?: string
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

interface CreateOrUpdateUserResult {
  username: string; gold: number; usernameChanges: number; goldHistoryPublic: boolean
  table: string; ownedTables: string[]; cardBack: string; ownedBacks: string[]
  avatarFrame: string; ownedFrames: string[]; statsPublic: boolean; invisibleMode: boolean
  avatarType: string; avatarEmoji: string; avatarImage: string
  xp: number; level: number
  gamesPlayed: number; gamesWon: number
  rondaPlayed: number; rondaWon: number
  dijoujPlayed: number; dijoujWon: number
  country: string; city: string
}

/**
 * Guard anti-course : onAuthStateChanged (firebase/auth) peut émettre plusieurs
 * fois de suite pendant le démarrage (session mise en cache puis revalidée),
 * chaque fois avec un NOUVEL objet User — donc useFirebaseProfileSync (dont
 * l'effet dépend de [user] par égalité de référence) peut relancer
 * createOrUpdateUser en parallèle pour le même uid. Si les deux appels lisent
 * le doc AVANT que l'un des deux ait fini de l'écrire, les deux verront
 * !snap.exists() et généreront CHACUN leur propre suffixe (dernier setDoc
 * gagnant) — c'est ce qui produit un nouveau suffixe à chaque connexion.
 * On fait donc partager le même appel en cours pour un uid donné.
 */
const pendingCreateOrUpdate = new Map<string, Promise<CreateOrUpdateUserResult>>()

export function createOrUpdateUser(user: User, local: LocalProfileSeed): Promise<CreateOrUpdateUserResult> {
  const existing = pendingCreateOrUpdate.get(user.uid)
  if (existing) return existing
  const p = createOrUpdateUserInner(user, local).finally(() => {
    pendingCreateOrUpdate.delete(user.uid)
  })
  pendingCreateOrUpdate.set(user.uid, p)
  return p
}

/**
 * Crée le profil Firebase au premier login (en reprenant le profil local), sinon
 * met à jour lastSeen. Retourne username + gold + usernameChanges Firebase.
 * Au premier login, si le username local est déjà pris, ajoute un suffixe numérique.
 */
async function createOrUpdateUserInner(
  user: User,
  local: LocalProfileSeed,
): Promise<CreateOrUpdateUserResult> {
  const ref = userRef(user.uid)
  // getDoc() peut répondre depuis le cache local (mémoire ou IndexedDB selon
  // la plateforme) si le serveur ne répond pas assez vite ou si le cache n'a
  // pas encore été invalidé — un faux `exists(): false` ici déclenche à tort
  // la branche "nouveau compte" (regénération de username avec suffixe) pour
  // un compte qui existe pourtant bel et bien côté serveur. On force donc une
  // lecture serveur pour CETTE vérification précise, quitte à retomber sur le
  // cache seulement si l'appareil est réellement hors-ligne.
  let snap
  try {
    snap = await getDocFromServer(ref)
  } catch {
    snap = await getDoc(ref)
  }
  if (!snap.exists()) {
    // Document inexistant → premier login : on génère un username unique une fois.
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
      invisibleMode: false,
      table: local.table,
      ownedTables: local.ownedTables,
      cardBack: local.cardBack,
      ownedBacks: local.ownedBacks,
      avatarFrame: local.avatarFrame,
      ownedFrames: local.ownedFrames,
      avatarType:  local.avatarType  ?? 'initial',
      avatarEmoji: local.avatarEmoji ?? '',
      avatarImage: local.avatarImage ?? '',
      referralUsed: false,
      referredBy: null,
      referralCount: 0,
      xp: local.xp ?? 0,
      level: local.level ?? 1,
      country: local.country ?? '',
      city: local.city ?? '',
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
      invisibleMode: false,
      avatarType:  local.avatarType  ?? 'initial',
      avatarEmoji: local.avatarEmoji ?? '',
      avatarImage: local.avatarImage ?? '',
      xp: local.xp ?? 0, level: local.level ?? 1,
      gamesPlayed: local.gamesPlayed, gamesWon: local.gamesWon,
      rondaPlayed: local.rondaPlayed, rondaWon: local.rondaWon,
      dijoujPlayed: local.dijoujPlayed, dijoujWon: local.dijoujWon,
      country: local.country ?? '', city: local.city ?? '',
    }
  }

  // Document existant → on NE régénère JAMAIS le username : Firestore fait autorité.
  // On ne relit QUE data.username ici — jamais local.username — pour ne jamais
  // réintroduire un suffixe aléatoire une fois le document créé. .trim() en plus
  // du falsy-check : un champ blanc ("   ") ne doit pas non plus faire retomber
  // sur local.username, qui pourrait lui-même être périmé côté appareil.
  const data = snap.data()
  const existingUsername = (typeof data.username === 'string' && data.username.trim())
    ? (data.username as string)
    : local.username
  await updateDoc(ref, { lastSeen: serverTimestamp() })
  return {
    username: existingUsername,
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
    invisibleMode: typeof data.invisibleMode === 'boolean' ? (data.invisibleMode as boolean) : false,
    avatarType:  (data.avatarType  as string) ?? 'initial',
    avatarEmoji: (data.avatarEmoji as string) ?? '',
    avatarImage: (data.avatarImage as string) ?? '',
    xp:    typeof data.xp === 'number' ? (data.xp as number) : 0,
    level: typeof data.level === 'number' ? (data.level as number) : 1,
    // Firestore fait autorité pour les stats aussi : ne jamais relire local.X ici
    // (le profil local peut être à 0 juste après un logout/resetProfile()).
    gamesPlayed:  typeof data.gamesPlayed === 'number'  ? (data.gamesPlayed as number)  : local.gamesPlayed,
    gamesWon:     typeof data.gamesWon === 'number'     ? (data.gamesWon as number)     : local.gamesWon,
    rondaPlayed:  typeof data.rondaPlayed === 'number'  ? (data.rondaPlayed as number)  : local.rondaPlayed,
    rondaWon:     typeof data.rondaWon === 'number'     ? (data.rondaWon as number)     : local.rondaWon,
    dijoujPlayed: typeof data.dijoujPlayed === 'number' ? (data.dijoujPlayed as number) : local.dijoujPlayed,
    dijoujWon:    typeof data.dijoujWon === 'number'    ? (data.dijoujWon as number)    : local.dijoujWon,
    country: (data.country as string) ?? local.country ?? '',
    city:    (data.city as string)    ?? local.city    ?? '',
  }
}

/** Active/désactive la visibilité publique des statistiques. */
export async function updateStatsPublic(uid: string, value: boolean): Promise<void> {
  await updateDoc(userRef(uid), { statsPublic: value })
}

/** Active/désactive le mode invisible (masque isOnline/gameStatus aux autres joueurs). */
export async function updateInvisibleMode(uid: string, invisible: boolean): Promise<void> {
  await updateDoc(userRef(uid), { invisibleMode: invisible })
}

/** Met à jour le username et usernameLower dans Firestore. */
export async function updateUsername(uid: string, username: string): Promise<void> {
  await updateDoc(userRef(uid), { username, usernameLower: username.toLowerCase() })
}

/** Met à jour le gold dans Firestore. */
export async function updateGold(uid: string, gold: number): Promise<void> {
  await updateDoc(userRef(uid), { gold })
}

/** Met à jour le pays/ville dans Firestore (classement géographique). */
export async function updateLocation(uid: string, country: string, city: string): Promise<void> {
  await updateDoc(userRef(uid), { country, city })
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
    isBot: (data.isBot as boolean) ?? false,
    currentStreak: (data.currentStreak as number) ?? 0,
    friendCount: (data.friendCount as number) ?? 0,
    trophies: Array.isArray(data.trophies) ? (data.trophies as string[]) : [],
    country: (data.country as string) ?? '',
    city: (data.city as string) ?? '',
  }
}

/**
 * Top N joueurs triés par un champ numérique décroissant (classements globaux
 * de TrophiesScreen). Une seule condition orderBy() par requête — pas de
 * where() combiné, donc pas d'index composite Firestore à créer.
 *
 * Note : les documents n'ayant jamais eu ce champ écrit sont exclus par
 * Firestore (orderBy ne renvoie que les docs où le champ existe). Pour
 * `currentStreak`, champ tout juste introduit, ça veut dire que les comptes
 * existants n'apparaîtront qu'après leur prochaine réclamation du bonus
 * journalier (voir useDailyBonus.ts) — pas un bug, juste l'absence de
 * rétro-remplissage historique. Même chose pour `friendCount` (nouveau champ,
 * incrémenté seulement à partir des prochains accepteFriendRequest/removeFriend).
 */
export async function getTopUsers(
  field: 'level' | 'gold' | 'gamesWon' | 'currentStreak' | 'gamesPlayed' | 'friendCount', count = 50,
): Promise<UserDoc[]> {
  const q = query(collection(db, 'users'), orderBy(field, 'desc'), limit(count))
  const res = await getDocs(q)
  return res.docs.map((d) => toUserDoc(d.id, d.data()))
}

/** Lundi 00:00 UTC de la semaine courante (même formule que le serveur, voir
 * ronda-server/src/db/queries.ts mondayUTC/currentWeekStart). */
function weeklyMondayUTC(): string {
  const d = new Date()
  const day = d.getUTCDay()
  const shift = day === 0 ? -6 : 1 - day
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + shift))
  return monday.toISOString().slice(0, 10)
}

/** Or misé cette semaine par un joueur donné (0 s'il n'a encore rien misé). */
export async function getWeeklyWagered(username: string): Promise<number> {
  const week = weeklyMondayUTC()
  const [ronda, dijouj] = await Promise.all([
    getDoc(doc(db, 'weekly_scores', `${week}_${username}_ronda`)),
    getDoc(doc(db, 'weekly_scores', `${week}_${username}_dijouj`)),
  ])
  return ((ronda.data()?.gold as number) ?? 0) + ((dijouj.data()?.gold as number) ?? 0)
}

export interface WeeklyWagerEntry {
  uid:         string
  username:    string
  avatarType:  string
  avatarEmoji: string
  avatarImage: string
  gold:        number
}

/**
 * Top N joueurs par or misé cette semaine, tous jeux et ligues confondus
 * (TrophiesScreen — distinct du classement hebdo par ligue de
 * LeaderboardScreen). weekly_scores n'a qu'un `username`, pas d'uid : on
 * résout le profil de chaque top joueur via searchUserByUsername, comme le
 * fait déjà LeaderboardScreen pour ses lignes cliquables.
 */
export async function getWeeklyWageredLeaderboard(count = 50): Promise<WeeklyWagerEntry[]> {
  const week = weeklyMondayUTC()
  const snap = await getDocs(query(collection(db, 'weekly_scores'), where('week', '==', week)))
  const totals = new Map<string, number>()
  for (const d of snap.docs) {
    const data = d.data() as { username: string; gold?: number }
    totals.set(data.username, (totals.get(data.username) ?? 0) + (data.gold ?? 0))
  }
  const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, count)
  const profiles = await Promise.all(top.map(([username]) => searchUserByUsername(username)))
  return top.map(([username, gold], i) => {
    const p = profiles[i]
    return {
      uid: p?.uid ?? username,
      username,
      avatarType:  p?.avatarType  ?? 'initial',
      avatarEmoji: p?.avatarEmoji ?? '',
      avatarImage: p?.avatarImage ?? '',
      gold,
    }
  })
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

/** Synchronise le streak de connexion journalière (voir useDailyBonus.ts). */
export async function updateStreak(uid: string, streak: number): Promise<void> {
  await updateDoc(userRef(uid), { currentStreak: streak })
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

/**
 * NOTE VISIBILITÉ : stocké comme un champ ordinaire sur users/{uid}, dont la
 * règle Firestore existante autorise déjà la lecture à tout utilisateur
 * authentifié (nécessaire pour la recherche de pseudo, les profils publics,
 * le classement…). Un champ ne peut pas être restreint à "mes amis
 * seulement" sans que le DOCUMENT entier le soit — donc, avec les règles
 * actuelles, gameStatus est en pratique visible par n'importe quel compte
 * connecté, pas uniquement les amis. Le rendre réellement amis-seulement
 * demanderait de le déplacer vers une sous-collection/doc séparé avec sa
 * propre règle (ex. un get() vérifiant users/{lecteur}/friends/{uid}) — hors
 * scope ici, non demandé explicitement au-delà du champ sur le doc existant.
 */
export type GameStatus =
  | null
  | 'matchmaking'      // recherche un adversaire
  | 'playing_online'   // partie en ligne vs humain
  | 'playing_bot'      // partie vs bot
  | 'playing_friend'   // partie entre amis

export interface PresenceInfo {
  isOnline:    boolean
  lastSeen:    Date | null
  gameStatus?: GameStatus
}

function toDate(ts: unknown): Date | null {
  return (ts as { toDate?: () => Date } | null)?.toDate?.() ?? null
}

function toGameStatus(v: unknown): GameStatus {
  return v === 'matchmaking' || v === 'playing_online' || v === 'playing_bot' || v === 'playing_friend'
    ? v
    : null
}

/** Met à jour le statut en ligne + lastSeen de l'utilisateur (best-effort). */
export async function setOnlineStatus(uid: string, online: boolean): Promise<void> {
  try {
    await updateDoc(userRef(uid), { isOnline: online, lastSeen: serverTimestamp() })
  } catch {
    // hors-ligne / règles — sans effet
  }
}

/** Met à jour ce que fait le joueur en ce moment (matchmaking/en partie/…),
 * ou l'efface (null → deleteField) quand il quitte l'écran/la partie. */
export async function updateGameStatus(uid: string, status: GameStatus): Promise<void> {
  try {
    await updateDoc(userRef(uid), { gameStatus: status ?? deleteField() })
  } catch {
    // hors-ligne / règles — sans effet, jamais bloquant pour le jeu
  }
}

/** Écoute en temps réel le statut d'un utilisateur. */
export function subscribeOnlineStatus(uid: string, cb: (info: PresenceInfo) => void): () => void {
  return onSnapshot(
    userRef(uid),
    (snap) => {
      const d = snap.data() ?? {}
      if (d.invisibleMode === true) { cb({ isOnline: false, lastSeen: null, gameStatus: null }); return }
      cb({ isOnline: d.isOnline === true, lastSeen: toDate(d.lastSeen), gameStatus: toGameStatus(d.gameStatus) })
    },
    () => cb({ isOnline: false, lastSeen: null, gameStatus: null }),
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
          acc[d.id] = data.invisibleMode === true
            ? { isOnline: false, lastSeen: null, gameStatus: null }
            : {
                isOnline: data.isOnline === true,
                lastSeen: toDate(data.lastSeen),
                gameStatus: toGameStatus(data.gameStatus),
              }
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
    // Compteur dénormalisé pour le classement « Plus sociable » (TrophiesScreen).
    updateDoc(userRef(myUid), { friendCount: increment(1) }),
    updateDoc(userRef(fromUid), { friendCount: increment(1) }),
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
    updateDoc(userRef(myUid), { friendCount: increment(-1) }),
    updateDoc(userRef(friendUid), { friendCount: increment(-1) }),
  ])
}

/**
 * Migration one-time : friendCount a été introduit après coup
 * (acceptFriendRequest/removeFriend l'incrémentent déjà correctement pour
 * tout NOUVEAU mouvement d'ami) — mais les amitiés acceptées AVANT son
 * ajout n'ont jamais déclenché cet increment, donc leur compteur reste à 0
 * malgré des amis bien réels. Recalcule friendCount depuis la sous-collection
 * friends, source de vérité. Appelée une fois par utilisateur au login (voir
 * useFirebaseProfileSync, gardé par la clé AsyncStorage
 * ronda_friendcount_migrated).
 */
export async function migrateFriendCounts(uid: string): Promise<void> {
  const snap = await getDocs(
    query(collection(db, 'users', uid, 'friends'), where('status', '==', 'accepted')),
  )
  await updateDoc(userRef(uid), { friendCount: snap.size })
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
      level:         (pd.level         as number) ?? 1,
      gold:          (pd.gold          as number) ?? 0,
      gamesWon:      (pd.gamesWon      as number) ?? 0,
      gamesPlayed:   (pd.gamesPlayed   as number) ?? 0,
      currentStreak: (pd.currentStreak as number) ?? 0,
      friendCount:   (pd.friendCount   as number) ?? 0,
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

/** Statut de l'amitié de myUid vers targetUid (null si aucune relation). */
export async function getFriendStatus(
  myUid: string, targetUid: string,
): Promise<FriendDoc['status'] | null> {
  const snap = await getDoc(friendRef(myUid, targetUid))
  if (!snap.exists()) return null
  return (snap.data().status as FriendDoc['status']) ?? null
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

/** Charge une fois les messages d'un chat (triés chronologiquement). Pour le cache. */
export async function getChatMessages(chatId: string): Promise<MessageDoc[]> {
  const snap = await getDocs(query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('createdAt', 'asc'),
  ))
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      fromUid: data.fromUid as string,
      text: data.text as string,
      createdAt: (data.createdAt as { toDate?: () => Date } | null)?.toDate?.() ?? null,
    }
  })
}

/** Remet à 0 le compteur de non-lus pour myUid dans ce chat. */
export function markChatRead(chatId: string, myUid: string): Promise<void> {
  return updateDoc(doc(db, 'chats', chatId), {
    [`unread_${myUid}`]: 0,
  }).catch(() => {})
}

/** Aperçu d'une conversation pour l'écran Messages. */
export interface ChatPreview {
  chatId:       string
  participants: string[]
  lastMessage:  string
  updatedAt:    Date | null
  unreadCount:  number
}

/**
 * Charge toutes les conversations d'un utilisateur (50 max), triées par date du
 * dernier message décroissante. Champs réels du doc chat : lastText / lastAt /
 * unread_{uid}. Repli sans orderBy (+ tri client) si l'index composite manque.
 */
export async function getUserChats(uid: string): Promise<ChatPreview[]> {
  const toPreview = (d: { id: string; data: () => Record<string, unknown> }): ChatPreview => {
    const data = d.data()
    return {
      chatId:       d.id,
      participants: (data.participants as string[]) ?? [],
      lastMessage:  (data.lastText as string) ?? '',
      updatedAt:    (data.lastAt as { toDate?: () => Date } | null)?.toDate?.() ?? null,
      unreadCount:  (data[`unread_${uid}`] as number) ?? 0,
    }
  }
  const base = collection(db, 'chats')
  try {
    const snap = await getDocs(query(
      base,
      where('participants', 'array-contains', uid),
      orderBy('lastAt', 'desc'),
      limit(50),
    ))
    return snap.docs.map(toPreview)
  } catch {
    // Index composite absent → requête simple + tri client-side.
    const snap = await getDocs(query(base, where('participants', 'array-contains', uid), limit(50)))
    return snap.docs
      .map(toPreview)
      .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
  }
}

/** Supprime une conversation : tous les messages puis le doc chat. */
export async function deleteChat(chatId: string): Promise<void> {
  const msgs = await getDocs(collection(db, 'chats', chatId, 'messages'))
  await Promise.all(msgs.docs.map((d) => deleteDoc(d.ref)))
  await deleteDoc(doc(db, 'chats', chatId))
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

import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, limit, serverTimestamp,
  onSnapshot, increment, writeBatch, orderBy,
} from 'firebase/firestore'
import { firebaseApp } from './config'
import type { User } from './auth'

export const db = getFirestore(firebaseApp)

export interface UserDoc {
  uid: string
  username: string
  usernameLower: string
  gold: number
  gamesPlayed: number
  gamesWon: number
  usernameChanges: number
  avatarType: string
  avatarEmoji: string
  avatarImage: string
}

export interface FriendDoc {
  uid: string
  username: string
  status: 'pending' | 'accepted'
  avatarType: string
  avatarEmoji: string
  avatarImage: string
}

/** Profil local utilisé pour initialiser le document Firebase au 1er login. */
export interface LocalProfileSeed {
  username: string
  gold: number
  gamesPlayed: number
  gamesWon: number
  usernameChanges: number
}

function userRef(uid: string) {
  return doc(db, 'users', uid)
}

async function getUsername(uid: string): Promise<string> {
  const snap = await getDoc(userRef(uid))
  return (snap.exists() ? (snap.data().username as string) : '') || 'Joueur'
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
): Promise<{ username: string; gold: number; usernameChanges: number }> {
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
      usernameChanges: local.usernameChanges,
      email: user.email ?? null,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
    })
    return { username: finalUsername, gold: local.gold, usernameChanges: local.usernameChanges }
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
  }
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
  const data = d.data()
  return {
    uid: d.id,
    username: data.username as string,
    usernameLower: (data.usernameLower as string) ?? (data.username as string).toLowerCase(),
    gold: (data.gold as number) ?? 0,
    gamesPlayed: (data.gamesPlayed as number) ?? 0,
    gamesWon: (data.gamesWon as number) ?? 0,
    usernameChanges: (data.usernameChanges as number) ?? 0,
    avatarType: (data.avatarType as string) ?? 'initial',
    avatarEmoji: (data.avatarEmoji as string) ?? '',
    avatarImage: (data.avatarImage as string) ?? '',
  }
}

// ── Amis (sous-collection users/{uid}/friends/{friendUid}) ─────────────────────

function friendRef(ownerUid: string, friendUid: string) {
  return doc(db, 'users', ownerUid, 'friends', friendUid)
}

/** Envoie une demande d'ami : crée une entrée 'pending' chez la cible. */
export async function sendFriendRequest(myUid: string, targetUid: string): Promise<void> {
  if (myUid === targetUid) throw new Error("Impossible de s'ajouter soi-même.")

  // Vérifie qu'une demande n'existe pas déjà (évite l'erreur de doublons).
  const existing = await getDoc(friendRef(targetUid, myUid))
  if (existing.exists()) throw new Error('already_sent')

  const myUsername = await getUsername(myUid)
  try {
    await setDoc(friendRef(targetUid, myUid), {
      uid: myUid,
      username: myUsername,
      status: 'pending',
      createdAt: serverTimestamp(),
    })
  } catch (e) {
    // Aide au diagnostic : log l'erreur Firestore réelle dans la console
    console.error('[sendFriendRequest] Firestore error:', e)
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
  const chatId = getChatId(myUid, friendUid)
  const chatRef = doc(db, 'chats', chatId)
  const msgRef = doc(collection(db, 'chats', chatId, 'messages'))
  const chatSnap = await getDoc(chatRef)
  const batch = writeBatch(db)
  if (!chatSnap.exists()) {
    batch.set(chatRef, {
      participants: [myUid, friendUid],
      [`unread_${myUid}`]: 0,
      [`unread_${friendUid}`]: 1,
      lastText: text,
      lastFrom: myUid,
      lastAt: serverTimestamp(),
    })
  } else {
    batch.update(chatRef, {
      [`unread_${friendUid}`]: increment(1),
      lastText: text,
      lastFrom: myUid,
      lastAt: serverTimestamp(),
    })
  }
  batch.set(msgRef, { fromUid: myUid, text, createdAt: serverTimestamp() })
  await batch.commit()
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

/** Envoie une invitation de partie à un ami. Retourne l'ID du document créé. */
export async function sendGameInvite(
  fromUid: string,
  fromName: string,
  toUid: string,
  game: 'ronda' | 'dijouj',
  betAmount: number,
): Promise<string> {
  const ref = doc(collection(db, 'gameInvites'))
  await setDoc(ref, { fromUid, fromName, toUid, game, betAmount, status: 'pending', createdAt: serverTimestamp() })
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

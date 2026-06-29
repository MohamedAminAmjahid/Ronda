import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, limit, serverTimestamp,
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
}

export interface FriendDoc {
  uid: string
  username: string
  status: 'pending' | 'accepted'
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
  }
}

// ── Amis (sous-collection users/{uid}/friends/{friendUid}) ─────────────────────

function friendRef(ownerUid: string, friendUid: string) {
  return doc(db, 'users', ownerUid, 'friends', friendUid)
}

/** Envoie une demande d'ami : crée une entrée 'pending' chez la cible. */
export async function sendFriendRequest(myUid: string, targetUid: string): Promise<void> {
  if (myUid === targetUid) throw new Error("Impossible de s'ajouter soi-même.")
  const myUsername = await getUsername(myUid)
  await setDoc(friendRef(targetUid, myUid), {
    uid: myUid,
    username: myUsername,
    status: 'pending',
    createdAt: serverTimestamp(),
  })
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

function readFriends(ownerUid: string, status: FriendDoc['status']): Promise<FriendDoc[]> {
  const q = query(collection(db, 'users', ownerUid, 'friends'), where('status', '==', status))
  return getDocs(q).then((res) =>
    res.docs.map((d) => {
      const data = d.data()
      return { uid: data.uid as string, username: data.username as string, status }
    }),
  )
}

/** Liste des amis acceptés. */
export function getFriends(uid: string): Promise<FriendDoc[]> {
  return readFriends(uid, 'accepted')
}

/** Demandes d'amis en attente (entrantes). */
export function getPendingRequests(uid: string): Promise<FriendDoc[]> {
  return readFriends(uid, 'pending')
}

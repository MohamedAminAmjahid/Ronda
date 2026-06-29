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
  gold: number
  gamesPlayed: number
  gamesWon: number
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
}

function userRef(uid: string) {
  return doc(db, 'users', uid)
}

async function getUsername(uid: string): Promise<string> {
  const snap = await getDoc(userRef(uid))
  return (snap.exists() ? (snap.data().username as string) : '') || 'Joueur'
}

/**
 * Crée le profil Firebase au premier login (en reprenant le profil local), sinon
 * met à jour lastSeen. Retourne username + gold Firebase (à synchroniser localement).
 */
export async function createOrUpdateUser(user: User, local: LocalProfileSeed): Promise<{ username: string; gold: number }> {
  const ref = userRef(user.uid)
  const snap = await getDoc(ref)

  if (!snap.exists()) {
    await setDoc(ref, {
      username: local.username,
      gold: local.gold,
      gamesPlayed: local.gamesPlayed,
      gamesWon: local.gamesWon,
      email: user.email ?? null,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
    })
    return { username: local.username, gold: local.gold }
  }

  const data = snap.data()
  await updateDoc(ref, { lastSeen: serverTimestamp() })
  return {
    username: (data.username as string) || local.username,
    gold: typeof data.gold === 'number' ? (data.gold as number) : local.gold,
  }
}

/** Met à jour le username dans Firestore. */
export async function updateUsername(uid: string, username: string): Promise<void> {
  await updateDoc(userRef(uid), { username })
}

/** Met à jour le gold dans Firestore. */
export async function updateGold(uid: string, gold: number): Promise<void> {
  await updateDoc(userRef(uid), { gold })
}

/** Recherche un utilisateur par username (match exact). null si introuvable. */
export async function searchUserByUsername(username: string): Promise<UserDoc | null> {
  const q = query(collection(db, 'users'), where('username', '==', username.trim()), limit(1))
  const res = await getDocs(q)
  if (res.empty) return null
  const d = res.docs[0]
  const data = d.data()
  return {
    uid: d.id,
    username: data.username as string,
    gold: (data.gold as number) ?? 0,
    gamesPlayed: (data.gamesPlayed as number) ?? 0,
    gamesWon: (data.gamesWon as number) ?? 0,
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

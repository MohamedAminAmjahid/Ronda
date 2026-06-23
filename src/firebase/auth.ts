import { useEffect, useState } from 'react'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged as fbOnAuthStateChanged,
  type User,
} from 'firebase/auth'
import { firebaseApp } from './config'

export const auth = getAuth(firebaseApp)

const googleProvider = new GoogleAuthProvider()

/** Connexion Google (web : popup). Retourne l'utilisateur connecté. */
export async function signInWithGoogle(): Promise<User> {
  const cred = await signInWithPopup(auth, googleProvider)
  return cred.user
}

export function signOut(): Promise<void> {
  return fbSignOut(auth)
}

/** Écoute les changements d'état d'auth. Retourne la fonction de désabonnement. */
export function onAuthStateChanged(cb: (user: User | null) => void): () => void {
  return fbOnAuthStateChanged(auth, cb)
}

/** Hook React : { user, loading }. user = Firebase User ou null. */
export function useAuth(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(auth.currentUser)
  const [loading, setLoading] = useState(auth.currentUser === null)

  useEffect(() => {
    const unsub = onAuthStateChanged((u) => {
      setUser(u)
      setLoading(false)
    })
    return unsub
  }, [])

  return { user, loading }
}

export type { User }

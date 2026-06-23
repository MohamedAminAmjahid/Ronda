import { useEffect } from 'react'
import { useAuth } from './auth'
import { createOrUpdateUser } from './firestore'
import { getProfile, loadProfile, setUsername } from '../profile/profile'

/**
 * Synchronise le username local ↔ Firebase à la connexion :
 *  - 1er login → le document Firebase reprend le username local.
 *  - compte existant → on charge le username Firebase dans le store local.
 * Monté une fois au niveau racine (_layout) ; couvre login explicite et session
 * persistée (rechargement web).
 */
export function useFirebaseProfileSync(): void {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    let cancelled = false
    void (async () => {
      try {
        await loadProfile()
        const p = getProfile()
        const { username } = await createOrUpdateUser(user, {
          username: p.username,
          gold: p.gold,
          gamesPlayed: p.gamesPlayed,
          gamesWon: p.gamesWon,
        })
        if (!cancelled && username) setUsername(username)
      } catch {
        // hors-ligne / règles Firestore — on garde le profil local
      }
    })()
    return () => { cancelled = true }
  }, [user])
}

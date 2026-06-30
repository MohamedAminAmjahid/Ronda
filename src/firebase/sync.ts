import { useEffect } from 'react'
import { useAuth } from './auth'
import { createOrUpdateUser } from './firestore'
import { getProfile, loadProfile, setUsername, setGold, setUsernameChanges } from '../profile/profile'

/**
 * Synchronise username, gold et usernameChanges local ↔ Firebase à la connexion :
 *  - 1er login → le document Firebase reprend le profil local (avec résolution de
 *    conflit de username si nécessaire).
 *  - compte existant → on charge les valeurs Firebase dans le store local.
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
        console.log('[sync] login uid:', user.uid, '| username local:', p.username)
        const { username, gold, usernameChanges } = await createOrUpdateUser(user, {
          username: p.username,
          gold: p.gold,
          gamesPlayed: p.gamesPlayed,
          gamesWon: p.gamesWon,
          rondaPlayed: p.rondaPlayed,
          rondaWon: p.rondaWon,
          dijoujPlayed: p.dijoujPlayed,
          dijoujWon: p.dijoujWon,
          usernameChanges: p.usernameChanges,
        })
        console.log('[sync] Firebase → username:', username, '| gold:', gold, '| usernameChanges:', usernameChanges)
        if (!cancelled) {
          if (username) setUsername(username)
          setGold(gold)
          setUsernameChanges(usernameChanges)
        }
      } catch (err) {
        console.warn('[sync] hors-ligne ou règles Firestore :', err)
        // on garde le profil local
      }
    })()
    return () => { cancelled = true }
  }, [user])
}

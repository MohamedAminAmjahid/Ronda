import { useEffect } from 'react'
import { AppState, Platform, type AppStateStatus } from 'react-native'
import { useAuth } from '../firebase/auth'
import { setOnlineStatus } from '../firebase/firestore'
import { getProfile, subscribeProfile } from '../profile/profile'

const HEARTBEAT_MS = 2 * 60 * 1000  // 2 minutes

/**
 * Maintient le statut de présence de l'utilisateur connecté :
 * - login → en ligne, logout/unmount → hors-ligne
 * - AppState background/inactive → hors-ligne, active → en ligne
 * - web beforeunload → hors-ligne
 * - heartbeat lastSeen toutes les 2 min tant que l'app est active
 * - mode invisible (profile.invisibleMode) → toujours publié hors-ligne
 */
export function usePresence(): void {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    const uid = user.uid

    const pushStatus = (active: boolean) => {
      void setOnlineStatus(uid, active && !getProfile().invisibleMode)
    }

    pushStatus(true)

    const heartbeat = setInterval(() => {
      if (AppState.currentState === 'active') pushStatus(true)
    }, HEARTBEAT_MS)

    const appSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      pushStatus(next === 'active')
    })

    // Bascule du mode invisible en cours de session : re-publie aussitôt le
    // statut, sans attendre le prochain heartbeat ou changement d'AppState.
    let lastInvisible = getProfile().invisibleMode
    const unsubProfile = subscribeProfile((p) => {
      if (p.invisibleMode === lastInvisible) return
      lastInvisible = p.invisibleMode
      if (AppState.currentState === 'active') pushStatus(true)
    })

    let onUnload: (() => void) | undefined
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      onUnload = () => { void setOnlineStatus(uid, false) }
      window.addEventListener('beforeunload', onUnload)
    }

    return () => {
      clearInterval(heartbeat)
      appSub.remove()
      unsubProfile()
      if (onUnload && typeof window !== 'undefined') window.removeEventListener('beforeunload', onUnload)
      void setOnlineStatus(uid, false)
    }
  }, [user])
}

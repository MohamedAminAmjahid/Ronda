import { useEffect } from 'react'
import { AppState, Platform, type AppStateStatus } from 'react-native'
import { useAuth } from '../firebase/auth'
import { setOnlineStatus } from '../firebase/firestore'

const HEARTBEAT_MS = 2 * 60 * 1000  // 2 minutes

/**
 * Maintient le statut de présence de l'utilisateur connecté :
 * - login → en ligne, logout/unmount → hors-ligne
 * - AppState background/inactive → hors-ligne, active → en ligne
 * - web beforeunload → hors-ligne
 * - heartbeat lastSeen toutes les 2 min tant que l'app est active
 */
export function usePresence(): void {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    const uid = user.uid

    void setOnlineStatus(uid, true)

    const heartbeat = setInterval(() => {
      if (AppState.currentState === 'active') void setOnlineStatus(uid, true)
    }, HEARTBEAT_MS)

    const appSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      void setOnlineStatus(uid, next === 'active')
    })

    let onUnload: (() => void) | undefined
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      onUnload = () => { void setOnlineStatus(uid, false) }
      window.addEventListener('beforeunload', onUnload)
    }

    return () => {
      clearInterval(heartbeat)
      appSub.remove()
      if (onUnload && typeof window !== 'undefined') window.removeEventListener('beforeunload', onUnload)
      void setOnlineStatus(uid, false)
    }
  }, [user])
}

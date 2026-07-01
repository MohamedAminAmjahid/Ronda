import { useEffect, useState } from 'react'
import NetInfo from '@react-native-community/netinfo'

/**
 * Renvoie true quand l'appareil est hors-ligne (isConnected === false).
 * Un état inconnu (null) est traité comme en ligne pour ne pas bloquer à tort.
 * Sur web, NetInfo s'appuie sur navigator.onLine.
 */
export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false)
    })
    void NetInfo.fetch().then((state) => setOffline(state.isConnected === false))
    return () => unsub()
  }, [])

  return offline
}

import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router, type Href } from 'expo-router'
import { MenuScreen } from '../ui/MenuScreen'
import { loadLang } from '../i18n/useI18n'

const REFERRAL_CODE_KEY = 'ronda_referral_code'

/** Capture le paramètre ?ref= de l'URL (web) pour un parrainage différé. */
function captureReferral(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return
  try {
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref && ref.trim()) {
      void AsyncStorage.setItem(REFERRAL_CODE_KEY, ref.trim()).catch(() => {})
    }
  } catch {
    // URL indisponible — sans effet
  }
}

export default function Index() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    captureReferral()
    void loadLang().then(({ stored }) => {
      if (stored) setReady(true)
      else router.replace('/lang-picker' as Href)
    })
  }, [])

  if (!ready) return null

  return (
    <MenuScreen
      onLeaderboard={() => router.push('/leaderboard' as Href)}
      onRules={() => router.push('/rules' as Href)}
      onCredits={() => router.push('/credits' as Href)}
    />
  )
}

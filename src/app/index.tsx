import { useEffect, useState } from 'react'
import { router, type Href } from 'expo-router'
import { MenuScreen } from '../ui/MenuScreen'
import { loadLang } from '../i18n/useI18n'

export default function Index() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
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

import { router, useLocalSearchParams } from 'expo-router'
import { OnlineScreen } from '../ui/OnlineScreen'

export default function OnlineRoute() {
  const { mode, code } = useLocalSearchParams<{ mode?: string; code?: string }>()
  return (
    <OnlineScreen
      onBack={() => router.back()}
      mode={mode === 'friend' ? 'friend' : 'quick'}
      initialCode={code || undefined}
    />
  )
}

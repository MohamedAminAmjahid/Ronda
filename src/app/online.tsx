import { router, useLocalSearchParams } from 'expo-router'
import { OnlineScreen } from '../ui/OnlineScreen'

export default function OnlineRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>()
  return (
    <OnlineScreen
      onBack={() => router.back()}
      mode={mode === 'friend' ? 'friend' : 'quick'}
    />
  )
}

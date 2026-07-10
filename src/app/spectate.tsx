import { router, useLocalSearchParams } from 'expo-router'
import { SpectateScreen } from '../ui/SpectateScreen'

export default function SpectateRoute() {
  const { code } = useLocalSearchParams<{ code?: string }>()
  if (!code) { router.back(); return null }
  return <SpectateScreen code={code} onBack={() => router.push('/')} />
}

import { router, useLocalSearchParams } from 'expo-router'
import { OnlineScreen } from '../ui/OnlineScreen'

export default function OnlineRoute() {
  const { mode, code, tournamentMatchId, tCreator, tFinal } = useLocalSearchParams<{
    mode?: string; code?: string
    tournamentMatchId?: string; tCreator?: string; tFinal?: string
  }>()
  return (
    <OnlineScreen
      onBack={() => router.back()}
      mode={mode === 'friend' ? 'friend' : 'quick'}
      initialCode={code || undefined}
      tournamentMatchId={tournamentMatchId || undefined}
      tournamentAsCreator={tCreator === '1'}
      tournamentIsFinal={tFinal === '1'}
    />
  )
}

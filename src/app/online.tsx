import { router, useLocalSearchParams } from 'expo-router'
import { OnlineScreen } from '../ui/OnlineScreen'

export default function OnlineRoute() {
  const { mode, code, tournamentMatchId, tp1, tp2, tFinal } = useLocalSearchParams<{
    mode?: string; code?: string
    tournamentMatchId?: string; tp1?: string; tp2?: string; tFinal?: string
  }>()
  return (
    <OnlineScreen
      onBack={() => router.back()}
      mode={mode === 'friend' ? 'friend' : 'quick'}
      initialCode={code || undefined}
      tournamentMatchId={tournamentMatchId || undefined}
      tournamentPlayer1={tp1 || undefined}
      tournamentPlayer2={tp2 || undefined}
      tournamentIsFinal={tFinal === '1'}
    />
  )
}

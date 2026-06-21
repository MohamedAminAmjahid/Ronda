import { router, useLocalSearchParams } from 'expo-router'
import { Lobby2v2Screen } from '../ui/Lobby2v2Screen'

export default function Lobby2v2Route() {
  const { pseudo, code } = useLocalSearchParams<{ pseudo?: string; code?: string }>()
  return (
    <Lobby2v2Screen
      onBack={() => router.back()}
      pseudo={pseudo ?? 'Joueur'}
      code={code || undefined}
    />
  )
}

import { router, useLocalSearchParams } from 'expo-router'
import { GameScreen } from '../ui/GameScreen'

export default function GameRoute() {
  const { botName, botEmoji } = useLocalSearchParams<{ botName?: string; botEmoji?: string }>()
  const opponentName = botName ? `${botEmoji ?? ''} ${botName}`.trim() : undefined
  return <GameScreen onBack={() => router.back()} opponentName={opponentName} />
}

import { router, useLocalSearchParams } from 'expo-router'
import { GameScreen } from '../ui/GameScreen'

export default function GameRoute() {
  const { botName, botEmoji, bet } = useLocalSearchParams<{ botName?: string; botEmoji?: string; bet?: string }>()
  const opponentName = botName ? `${botEmoji ?? ''} ${botName}`.trim() : undefined
  const stakeBet = bet ? (parseInt(bet, 10) || 0) : 0
  return <GameScreen onBack={() => router.back()} opponentName={opponentName} stakeBet={stakeBet} />
}

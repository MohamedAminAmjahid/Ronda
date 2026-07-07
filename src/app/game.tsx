import { router, useLocalSearchParams } from 'expo-router'
import { GameScreen } from '../ui/GameScreen'

export default function GameRoute() {
  const { botName, botEmoji, botAvatarIdx, botFemale, bet } = useLocalSearchParams<{
    botName?: string; botEmoji?: string; botAvatarIdx?: string; botFemale?: string; bet?: string
  }>()
  const opponentName = botName ? `${botEmoji ?? ''} ${botName}`.trim() : undefined
  const stakeBet = bet ? (parseInt(bet, 10) || 0) : 0
  const hasBotAvatar = botAvatarIdx !== undefined && botFemale !== undefined
  return (
    <GameScreen
      onBack={() => router.back()}
      opponentName={opponentName}
      stakeBet={stakeBet}
      botAvatarIdx={hasBotAvatar ? (parseInt(botAvatarIdx, 10) || 0) : undefined}
      botFemale={hasBotAvatar ? botFemale === '1' : undefined}
    />
  )
}

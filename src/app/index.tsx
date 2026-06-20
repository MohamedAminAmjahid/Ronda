import { router, type Href } from 'expo-router'
import { MenuScreen } from '../ui/MenuScreen'

// '/game2v2' est une route fraîchement ajoutée : les types expo-router
// (.expo/types) se régénèrent au prochain `expo start`. Cast en attendant.
const GAME_2V2: Href = '/game2v2' as Href

export default function Index() {
  return (
    <MenuScreen
      onPlayVsAi={() => router.push('/game')}
      onPlay2v2={() => router.push(GAME_2V2)}
      onRules={() => router.push('/rules')}
      onCredits={() => router.push('/credits')}
    />
  )
}

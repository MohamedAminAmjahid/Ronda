import { router, type Href } from 'expo-router'
import { MenuScreen } from '../ui/MenuScreen'

// Routes fraîchement ajoutées : les types expo-router (.expo/types) se
// régénèrent au prochain `expo start`. Cast en attendant.
const GAME_2V2: Href = '/game2v2' as Href
const ONLINE: Href = '/online' as Href
const ONLINE_FRIEND: Href = '/online?mode=friend' as Href

export default function Index() {
  return (
    <MenuScreen
      onPlayVsAi={() => router.push('/game')}
      onPlay2v2={() => router.push(GAME_2V2)}
      onPlayOnline={() => router.push(ONLINE)}
      onPlayFriend={() => router.push(ONLINE_FRIEND)}
      onRules={() => router.push('/rules')}
      onCredits={() => router.push('/credits')}
    />
  )
}

import { router, type Href } from 'expo-router'
import { MenuScreen } from '../ui/MenuScreen'

// Routes fraîchement ajoutées : les types expo-router (.expo/types) se
// régénèrent au prochain `expo start`. Cast en attendant.
const PLAY: Href = '/play' as Href
const ONLINE: Href = '/online' as Href
const ONLINE_FRIEND: Href = '/online?mode=friend' as Href

export default function Index() {
  return (
    <MenuScreen
      onPlay={() => router.push(PLAY)}
      onPlayOnline={() => router.push(ONLINE)}
      onPlayFriend={() => router.push(ONLINE_FRIEND)}
      onRules={() => router.push('/rules')}
      onCredits={() => router.push('/credits')}
    />
  )
}

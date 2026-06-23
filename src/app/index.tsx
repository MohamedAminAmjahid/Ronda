import { router, type Href } from 'expo-router'
import { MenuScreen } from '../ui/MenuScreen'
import { useAuth } from '../firebase/auth'

// Routes fraîchement ajoutées : les types expo-router (.expo/types) se
// régénèrent au prochain `expo start`. Cast en attendant.
const PLAY: Href = '/play' as Href
const ONLINE: Href = '/online' as Href
const ONLINE_FRIEND: Href = '/online?mode=friend' as Href

export default function Index() {
  const { user } = useAuth()

  // Le jeu en ligne nécessite une connexion : sinon on passe par l'écran d'auth.
  const goOnline = () => router.push(user ? ONLINE : ('/auth?next=online' as Href))
  const goFriend = () => router.push(user ? ONLINE_FRIEND : ('/auth?next=friend' as Href))

  return (
    <MenuScreen
      onPlay={() => router.push(PLAY)}
      onPlayOnline={goOnline}
      onPlayFriend={goFriend}
      onLeaderboard={() => router.push('/leaderboard' as Href)}
      onRules={() => router.push('/rules')}
      onCredits={() => router.push('/credits')}
    />
  )
}

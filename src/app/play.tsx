import { router, type Href } from 'expo-router'
import { PlayScreen } from '../ui/PlayScreen'

// Types expo-router (.expo/types) régénérés au prochain `expo start` → cast.
const GAME: Href = '/game' as Href
const GAME_2V2: Href = '/game2v2' as Href

export default function PlayRoute() {
  return (
    <PlayScreen
      onBack={() => router.back()}
      onPlay1v1={() => router.push(GAME)}
      onPlay2v2={() => router.push(GAME_2V2)}
    />
  )
}

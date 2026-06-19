import { router } from 'expo-router'
import { MenuScreen } from '../ui/MenuScreen'

export default function Index() {
  return <MenuScreen onPlayVsAi={() => router.push('/game')} />
}

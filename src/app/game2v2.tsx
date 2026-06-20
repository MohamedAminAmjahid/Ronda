import { router } from 'expo-router'
import { GameScreen2v2 } from '../ui/GameScreen2v2'

export default function Game2v2Route() {
  return <GameScreen2v2 onBack={() => router.back()} />
}

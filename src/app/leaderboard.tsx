import { router } from 'expo-router'
import { LeaderboardScreen } from '../ui/LeaderboardScreen'

export default function LeaderboardRoute() {
  return <LeaderboardScreen onBack={() => router.back()} />
}

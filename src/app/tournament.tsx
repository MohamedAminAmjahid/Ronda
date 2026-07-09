import { router } from 'expo-router'
import { TournamentScreen } from '../ui/TournamentScreen'

export default function TournamentRoute() {
  return <TournamentScreen onBack={() => router.back()} />
}

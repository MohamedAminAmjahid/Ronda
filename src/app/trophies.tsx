import { router } from 'expo-router'
import { TrophiesScreen } from '../ui/TrophiesScreen'

export default function TrophiesRoute() {
  return <TrophiesScreen onBack={() => router.back()} />
}

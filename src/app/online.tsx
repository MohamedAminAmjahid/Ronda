import { router } from 'expo-router'
import { OnlineScreen } from '../ui/OnlineScreen'

export default function OnlineRoute() {
  return <OnlineScreen onBack={() => router.back()} />
}

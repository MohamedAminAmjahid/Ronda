import { router } from 'expo-router'
import { ReplayScreen } from '../ui/ReplayScreen'

export default function ReplayRoute() {
  return <ReplayScreen onBack={() => router.back()} />
}

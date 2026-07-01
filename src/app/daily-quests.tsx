import { router } from 'expo-router'
import { DailyQuestsScreen } from '../ui/DailyQuestsScreen'

export default function DailyQuestsRoute() {
  return <DailyQuestsScreen onBack={() => router.back()} />
}

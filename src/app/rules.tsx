import { router } from 'expo-router'
import { RulesScreen } from '../ui/RulesScreen'

export default function RulesRoute() {
  return <RulesScreen onBack={() => router.push('/')} />
}

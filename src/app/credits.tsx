import { router } from 'expo-router'
import { CreditsScreen } from '../ui/CreditsScreen'

export default function CreditsRoute() {
  return <CreditsScreen onBack={() => router.push('/')} />
}

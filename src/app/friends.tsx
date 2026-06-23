import { router } from 'expo-router'
import { FriendsScreen } from '../ui/FriendsScreen'

export default function FriendsRoute() {
  return <FriendsScreen onBack={() => router.back()} />
}

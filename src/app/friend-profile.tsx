import { router } from 'expo-router'
import { FriendProfileScreen } from '../ui/FriendProfileScreen'

export default function FriendProfileRoute() {
  return <FriendProfileScreen onBack={() => router.back()} />
}

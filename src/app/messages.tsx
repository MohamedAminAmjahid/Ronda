import { router } from 'expo-router'
import { MessagesScreen } from '../ui/MessagesScreen'

export default function MessagesRoute() {
  return <MessagesScreen onBack={() => router.back()} />
}

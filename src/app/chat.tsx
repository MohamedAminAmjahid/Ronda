import { router, useLocalSearchParams } from 'expo-router'
import { ChatScreen } from '../ui/ChatScreen'

export default function ChatRoute() {
  const { friendUid, name } = useLocalSearchParams<{ friendUid?: string; name?: string }>()
  if (!friendUid) { router.back(); return null }
  return (
    <ChatScreen
      friendUid={friendUid}
      friendName={name ?? 'Joueur'}
      onBack={() => router.back()}
    />
  )
}

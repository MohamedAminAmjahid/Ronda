import { router, useLocalSearchParams, type Href } from 'expo-router'
import { AuthScreen } from '../ui/AuthScreen'

// Destination après connexion réussie.
function destination(next?: string): Href {
  if (next === 'online') return '/online' as Href
  if (next === 'friend') return '/online?mode=friend' as Href
  if (next === 'friends') return '/friends' as Href
  return '/' as Href // connexion depuis le menu → retour au menu
}

export default function AuthRoute() {
  const { next } = useLocalSearchParams<{ next?: string }>()
  return (
    <AuthScreen
      onBack={() => router.back()}
      onSignedIn={() => router.replace(destination(next))}
    />
  )
}

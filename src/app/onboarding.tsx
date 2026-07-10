import { router, type Href } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { OnboardingScreen } from '../ui/OnboardingScreen'

const ONBOARDING_KEY = 'ronda_onboarding_done'

export default function OnboardingRoute() {
  // Marque le tutoriel comme vu (ne se réaffiche jamais) puis navigue :
  // startGame → 1re partie vs bot (/play), sinon retour à l'accueil.
  const finish = (startGame: boolean) => {
    void AsyncStorage.setItem(ONBOARDING_KEY, '1').catch(() => {})
    router.replace((startGame ? '/play' : '/') as Href)
  }
  return <OnboardingScreen onDone={finish} />
}

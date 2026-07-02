import { useEffect } from 'react'
import { Platform, I18nManager, View } from 'react-native'
import { Stack } from 'expo-router'
import { useFonts } from 'expo-font'
import { ReemKufi_700Bold } from '@expo-google-fonts/reem-kufi'
import { Cairo_400Regular, Cairo_600SemiBold } from '@expo-google-fonts/cairo'
import * as SplashScreen from 'expo-splash-screen'
import { useFirebaseProfileSync } from '../firebase/sync'
import { usePushRegistration } from '../push/push'
import { usePresence } from '../presence/usePresence'
import { useI18n } from '../i18n/useI18n'
import { BottomNav } from '../ui/BottomNav'
import { TopBar } from '../ui/TopBar'
import { DailyBonusModal } from '../ui/DailyBonusModal'
import { IncomingInviteModal } from '../ui/IncomingInviteModal'
import { OfflineBanner } from '../ui/OfflineBanner'
import { InstallPrompt } from '../ui/InstallPrompt'
import { useDailyBonus } from '../hooks/useDailyBonus'
import { useAuth } from '../firebase/auth'

SplashScreen.preventAutoHideAsync()

function DailyBonusGate() {
  const { user }            = useAuth()
  const { pending, claim }  = useDailyBonus()
  if (!user || !pending) return null
  return <DailyBonusModal bonus={pending} onClaim={claim} />
}

export default function RootLayout() {
  useFirebaseProfileSync()
  usePushRegistration()
  usePresence()

  // Direction RTL pour l'arabe : sur web via document.dir (effet immédiat),
  // sur mobile via I18nManager (appliqué au prochain rendu/recharge).
  const { isRTL } = useI18n()
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof document !== 'undefined') document.dir = isRTL ? 'rtl' : 'ltr'
    } else if (I18nManager.isRTL !== isRTL) {
      I18nManager.allowRTL(isRTL)
      I18nManager.forceRTL(isRTL)
    }
  }, [isRTL])

  const [fontsLoaded, fontError] = useFonts({
    ReemKufi_700Bold,
    Cairo_400Regular,
    Cairo_600SemiBold,
  })

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded, fontError])

  if (!fontsLoaded && !fontError) {
    return null
  }

  return (
    <View style={{ flex: 1 }}>
      <TopBar />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          animationDuration: 180,
        }}
      />
      <BottomNav />
      <DailyBonusGate />
      <IncomingInviteModal />
      <OfflineBanner />
      <InstallPrompt />
    </View>
  )
}

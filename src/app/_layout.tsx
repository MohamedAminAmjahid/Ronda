import { useEffect, useState } from 'react'
import { Platform, I18nManager, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
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
import { DailyChestModal } from '../ui/DailyChestModal'
import { LevelUpModal } from '../ui/LevelUpModal'
import { IncomingInviteModal } from '../ui/IncomingInviteModal'
import { OfflineBanner } from '../ui/OfflineBanner'
import { InstallPrompt } from '../ui/InstallPrompt'
import { useDailyBonus } from '../hooks/useDailyBonus'
import { useDailyChest } from '../hooks/useDailyChest'
import { useAuth } from '../firebase/auth'
import { useProfile } from '../profile/useProfile'
import { LEVELUP_KEY } from '../profile/profile'

SplashScreen.preventAutoHideAsync()

function DailyBonusGate() {
  const { user }            = useAuth()
  const { pending, claim }  = useDailyBonus()
  if (!user || !pending) return null
  return <DailyBonusModal bonus={pending} onClaim={claim} />
}

function LevelUpGate() {
  const { level } = useProfile()
  const [pending, setPending] = useState<{ level: number; goldBonus: number } | null>(null)

  useEffect(() => {
    void AsyncStorage.getItem(LEVELUP_KEY).then((raw) => {
      if (!raw) return
      try { setPending(JSON.parse(raw) as { level: number; goldBonus: number }) } catch { /* ignore */ }
    })
  }, [level])

  const claim = async () => {
    await AsyncStorage.removeItem(LEVELUP_KEY).catch(() => {})
    setPending(null)
  }

  if (!pending) return null
  return <LevelUpModal level={pending.level} goldBonus={pending.goldBonus} onClaim={() => { void claim() }} />
}

function DailyChestGate() {
  const { user }              = useAuth()
  const { reward, openChest } = useDailyChest()
  const [visible, setVisible] = useState(false)

  // Délai 2 s pour ne pas empiler avec la modale de bonus journalier.
  useEffect(() => {
    if (!user || !reward) return
    const t = setTimeout(() => setVisible(true), 2000)
    return () => clearTimeout(t)
  }, [user, reward])

  if (!visible || !reward) return null
  return (
    <DailyChestModal
      level={reward.level}
      gold={reward.gold}
      onOpen={openChest}
      onClose={() => setVisible(false)}
    />
  )
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
      <DailyChestGate />
      <LevelUpGate />
      <IncomingInviteModal />
      <OfflineBanner />
      <InstallPrompt />
    </View>
  )
}

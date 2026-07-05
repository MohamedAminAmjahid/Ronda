import { useEffect, useState } from 'react'
import { Platform, I18nManager, View, Text, StyleSheet } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Stack } from 'expo-router'
import { useFonts } from 'expo-font'
import { ReemKufi_700Bold } from '@expo-google-fonts/reem-kufi'
import { Cairo_400Regular, Cairo_600SemiBold } from '@expo-google-fonts/cairo'
import * as SplashScreen from 'expo-splash-screen'
import { Asset } from 'expo-asset'
import { CARD_IMAGES } from '../ui/components/Card'
import { useFirebaseProfileSync } from '../firebase/sync'
import { usePushRegistration } from '../push/push'
import { usePresence } from '../presence/usePresence'
import { useBackgroundMusic } from '../hooks/useBackgroundMusic'
import { loadSoundPref } from '../hooks/soundPrefs'
import { useI18n } from '../i18n/useI18n'
import { BottomNav } from '../ui/BottomNav'
import { TopBar } from '../ui/TopBar'
import { DailyBonusModal } from '../ui/DailyBonusModal'
import { DailyChestModal } from '../ui/DailyChestModal'
import { LevelUpModal } from '../ui/LevelUpModal'
import { IncomingInviteModal } from '../ui/IncomingInviteModal'
import { OfflineBanner } from '../ui/OfflineBanner'
import { useDailyBonus } from '../hooks/useDailyBonus'
import { useDailyChest, type ChestLevel } from '../hooks/useDailyChest'
import { useAuth } from '../firebase/auth'
import { useProfile } from '../profile/useProfile'
import { LEVELUP_KEY } from '../profile/profile'

SplashScreen.preventAutoHideAsync()

const SUIT_SYMBOLS = ['♠', '♣', '♥', '♦', '♠', '♣', '♥', '♦', '♠', '♣', '♥', '♦', '♠', '♣', '♥', '♦', '♠', '♣', '♥', '♦', '♠', '♣']
const SUIT_POSITIONS: Array<Record<string, string | number>> = [
  { top: '2%', left: '4%' }, { top: '2%', left: '26%' }, { top: '2%', left: '52%' }, { top: '2%', right: '4%' },
  { top: '15%', left: '12%' }, { top: '15%', right: '14%' },
  { top: '30%', left: '3%' }, { top: '30%', right: '5%' },
  { top: '45%', left: '20%' }, { top: '45%', right: '20%' },
  { top: '60%', left: '6%' }, { top: '60%', right: '7%' },
  { top: '75%', left: '3%' }, { top: '75%', left: '32%' }, { top: '75%', left: '58%' }, { top: '75%', right: '4%' },
  { top: '88%', left: '14%' }, { top: '88%', right: '13%' },
  { top: '94%', left: '5%' }, { top: '94%', left: '44%' }, { top: '94%', right: '6%' },
  { top: '50%', left: '42%' },
]

const ly = StyleSheet.create({
  suitSymbol: {
    position: 'absolute',
    fontSize: 20,
    color: '#C9A227',
    opacity: 0.022,
    fontFamily: undefined,
  },
})

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
  // Snapshot figé au moment de l'affichage : survit à reward→null après ouverture,
  // sinon la modale se démonterait avant l'animation d'ouverture.
  const [shown, setShown] = useState<{ level: ChestLevel; gold: number } | null>(null)

  // Délai 2 s pour ne pas empiler avec la modale de bonus journalier.
  useEffect(() => {
    if (!user || !reward || shown) return
    const t = setTimeout(() => setShown({ level: reward.level, gold: reward.gold }), 2000)
    return () => clearTimeout(t)
  }, [user, reward, shown])

  if (!shown) return null
  return (
    <DailyChestModal
      level={shown.level}
      gold={shown.gold}
      onOpen={openChest}
      onClose={() => setShown(null)}
    />
  )
}

export default function RootLayout() {
  useFirebaseProfileSync()
  usePushRegistration()
  usePresence()
  useBackgroundMusic()

  // Charge la préférence son (musique + effets) au démarrage.
  useEffect(() => { void loadSoundPref() }, [])

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

  // Précharge les 40 images de cartes au démarrage → plus de flash du repli texte
  // au 1er affichage. Filet de sécurité 4 s pour ne jamais bloquer le lancement.
  const [cardsReady, setCardsReady] = useState(false)
  useEffect(() => {
    const preload = Promise.all(
      // require(png) → identifiant d'asset Metro (number) ; le type large est resserré ici.
      CARD_IMAGES.map(m => Asset.fromModule(m as number).downloadAsync().catch(() => undefined)),
    )
    const timeout = new Promise<void>(res => setTimeout(res, 4000))
    void Promise.race([preload, timeout]).then(() => setCardsReady(true))
  }, [])

  useEffect(() => {
    if ((fontsLoaded || fontError) && cardsReady) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded, fontError, cardsReady])

  if ((!fontsLoaded && !fontError) || !cardsReady) {
    return null
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0D0D1A' }}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {SUIT_SYMBOLS.map((sym, i) => (
          <Text key={i} style={[ly.suitSymbol, SUIT_POSITIONS[i] as object]}>{sym}</Text>
        ))}
      </View>
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
    </View>
  )
}

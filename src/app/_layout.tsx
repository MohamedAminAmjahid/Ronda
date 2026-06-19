import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { useFonts } from 'expo-font'
import { ReemKufi_700Bold } from '@expo-google-fonts/reem-kufi'
import { Cairo_400Regular, Cairo_600SemiBold } from '@expo-google-fonts/cairo'
import * as SplashScreen from 'expo-splash-screen'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
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

  return <Stack screenOptions={{ headerShown: false }} />
}

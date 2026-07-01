import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useI18n } from '../i18n/useI18n'
import { useIsOffline } from '../net/useOnlineStatus'

/** Bannière discrète affichée en haut de l'écran quand l'appareil est hors-ligne. */
export function OfflineBanner() {
  const { t } = useI18n()
  const offline = useIsOffline()
  const insets = useSafeAreaInsets()

  if (!offline) return null

  return (
    <View style={[s.bar, { paddingTop: insets.top + 6 }]} pointerEvents="none">
      <Text style={s.txt}>{t('offlineBanner')}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  bar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50,
    backgroundColor: '#5A2A2A', paddingBottom: 6, paddingHorizontal: 16, alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: 'rgba(244,236,216,0.15)',
  },
  txt: { fontFamily: 'Cairo_600SemiBold', fontSize: 12, color: '#F4ECD8', letterSpacing: 0.3 },
})

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useI18n } from '../i18n/useI18n'

// ── Tokens ────────────────────────────────────────────────────────────────────

const C = {
  bg:       '#2D0A1E',
  acc:      '#8B1A4A',
  accLight: 'rgba(139,26,74,0.30)',
  brass:    '#C9A227',
  bone:     '#F4ECD8',
  boneOff:  'rgba(244,236,216,0.45)',
  boneGhost:'rgba(244,236,216,0.18)',
  ink:      '#1C2622',
} as const

// ── Écran ─────────────────────────────────────────────────────────────────────

export function DiJoujScreen() {
  const { t } = useI18n()

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>

        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={s.backTxt}>{t('back')}</Text>
        </TouchableOpacity>

        <View style={s.hero}>
          <Text style={s.title}>DI JOUJ</Text>
          <Text style={s.titleAr}>ديجوج</Text>
          <View style={s.divider} />
        </View>

        <View style={s.actions}>

          {/* Jouer solo — bientôt */}
          <View style={[s.btnSolo, s.btnDisabledStyle]}>
            <Text style={s.btnSoloTxt}>{t('play')}</Text>
          </View>

          {/* En ligne — verrouillé */}
          <View style={s.btnLocked}>
            <Text style={s.btnLockedTxt}>🔒  {t('playOnline')}</Text>
          </View>

        </View>

        <View style={s.soon}>
          <Text style={s.soonTxt}>{t('dijoujSoon')}</Text>
        </View>

      </View>
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 430, paddingHorizontal: 28 },

  backBtn: { paddingTop: 12, paddingBottom: 4, alignSelf: 'flex-start' },
  backTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13, letterSpacing: 0.5 },

  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 20,
  },
  title: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 44,
    color: C.bone,
    letterSpacing: 8,
  },
  titleAr: {
    fontFamily: 'ReemKufi_700Bold',
    fontSize: 26,
    color: C.acc,
    letterSpacing: 2,
  },
  divider: {
    width: 40,
    height: 2,
    backgroundColor: C.acc,
    opacity: 0.6,
    borderRadius: 1,
    marginTop: 4,
  },

  actions: { gap: 14, paddingBottom: 16 },
  btnSolo: {
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    backgroundColor: C.acc,
  },
  btnDisabledStyle: { opacity: 0.45 },
  btnSoloTxt: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 16,
    color: C.bone,
    letterSpacing: 0.4,
  },
  btnLocked: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(139,26,74,0.35)',
    opacity: 0.4,
  },
  btnLockedTxt: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 16,
    color: C.boneOff,
    letterSpacing: 0.4,
  },

  soon: { paddingBottom: 40, alignItems: 'center' },
  soonTxt: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 13,
    color: C.boneOff,
    letterSpacing: 0.5,
    textAlign: 'center',
    lineHeight: 20,
  },
})

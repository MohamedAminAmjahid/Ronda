import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, type Href } from 'expo-router'
import { useAuth } from '../firebase/auth'
import { useI18n } from '../i18n/useI18n'
import { TERMS } from './terms'

const PLAY: Href         = '/play' as Href
const ONLINE: Href       = '/online' as Href
const ONLINE_FRIEND: Href = '/online?mode=friend' as Href

// ── Tokens ────────────────────────────────────────────────────────────────────

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.45)',
  ink:     '#1C2622',
} as const

// ── Écran ─────────────────────────────────────────────────────────────────────

export function RondaMenuScreen() {
  const { user } = useAuth()
  const { t } = useI18n()

  const goOnline = () => router.push(user ? ONLINE : ('/auth?next=online' as Href))
  const goFriend = () => router.push(user ? ONLINE_FRIEND : ('/auth?next=friend' as Href))

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>

        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={s.backTxt}>{t('back')}</Text>
        </TouchableOpacity>

        <View style={s.hero}>
          <Text style={s.title}>RONDA</Text>
          <Text style={s.titleAr}>{TERMS.ronda.ar}</Text>
          <View style={s.divider} />
          <Text style={s.tagline}>{t('tagline')}</Text>
        </View>

        <View style={s.actions}>

          <TouchableOpacity style={s.btnPrimary} onPress={() => router.push(PLAY)} activeOpacity={0.85}>
            <Text style={s.btnPrimaryTxt}>{t('youVsAI')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.btnSecondary} onPress={goOnline} activeOpacity={0.85}>
            <Text style={s.btnSecondaryTxt}>{t('playOnline')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.btnSecondary} onPress={goFriend} activeOpacity={0.85}>
            <Text style={s.btnSecondaryTxt}>{t('playWithFriend')}</Text>
          </TouchableOpacity>

        </View>
      </View>
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.table, alignItems: 'center' },
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
    fontSize: 48,
    color: C.bone,
    letterSpacing: 10,
  },
  titleAr: {
    fontFamily: 'ReemKufi_700Bold',
    fontSize: 26,
    color: C.brass,
    letterSpacing: 2,
  },
  divider: {
    width: 40,
    height: 2,
    backgroundColor: C.brass,
    opacity: 0.5,
    borderRadius: 1,
  },
  tagline: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 13,
    color: C.boneOff,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  actions: { gap: 14, paddingBottom: 40 },
  btnPrimary: {
    backgroundColor: C.brass,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: C.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  btnPrimaryTxt: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 16,
    color: C.ink,
    letterSpacing: 0.4,
  },
  btnSecondary: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.brass,
  },
  btnSecondaryTxt: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 16,
    color: C.brass,
    letterSpacing: 0.4,
  },
})

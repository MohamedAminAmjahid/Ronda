import { type ReactNode } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { useI18n } from '../i18n/useI18n'

const C = {
  gradTop: '#0D0D1A' as const,
  gradBot: '#1A0D2E' as const,
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.55)',
  boneDim: 'rgba(244,236,216,0.40)',
  card:    'rgba(0,0,0,0.25)',
} as const

/** Cadre commun aux pages légales (Confidentialité, CGU, À propos). */
export function LegalPage({ title, onBack, children }: {
  title: string
  onBack: () => void
  children: ReactNode
}) {
  const { t } = useI18n()
  return (
    <LinearGradient colors={[C.gradTop, C.gradBot]} style={ls.root}>
      <SafeAreaView style={ls.safe} edges={['top', 'bottom']}>
        <View style={ls.header}>
          <TouchableOpacity onPress={onBack} style={ls.backBtn} activeOpacity={0.7}>
            <Text style={ls.backTxt}>← {t('back')}</Text>
          </TouchableOpacity>
          <Text style={ls.title} numberOfLines={1}>{title}</Text>
          <View style={ls.headerSpacer} />
        </View>
        <ScrollView contentContainerStyle={ls.body} showsVerticalScrollIndicator={false}>
          {children}
          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  )
}

export const ls = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 640,
    paddingHorizontal: 18, paddingTop: 12, paddingBottom: 8,
  },
  backBtn: { paddingVertical: 6, minWidth: 72 },
  backTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  title: {
    flex: 1, textAlign: 'center',
    fontFamily: 'Cairo_600SemiBold', fontSize: 18, color: C.brass, letterSpacing: 1,
  },
  headerSpacer: { minWidth: 72 },

  body: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 8, gap: 4 },

  // Éléments de contenu réutilisables par les pages.
  h2:    { fontFamily: 'Cairo_600SemiBold', fontSize: 20, color: C.bone, marginTop: 22, marginBottom: 6 },
  h3:    { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.brass, marginTop: 16, marginBottom: 4, letterSpacing: 0.3 },
  p:     { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff, lineHeight: 22 },
  bullet:{ fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff, lineHeight: 22, paddingLeft: 8 },
  small: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.boneDim, lineHeight: 18, marginTop: 4 },
  link:  { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.brass },
  rtl:   { writingDirection: 'rtl', textAlign: 'right' },
  card: {
    backgroundColor: C.card, borderRadius: 14, padding: 16, marginTop: 10, gap: 6,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.18)',
  },
  hero:      { alignItems: 'center', gap: 6, paddingVertical: 18 },
  heroTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 30, color: C.brass, letterSpacing: 3 },
  heroSub:   { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff, textAlign: 'center' },
  divider:   { height: 1, backgroundColor: 'rgba(244,236,216,0.10)', marginVertical: 18 },
})

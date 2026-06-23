import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Svg, Circle, Polygon } from 'react-native-svg'
import type { Lang } from '../i18n/useI18n'

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.5)',
} as const

const OPTIONS: { lang: Lang; flag: string; label: string }[] = [
  { lang: 'ar', flag: '🇲🇦', label: 'العربية' },
  { lang: 'fr', flag: '🇫🇷', label: 'Français' },
  { lang: 'en', flag: '🇬🇧', label: 'English' },
]

function KhatamLogo() {
  return (
    <Svg width={64} height={64} viewBox="0 0 72 72">
      <Circle cx="36" cy="36" r="34" fill={C.deep} stroke={C.brass} strokeWidth="2" />
      <Polygon
        points={
          '36,10 39.2,23.4 51.8,17.4 45.8,29 60,36 ' +
          '45.8,43 51.8,54.6 39.2,48.6 36,62 32.8,48.6 ' +
          '20.2,54.6 26.2,43 12,36 26.2,29 20.2,17.4 32.8,23.4'
        }
        fill={C.brass}
      />
    </Svg>
  )
}

interface Props {
  onPick: (lang: Lang) => void
}

export function LangPickerScreen({ onPick }: Props) {
  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>
        <View style={s.hero}>
          <KhatamLogo />
          <Text style={s.title}>RONDA</Text>
          <Text style={s.subtitle}>Choisis ta langue · اختر لغتك · Choose your language</Text>
        </View>

        <View style={s.options}>
          {OPTIONS.map((o) => (
            <TouchableOpacity key={o.lang} style={s.option} onPress={() => onPick(o.lang)} activeOpacity={0.85}>
              <Text style={s.flag}>{o.flag}</Text>
              <Text style={s.optionLabel}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.table, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 430, paddingHorizontal: 28, justifyContent: 'center', gap: 36 },

  hero: { alignItems: 'center', gap: 10 },
  title: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 44, color: C.bone,
    letterSpacing: 8, textTransform: 'uppercase', marginTop: 8,
  },
  subtitle: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff, textAlign: 'center' },

  options: { gap: 14 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 14, paddingVertical: 18, paddingHorizontal: 22,
    borderWidth: 1.5, borderColor: C.brass,
  },
  flag: { fontSize: 32 },
  optionLabel: { fontFamily: 'Cairo_600SemiBold', fontSize: 20, color: C.bone },
})

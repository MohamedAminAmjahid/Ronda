import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Svg, Circle, Rect, Polygon } from 'react-native-svg'
import { useI18n } from '../i18n/useI18n'

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
  surface: 'rgba(0,0,0,0.18)',
} as const

// ── Icônes SVG ────────────────────────────────────────────────────────────────

function IconCard() {
  return (
    <Svg width={36} height={36} viewBox="0 0 36 36">
      <Rect x="5" y="2" width="26" height="32" rx="3" fill={C.deep} stroke={C.brass} strokeWidth="1.5" />
      <Circle cx="18" cy="16" r="6" fill="none" stroke={C.brass} strokeWidth="1.2" />
      <Circle cx="18" cy="16" r="2.5" fill={C.brass} />
    </Svg>
  )
}

function IconCoin() {
  return (
    <Svg width={36} height={36} viewBox="0 0 36 36">
      <Circle cx="18" cy="18" r="15" fill={C.deep} stroke={C.brass} strokeWidth="1.5" />
      <Polygon
        points="18,8 19.8,13.7 25.8,13.7 21,17.2 22.8,22.9 18,19.4 13.2,22.9 15,17.2 10.2,13.7 16.2,13.7"
        fill={C.brass}
      />
    </Svg>
  )
}

function IconRps() {
  return (
    <Svg width={36} height={36} viewBox="0 0 36 36">
      <Circle cx="8"  cy="18" r="5" fill={C.deep} stroke={C.brass} strokeWidth="1.3" />
      <Circle cx="18" cy="18" r="5" fill={C.deep} stroke={C.brass} strokeWidth="1.3" />
      <Circle cx="28" cy="18" r="5" fill={C.deep} stroke={C.brass} strokeWidth="1.3" />
      <Circle cx="8"  cy="18" r="2" fill={C.brass} />
      <Rect x="16.5" y="10" width="3" height="16" rx="1.5" fill={C.brass} />
      <Rect x="10"   y="16.5" width="16" height="3" rx="1.5" fill={C.brass} />
    </Svg>
  )
}

// ── Types / Props ─────────────────────────────────────────────────────────────

export type RitualType = 'coin_flip' | 'card_draw' | 'rps'

interface Props {
  onSelect: (ritual: RitualType) => void
  onBack: () => void
}

// ── Écran ─────────────────────────────────────────────────────────────────────

export function RitualPickerScreen({ onSelect, onBack }: Props) {
  const { t } = useI18n()
  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>

        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>{t('back')}</Text>
          </TouchableOpacity>
          <Text style={s.title}>{t('whoStarts')}</Text>
          <Text style={s.subtitle}>{t('chooseRitual')}</Text>
        </View>

        <View style={s.options}>
          <TouchableOpacity style={s.option} onPress={() => onSelect('card_draw')}>
            <View style={s.optionIcon}><IconCard /></View>
            <View style={s.optionBody}>
              <Text style={s.optionTitle}>{t('drawCard')}</Text>
              <Text style={s.optionDesc}>{t('drawCardDesc')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={s.option} onPress={() => onSelect('coin_flip')}>
            <View style={s.optionIcon}><IconCoin /></View>
            <View style={s.optionBody}>
              <Text style={s.optionTitle}>{t('coinFlip')}</Text>
              <Text style={s.optionDesc}>{t('coinFlipDesc')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={s.option} onPress={() => onSelect('rps')}>
            <View style={s.optionIcon}><IconRps /></View>
            <View style={s.optionBody}>
              <Text style={s.optionTitle}>{t('rps')}</Text>
              <Text style={s.optionDesc}>{t('rpsDesc')}</Text>
            </View>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.table,
    alignItems: 'center',
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: 430,
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 32,
    alignItems: 'center',
    gap: 6,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    marginBottom: 8,
  },
  backTxt: {
    fontFamily: 'Cairo_400Regular',
    color: C.boneOff,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 28,
    color: C.bone,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 12,
    color: C.boneOff,
    letterSpacing: 0.6,
  },
  options: {
    gap: 14,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.15)',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  optionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.deep,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.3)',
  },
  optionBody: {
    flex: 1,
    gap: 4,
  },
  optionTitle: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 15,
    color: C.bone,
    letterSpacing: 0.2,
  },
  optionDesc: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 12,
    color: C.boneOff,
    lineHeight: 17,
  },
})

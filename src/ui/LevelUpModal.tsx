import { useEffect, useRef } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native'
import { useI18n } from '../i18n/useI18n'

const C = {
  bg:      '#0D0D1A',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.45)',
  ink:     '#1C2622',
} as const

interface Props {
  level:     number
  goldBonus: number
  onClaim:   () => void
}

export function LevelUpModal({ level, goldBonus, onClaim }: Props) {
  const { t }       = useI18n()
  const scaleAnim   = useRef(new Animated.Value(0.5)).current
  const opacityAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim,   { toValue: 1, friction: 5, tension: 180, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start()
  }, [scaleAnim, opacityAnim])

  return (
    <Modal visible transparent animationType="none">
      <View style={s.backdrop}>
        <Animated.View style={[s.card, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
          <Text style={s.star}>⭐</Text>
          <Text style={s.title}>{t('levelUpTitle')}</Text>
          <Text style={s.levelTxt}>
            {t('level')}{' '}
            <Text style={s.levelNum}>{level}</Text>
          </Text>
          {goldBonus > 0 && (
            <View style={s.goldBox}>
              <Text style={s.goldTxt}>🪙 +{goldBonus}</Text>
              <Text style={s.goldLabel}>{t('levelUpGold')}</Text>
            </View>
          )}
          <TouchableOpacity style={s.btn} onPress={onClaim} activeOpacity={0.85}>
            <Text style={s.btnTxt}>{t('levelUpBtn')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(9,13,26,0.88)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  card: {
    width: '100%', maxWidth: 320, backgroundColor: C.bg, borderRadius: 24,
    padding: 32, gap: 16, alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(201,162,39,0.60)',
    shadowColor: '#C9A227', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 24, elevation: 16,
  },
  star:     { fontSize: 56 },
  title:    { fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: C.bone, textAlign: 'center' },
  levelTxt: { fontFamily: 'Cairo_400Regular', fontSize: 17, color: C.boneOff },
  levelNum: { fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 28 },
  goldBox:  { alignItems: 'center', gap: 4 },
  goldTxt:  { fontFamily: 'Cairo_600SemiBold', fontSize: 32, color: C.brass },
  goldLabel:{ fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff },
  btn: {
    backgroundColor: C.brass, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', width: '100%', marginTop: 4,
  },
  btnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.ink },
})

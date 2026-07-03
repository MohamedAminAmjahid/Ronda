import { useEffect, useRef } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native'
import { type ChestLevel } from '../hooks/useDailyChest'
import { useI18n } from '../i18n/useI18n'

const C = {
  bg:      '#0D0D1A',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.45)',
  ink:     '#1C2622',
} as const

const LEVEL_META: Record<ChestLevel, { label: string; emoji: string; color: string }> = {
  bronze:  { label: 'chestBronze',  emoji: '📦', color: '#CD7F32' },
  silver:  { label: 'chestSilver',  emoji: '🥈', color: '#A8A9AD' },
  gold:    { label: 'chestGold',    emoji: '🏆', color: '#C9A227' },
  diamond: { label: 'chestDiamond', emoji: '💎', color: '#88C0D0' },
}

interface Props {
  level:    ChestLevel
  gold:     number
  onOpen:   () => Promise<void>
  onClose:  () => void
}

export function DailyChestModal({ level, gold, onOpen, onClose }: Props) {
  const { t }      = useI18n()
  const meta       = LEVEL_META[level]
  const shakeAnim  = useRef(new Animated.Value(0)).current
  const scaleAnim  = useRef(new Animated.Value(1)).current
  const fadeAnim   = useRef(new Animated.Value(0)).current
  const opened     = useRef(false)

  useEffect(() => {
    // Shake d'entrée automatique
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.sequence(
        Array.from({ length: 5 }, (_, i) =>
          Animated.timing(shakeAnim, {
            toValue: i % 2 === 0 ? 8 : -8,
            duration: 60,
            useNativeDriver: true,
          })
        )
      ),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start()
  }, [shakeAnim, fadeAnim])

  const handleOpen = async () => {
    if (opened.current) return
    opened.current = true
    // Animation d'ouverture : scale up + fade
    Animated.spring(scaleAnim, {
      toValue: 1.3, friction: 4, tension: 200, useNativeDriver: true,
    }).start(() => {
      Animated.spring(scaleAnim, {
        toValue: 1, friction: 5, tension: 160, useNativeDriver: true,
      }).start()
    })
    await onOpen()
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Animated.View style={[s.card, { opacity: fadeAnim }]}>

          {/* Titre niveau */}
          <Text style={[s.levelTxt, { color: meta.color }]}>
            {meta.emoji} {t(meta.label as never)}
          </Text>
          <Text style={s.title}>{t('dailyChest')}</Text>

          {/* Coffre animé */}
          <Animated.View style={{
            transform: [
              { translateX: shakeAnim },
              { scale: scaleAnim },
            ],
          }}>
            <Text style={s.chestEmoji}>{opened.current ? '🎁' : '📫'}</Text>
          </Animated.View>

          {/* Récompense (après ouverture) */}
          {opened.current && (
            <View style={s.rewardBox}>
              <Text style={s.rewardTxt}>🪙 +{gold}</Text>
              <Text style={s.rewardSub}>{t('chestOpen')}</Text>
            </View>
          )}

          <View style={s.btnRow}>
            {!opened.current ? (
              <TouchableOpacity style={s.openBtn} onPress={handleOpen} activeOpacity={0.85}>
                <Text style={s.openBtnTxt}>{t('chestOpen')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.openBtn} onPress={onClose} activeOpacity={0.85}>
                <Text style={s.openBtnTxt}>{t('adClose')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(9,13,26,0.90)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  card: {
    width: '100%', maxWidth: 340, backgroundColor: C.bg, borderRadius: 22,
    padding: 28, gap: 16, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.30)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 12,
  },
  levelTxt:   { fontFamily: 'Cairo_600SemiBold', fontSize: 14, letterSpacing: 1.2, textTransform: 'uppercase' },
  title:      { fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: C.bone },
  chestEmoji: { fontSize: 80, textAlign: 'center' },
  rewardBox:  { alignItems: 'center', gap: 4 },
  rewardTxt:  { fontFamily: 'Cairo_600SemiBold', fontSize: 32, color: C.brass },
  rewardSub:  { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff },
  btnRow:     { width: '100%' },
  openBtn:    { backgroundColor: C.brass, borderRadius: 14, paddingVertical: 15, alignItems: 'center', width: '100%' },
  openBtnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.ink },
})

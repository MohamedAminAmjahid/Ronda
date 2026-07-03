import { useEffect, useRef, useState } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native'
import { Svg, Rect, Circle } from 'react-native-svg'
import { type ChestLevel } from '../hooks/useDailyChest'
import { useI18n } from '../i18n/useI18n'

const C = {
  bg:      '#0D0D1A',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.45)',
  ink:     '#1C2622',
} as const

const CHEST_COLORS: Record<ChestLevel, { lid: string; body: string; band: string }> = {
  bronze:  { lid: '#CD7F32', body: '#7B3F00', band: '#A0522D' },
  silver:  { lid: '#C0C0C0', body: '#696969', band: '#A8A8A8' },
  gold:    { lid: '#FFD700', body: '#B8860B', band: '#DAA520' },
  diamond: { lid: '#B9F2FF', body: '#3A7FBF', band: '#66AACC' },
}

const LEVEL_META: Record<ChestLevel, { label: string; color: string }> = {
  bronze:  { label: 'chestBronze',  color: '#CD7F32' },
  silver:  { label: 'chestSilver',  color: '#A8A9AD' },
  gold:    { label: 'chestGold',    color: '#C9A227' },
  diamond: { label: 'chestDiamond', color: '#88C0D0' },
}

export function ChestSVG({ level, size = 90 }: { level: ChestLevel; size?: number }) {
  const cl = CHEST_COLORS[level]
  const W = size
  const lidH = Math.round(size * 0.40)
  const bodyY = Math.round(size * 0.44)
  const bodyH = Math.round(size * 0.52)
  const cx = W / 2

  return (
    <Svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
      {/* Body */}
      <Rect x={3} y={bodyY} width={W - 6} height={bodyH} rx={7} fill={cl.body} />
      {/* Decorative band on body */}
      <Rect x={3} y={bodyY + Math.round(bodyH * 0.40)} width={W - 6} height={8} fill={cl.band} />
      {/* Lock plate */}
      <Rect x={cx - 10} y={bodyY + 5} width={20} height={22} rx={4} fill={C.brass} />
      {/* Keyhole circle */}
      <Circle cx={cx} cy={bodyY + 13} r={5} fill={cl.body} />
      {/* Keyhole slot */}
      <Rect x={cx - 2.5} y={bodyY + 16} width={5} height={7} rx={1} fill={cl.body} />
      {/* Lid */}
      <Rect x={0} y={4} width={W} height={lidH} rx={10} fill={cl.lid} />
      {/* Lid highlight */}
      <Rect x={10} y={11} width={W - 20} height={8} rx={4} fill="rgba(255,255,255,0.22)" />
      {/* Shadow strip at lid bottom */}
      <Rect x={3} y={bodyY} width={W - 6} height={4} fill="rgba(0,0,0,0.18)" rx={2} />
      {/* Left hinge */}
      <Circle cx={18} cy={bodyY} r={7} fill={cl.band} />
      <Circle cx={18} cy={bodyY} r={3.5} fill={cl.lid} />
      {/* Right hinge */}
      <Circle cx={W - 18} cy={bodyY} r={7} fill={cl.band} />
      <Circle cx={W - 18} cy={bodyY} r={3.5} fill={cl.lid} />
    </Svg>
  )
}

interface Props {
  level:   ChestLevel
  gold:    number
  onOpen:  () => Promise<void>
  onClose: () => void
}

export function DailyChestModal({ level, gold, onOpen, onClose }: Props) {
  const { t }        = useI18n()
  const meta         = LEVEL_META[level]
  const shakeAnim    = useRef(new Animated.Value(0)).current
  const scaleAnim    = useRef(new Animated.Value(1)).current
  const fadeAnim     = useRef(new Animated.Value(0)).current
  const rewardScale  = useRef(new Animated.Value(0)).current
  const [opened, setOpened] = useState(false)

  // Shake d'entrée automatique
  useEffect(() => {
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

  // Animation de la récompense après ouverture
  useEffect(() => {
    if (!opened) return
    Animated.spring(rewardScale, { toValue: 1, friction: 5, tension: 200, useNativeDriver: true }).start()
  }, [opened, rewardScale])

  const handleOpen = async () => {
    if (opened) return
    Animated.spring(scaleAnim, {
      toValue: 1.25, friction: 4, tension: 200, useNativeDriver: true,
    }).start(() => {
      Animated.spring(scaleAnim, {
        toValue: 1, friction: 5, tension: 160, useNativeDriver: true,
      }).start()
    })
    await onOpen()
    setOpened(true)
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Animated.View style={[s.card, { opacity: fadeAnim }]}>

          {/* ✕ Fermer */}
          <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={10}>
            <Text style={s.closeTxt}>✕</Text>
          </TouchableOpacity>

          {/* Titre niveau */}
          <Text style={[s.levelTxt, { color: meta.color }]}>
            {t(meta.label as never)}
          </Text>
          <Text style={s.title}>{t('dailyChest')}</Text>

          {/* Coffre SVG animé */}
          <Animated.View style={{
            transform: [{ translateX: shakeAnim }, { scale: scaleAnim }],
            marginVertical: 8,
          }}>
            <ChestSVG level={level} size={96} />
          </Animated.View>

          {/* Récompense après ouverture */}
          {opened ? (
            <Animated.View style={[s.rewardBox, { transform: [{ scale: rewardScale }] }]}>
              <Text style={s.rewardTxt}>🪙 +{gold}</Text>
            </Animated.View>
          ) : (
            <Text style={s.hintTxt}>{Math.floor(gold * 0.7)}–{gold} 🪙</Text>
          )}

          <View style={s.btnRow}>
            {!opened ? (
              <TouchableOpacity style={s.openBtn} onPress={() => { void handleOpen() }} activeOpacity={0.85}>
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
    padding: 28, gap: 12, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.30)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 12,
  },
  closeBtn: {
    position: 'absolute', top: 14, right: 16,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(244,236,216,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt:  { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.boneOff },
  levelTxt:  { fontFamily: 'Cairo_600SemiBold', fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase' },
  title:     { fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: C.bone },
  hintTxt:   { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff },
  rewardBox: { alignItems: 'center' },
  rewardTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 36, color: C.brass },
  btnRow:    { width: '100%', marginTop: 4 },
  openBtn: {
    backgroundColor: C.brass, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', width: '100%',
  },
  openBtnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.ink },
})

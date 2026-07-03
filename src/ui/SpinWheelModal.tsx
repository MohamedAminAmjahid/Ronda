import { useRef, useState } from 'react'
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Animated, Easing,
} from 'react-native'
import { Svg, Path, G, Circle, Text as SvgText } from 'react-native-svg'
import { SPIN_PRIZES, type SpinPrize } from '../hooks/useSpinWheel'
import { useI18n } from '../i18n/useI18n'

const C = {
  bg:      '#0D0D1A',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.45)',
  ink:     '#1C2622',
} as const

const SIZE   = 260
const CX     = SIZE / 2
const CY     = SIZE / 2
const R      = 118
const INNER  = 28
const N      = SPIN_PRIZES.length   // 8
const SLICE  = 360 / N

// ── SVG helpers ──────────────────────────────────────────────────────────────

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function wedge(startDeg: number, endDeg: number): string {
  const o1 = polar(CX, CY, R,     startDeg)
  const o2 = polar(CX, CY, R,     endDeg)
  const i1 = polar(CX, CY, INNER, startDeg)
  const i2 = polar(CX, CY, INNER, endDeg)
  const lg = endDeg - startDeg > 180 ? 1 : 0
  return [
    `M ${i1.x.toFixed(1)} ${i1.y.toFixed(1)}`,
    `L ${o1.x.toFixed(1)} ${o1.y.toFixed(1)}`,
    `A ${R} ${R} 0 ${lg} 1 ${o2.x.toFixed(1)} ${o2.y.toFixed(1)}`,
    `L ${i2.x.toFixed(1)} ${i2.y.toFixed(1)}`,
    `A ${INNER} ${INNER} 0 ${lg} 0 ${i1.x.toFixed(1)} ${i1.y.toFixed(1)}`,
    'Z',
  ].join(' ')
}

// ── Roue statique ─────────────────────────────────────────────────────────────

function Wheel() {
  return (
    <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      {SPIN_PRIZES.map((prize: SpinPrize, i: number) => {
        const start  = i * SLICE
        const end    = start + SLICE
        const mid    = start + SLICE / 2
        const tPos   = polar(CX, CY, (R + INNER) / 2, mid)
        return (
          <G key={i}>
            <Path d={wedge(start, end)} fill={prize.color} stroke="#0D0D1A" strokeWidth={1.5} />
            <G transform={`rotate(${mid}, ${tPos.x}, ${tPos.y})`}>
              <SvgText
                x={tPos.x} y={tPos.y - 6}
                fontSize="11" fontWeight="bold" textAnchor="middle"
                fill="#fff" opacity={0.95}
              >
                {prize.emoji}
              </SvgText>
              <SvgText
                x={tPos.x} y={tPos.y + 9}
                fontSize="9" fontWeight="bold" textAnchor="middle"
                fill="#fff" opacity={0.9}
              >
                {prize.label}
              </SvgText>
            </G>
          </G>
        )
      })}
      {/* Centre */}
      <Circle cx={CX} cy={CY} r={INNER} fill="#0D0D1A" stroke="#C9A227" strokeWidth={2} />
      <SvgText x={CX} y={CY + 5} textAnchor="middle" fontSize="14">🎰</SvgText>
    </Svg>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface Props {
  canSpin: boolean
  onSpin:  () => Promise<number>  // retourne l'index du prix
  onClose: () => void
}

type Phase = 'idle' | 'spinning' | 'result'

export function SpinWheelModal({ canSpin, onSpin, onClose }: Props) {
  const { t }                         = useI18n()
  const spinAnim                      = useRef(new Animated.Value(0)).current
  const [phase, setPhase]             = useState<Phase>('idle')
  const [prize, setPrize]             = useState<SpinPrize | null>(null)
  const [currentDeg, setCurrentDeg]   = useState(0)

  const spin = async () => {
    if (phase !== 'idle' || !canSpin) return
    setPhase('spinning')

    const idx = await onSpin()
    // Angle final : le segment idx doit être sous le pointeur (haut)
    const targetDeg = 360 * 5 + idx * SLICE + SLICE / 2
    const total = currentDeg + targetDeg

    spinAnim.setValue(currentDeg)
    setCurrentDeg(total)

    Animated.timing(spinAnim, {
      toValue:         total,
      duration:        3800,
      easing:          Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setPrize(SPIN_PRIZES[idx])
      setPhase('result')
    })
  }

  const rotate = spinAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0deg', '1deg'],
    extrapolate: 'extend',
  })

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <Text style={s.title}>🎰 {t('spinWheel')}</Text>

          {/* Pointeur */}
          <View style={s.pointerRow}>
            <View style={s.pointer} />
          </View>

          {/* Roue animée */}
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Wheel />
          </Animated.View>

          {/* Résultat */}
          {phase === 'result' && prize && (
            <View style={s.resultBox}>
              <Text style={s.resultEmoji}>{prize.emoji}</Text>
              <Text style={s.resultTxt}>
                {prize.gold === 5000 && prize.label === 'JACKPOT'
                  ? '⭐ JACKPOT ! +5000 🪙'
                  : prize.label === 'Cosmétic.'
                    ? `🎨 ${t('spinCosmetic')}`
                    : t('spinResult').replace('{n}', String(prize.gold))
                }
              </Text>
            </View>
          )}

          {!canSpin && phase !== 'spinning' && phase !== 'result' && (
            <Text style={s.tomorrow}>{t('spinTomorrow')}</Text>
          )}

          <View style={s.btnRow}>
            {(phase === 'idle' || phase === 'result') && (
              <>
                {phase === 'idle' && canSpin && (
                  <TouchableOpacity style={s.spinBtn} onPress={spin} activeOpacity={0.85}>
                    <Text style={s.spinBtnTxt}>{t('spinBtn')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.8}>
                  <Text style={s.closeBtnTxt}>{t('adClose')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(9,13,26,0.90)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
  },
  card: {
    width: '100%', maxWidth: 340, backgroundColor: C.bg, borderRadius: 22,
    padding: 20, gap: 14, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.30)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 12,
  },
  title: { fontFamily: 'Cairo_600SemiBold', fontSize: 20, color: C.bone },

  pointerRow: { width: SIZE, alignItems: 'center', marginBottom: -10, zIndex: 1 },
  pointer: {
    width: 0, height: 0,
    borderLeftWidth: 10, borderRightWidth: 10, borderTopWidth: 18,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: C.brass,
  },

  resultBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(201,162,39,0.14)', borderRadius: 14,
    paddingHorizontal: 20, paddingVertical: 12, width: '100%',
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.30)',
  },
  resultEmoji: { fontSize: 26 },
  resultTxt:   { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.brass, flex: 1 },

  tomorrow: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff, textAlign: 'center' },

  btnRow:   { flexDirection: 'row', gap: 10, width: '100%' },
  spinBtn:  { flex: 1, backgroundColor: C.brass, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  spinBtnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.ink },
  closeBtn:   { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(244,236,216,0.25)' },
  closeBtnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.boneOff },
})

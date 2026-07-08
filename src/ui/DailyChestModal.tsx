import { useEffect, useRef, useState } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native'
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

// Géométrie partagée entre l'icône fixe (ChestSVG) et les couches animées.
const geom = (size: number) => ({
  W:      size,
  lidH:   Math.round(size * 0.40),
  bodyY:  Math.round(size * 0.44),
  bodyH:  Math.round(size * 0.52),
  cx:     size / 2,
})

/** Coffre fermé statique — utilisé comme icône dans les boutons d'accès rapide. */
export function ChestSVG({ level, size = 90 }: { level: ChestLevel; size?: number }) {
  const cl = CHEST_COLORS[level]
  const { W, lidH, bodyY, bodyH, cx } = geom(size)

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

/** Couche « corps » du coffre (tout sauf le couvercle) — reste immobile. */
function ChestBodyLayer({ level, size }: { level: ChestLevel; size: number }) {
  const cl = CHEST_COLORS[level]
  const { W, bodyY, bodyH, cx } = geom(size)
  return (
    <Svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
      <Rect x={3} y={bodyY} width={W - 6} height={bodyH} rx={7} fill={cl.body} />
      {/* Intérieur sombre visible quand le couvercle s'ouvre */}
      <Rect x={7} y={bodyY} width={W - 14} height={12} rx={4} fill="rgba(0,0,0,0.45)" />
      <Rect x={3} y={bodyY + Math.round(bodyH * 0.40)} width={W - 6} height={8} fill={cl.band} />
      <Rect x={cx - 10} y={bodyY + 5} width={20} height={22} rx={4} fill={C.brass} />
      <Circle cx={cx} cy={bodyY + 13} r={5} fill={cl.body} />
      <Rect x={cx - 2.5} y={bodyY + 16} width={5} height={7} rx={1} fill={cl.body} />
      <Circle cx={18} cy={bodyY} r={7} fill={cl.band} />
      <Circle cx={18} cy={bodyY} r={3.5} fill={cl.lid} />
      <Circle cx={W - 18} cy={bodyY} r={7} fill={cl.band} />
      <Circle cx={W - 18} cy={bodyY} r={3.5} fill={cl.lid} />
    </Svg>
  )
}

/** Couche « couvercle » — pivote vers le haut à l'ouverture. */
function ChestLidLayer({ level, size }: { level: ChestLevel; size: number }) {
  const cl = CHEST_COLORS[level]
  const { W, lidH } = geom(size)
  return (
    <Svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
      <Rect x={0} y={4} width={W} height={lidH} rx={10} fill={cl.lid} />
      <Rect x={10} y={11} width={W - 20} height={8} rx={4} fill="rgba(255,255,255,0.22)" />
    </Svg>
  )
}

interface Props {
  level:     ChestLevel
  minGold:   number
  maxGold:   number
  /** Tire le montant, le crédite, et renvoie le montant réellement crédité. */
  onOpen:    () => Promise<number>
  onClose:   () => void
  /** Appelé avec le montant au moment où l'utilisateur ferme après ouverture. */
  onOpened?: (gold: number) => void
}

const CHEST_SIZE = 104

export function DailyChestModal({ level, minGold, maxGold, onOpen, onClose, onOpened }: Props) {
  const { t }   = useI18n()
  const meta    = LEVEL_META[level]
  // Snapshot figé : survit même si la source (reward) repasse à null après ouverture.
  const [snap] = useState({ level, minGold, maxGold })
  // Montant réellement crédité — connu seulement après le clic sur « Ouvrir »
  // (onOpen le tire au moment de l'appel, jamais avant).
  const [revealedGold, setRevealedGold] = useState<number | null>(null)

  const fadeAnim    = useRef(new Animated.Value(0)).current   // apparition carte
  const shakeAnim   = useRef(new Animated.Value(0)).current   // tremblement avant ouverture
  const lidAnim     = useRef(new Animated.Value(0)).current   // 0 fermé → 1 ouvert
  const glowAnim    = useRef(new Animated.Value(0)).current   // éclat lumineux
  const coinsAnim   = useRef(new Animated.Value(0)).current   // pièces qui jaillissent
  const rewardScale = useRef(new Animated.Value(0)).current   // valeur qui apparaît
  const [opened, setOpened] = useState(false)

  // Apparition + tremblement d'invitation
  useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.sequence(
        Array.from({ length: 5 }, (_, i) =>
          Animated.timing(shakeAnim, {
            toValue: i % 2 === 0 ? 7 : -7,
            duration: 60,
            useNativeDriver: true,
          })
        )
      ),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start()
  }, [fadeAnim, shakeAnim])

  // Séquence d'ouverture : couvercle qui pivote, éclat, pièces, valeur.
  useEffect(() => {
    if (!opened) return
    Animated.parallel([
      Animated.timing(lidAnim, {
        toValue: 1, duration: 500, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.timing(coinsAnim, {
        toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(220),
        Animated.spring(rewardScale, { toValue: 1, friction: 5, tension: 180, useNativeDriver: true }),
      ]),
    ]).start()
  }, [opened, lidAnim, glowAnim, coinsAnim, rewardScale])

  const handleClose = () => {
    if (opened && revealedGold !== null) onOpened?.(revealedGold)
    onClose()
  }

  const handleOpen = async () => {
    if (opened) return
    const gold = await onOpen()
    setRevealedGold(gold)
    setOpened(true)
  }

  // ── Interpolations ──────────────────────────────────────────────────────────
  const lidRotate = lidAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-118deg'] })
  const lidLift   = lidAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -14] })
  const glowScale = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 2.4] })
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] })

  // 3 pièces qui jaillissent du coffre puis retombent.
  const coin = (dx: number, peak: number, delayFrac: number) => {
    const ty = coinsAnim.interpolate({
      inputRange: [0, delayFrac, (delayFrac + 1) / 2, 1],
      outputRange: [10, 10, peak, peak + 26],
    })
    const op = coinsAnim.interpolate({
      inputRange: [0, delayFrac, 0.8, 1],
      outputRange: [0, 1, 1, 0],
    })
    return { transform: [{ translateX: dx }, { translateY: ty }], opacity: op }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleClose}>
      <View style={s.backdrop}>
        <Animated.View style={[s.card, { opacity: fadeAnim }]}>

          {/* ✕ Fermer */}
          <TouchableOpacity style={s.closeBtn} onPress={handleClose} hitSlop={10}>
            <Text style={s.closeTxt}>✕</Text>
          </TouchableOpacity>

          {/* Titre niveau */}
          <Text style={[s.levelTxt, { color: meta.color }]}>
            {t(meta.label as never)}
          </Text>
          <Text style={s.title}>{t('dailyChest')}</Text>

          {/* Scène du coffre */}
          <View style={s.stage}>
            {/* Éclat lumineux derrière le coffre */}
            <Animated.View
              pointerEvents="none"
              style={[s.glow, {
                backgroundColor: meta.color,
                opacity: glowOpacity,
                transform: [{ scale: glowScale }],
              }]}
            />

            {/* Pièces qui jaillissent */}
            {opened && (
              <View pointerEvents="none" style={s.coinsLayer}>
                <Animated.Text style={[s.coin, coin(-26, -46, 0.06)]}>🪙</Animated.Text>
                <Animated.Text style={[s.coin, coin(0,  -62, 0.02)]}>🪙</Animated.Text>
                <Animated.Text style={[s.coin, coin(26, -44, 0.10)]}>🪙</Animated.Text>
              </View>
            )}

            {/* Coffre : corps fixe + couvercle qui pivote */}
            <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
              <View style={{ width: CHEST_SIZE, height: CHEST_SIZE }}>
                <View style={StyleSheet.absoluteFill}>
                  <ChestBodyLayer level={snap.level} size={CHEST_SIZE} />
                </View>
                <Animated.View
                  style={[StyleSheet.absoluteFill, {
                    transform: [
                      { perspective: 600 },
                      { translateY: lidLift },
                      { rotateX: lidRotate },
                    ],
                  }]}
                >
                  <ChestLidLayer level={snap.level} size={CHEST_SIZE} />
                </Animated.View>
              </View>
            </Animated.View>
          </View>

          {/* Récompense après ouverture / indice avant */}
          {opened ? (
            <Animated.View style={[s.rewardBox, { transform: [{ scale: rewardScale }] }]}>
              <Text style={s.rewardTxt}>+{revealedGold ?? 0} 🪙</Text>
            </Animated.View>
          ) : (
            <Text style={s.hintTxt}>{snap.minGold}–{snap.maxGold} 🪙</Text>
          )}

          <View style={s.btnRow}>
            {!opened ? (
              <TouchableOpacity style={s.openBtn} onPress={() => { void handleOpen() }} activeOpacity={0.85}>
                <Text style={s.openBtnTxt}>{t('chestOpen')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.openBtn} onPress={handleClose} activeOpacity={0.85}>
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
    alignItems: 'center', justifyContent: 'center', zIndex: 5,
  },
  closeTxt:  { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.boneOff },
  levelTxt:  { fontFamily: 'Cairo_600SemiBold', fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase' },
  title:     { fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: C.bone },
  stage: {
    width: CHEST_SIZE + 60, height: CHEST_SIZE + 20,
    alignItems: 'center', justifyContent: 'flex-end', marginVertical: 6,
  },
  glow: {
    position: 'absolute', top: 6, alignSelf: 'center',
    width: 120, height: 120, borderRadius: 60,
  },
  coinsLayer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 3,
  },
  coin:      { position: 'absolute', fontSize: 26 },
  hintTxt:   { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff },
  rewardBox: { alignItems: 'center' },
  rewardTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 40, color: C.brass },
  btnRow:    { width: '100%', marginTop: 4 },
  openBtn: {
    backgroundColor: C.brass, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', width: '100%',
  },
  openBtnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.ink },
})

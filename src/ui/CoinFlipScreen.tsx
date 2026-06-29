import { useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Svg, Circle, Polygon } from 'react-native-svg'
import type { PlayerId } from '../engine/types'
import { HUMAN_ID, BOT_ID } from '../game'
import { useI18n } from '../i18n/useI18n'

// ── Tokens ────────────────────────────────────────────────────────────────────

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
  disabled:'rgba(244,236,216,0.18)',
} as const

// ── Visuels de la pièce ───────────────────────────────────────────────────────

/** Côté PILE : étoile khatam laiton sur fond vert profond */
function CoinPile() {
  return (
    <Svg width={80} height={80} viewBox="0 0 80 80">
      <Circle cx="40" cy="40" r="38" fill={C.deep} stroke={C.brass} strokeWidth="3" />
      <Circle cx="40" cy="40" r="30" fill="none" stroke="rgba(201,162,39,0.25)" strokeWidth="1" />
      <Polygon
        points={
          '40,14 42.8,27 55.6,20.8 49.4,32.6 63,40 ' +
          '49.4,47.4 55.6,59.2 42.8,53 40,66 37.2,53 ' +
          '24.4,59.2 30.6,47.4 17,40 30.6,32.6 24.4,20.8 37.2,27'
        }
        fill={C.brass}
      />
    </Svg>
  )
}

/** Côté FACE : motif oros concentrique sur fond ivoire */
function CoinFace() {
  return (
    <Svg width={80} height={80} viewBox="0 0 80 80">
      <Circle cx="40" cy="40" r="38" fill={C.bone} stroke={C.ink} strokeWidth="3" />
      <Circle cx="40" cy="40" r="28" fill="none" stroke={C.brass} strokeWidth="1.5" />
      <Circle cx="40" cy="40" r="16" fill="none" stroke={C.brass} strokeWidth="1.5" />
      <Circle cx="40" cy="40" r="5"  fill={C.brass} />
    </Svg>
  )
}

/** Pièce neutre (avant le choix) */
function CoinNeutral() {
  return (
    <Svg width={80} height={80} viewBox="0 0 80 80">
      <Circle cx="40" cy="40" r="38" fill={C.deep} stroke={C.brass} strokeWidth="3" />
      <Circle cx="40" cy="40" r="28" fill="none" stroke="rgba(201,162,39,0.3)" strokeWidth="1.5" />
      <Circle cx="40" cy="40" r="14" fill="none" stroke="rgba(201,162,39,0.2)" strokeWidth="1" />
    </Svg>
  )
}

// ── Types internes ────────────────────────────────────────────────────────────

type CoinSide  = 'pile' | 'face'
type FlipPhase = 'choosing' | 'flipping' | 'revealed'

// ── Écran ─────────────────────────────────────────────────────────────────────

interface Props {
  onStart: (firstDealer: PlayerId) => void
  onBack:  () => void
}

export function CoinFlipScreen({ onStart, onBack }: Props) {
  const { t } = useI18n()
  const [phase,  setPhase]  = useState<FlipPhase>('choosing')
  const [choice, setChoice] = useState<CoinSide | null>(null)
  const [result, setResult] = useState<CoinSide | null>(null)

  const scaleX  = useRef(new Animated.Value(1)).current
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChoice = (picked: CoinSide) => {
    if (phase !== 'choosing') return
    setChoice(picked)
    setPhase('flipping')

    // Résultat aléatoire
    const coinResult: CoinSide = Math.random() < 0.5 ? 'pile' : 'face'

    // Animation : 10 demi-retournements (80 ms chacun) ≈ 800 ms
    const half = (to: number) =>
      Animated.timing(scaleX, { toValue: to, duration: 80, useNativeDriver: true })

    Animated.sequence([
      half(-1), half(1), half(-1), half(1),
      half(-1), half(1), half(-1), half(1),
      half(-1), half(1),
    ]).start(() => {
      setResult(coinResult)
      setPhase('revealed')
    })
  }

  const handleStart = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    // Gagnant du tirage = donneur
    const humanWon = choice === result
    onStart(humanWon ? HUMAN_ID : BOT_ID)
  }

  const humanWon = choice !== null && result !== null && choice === result

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>

        {/* ── En-tête ──────────────────────────────────────────── */}
        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>{t('back')}</Text>
          </TouchableOpacity>
          <Text style={s.title}>{t('coinFlipTitle')}</Text>
          <Text style={s.subtitle}>{t('dealerNote')}</Text>
        </View>

        {/* ── Pièce ────────────────────────────────────────────── */}
        <View style={s.coinArea}>
          <Animated.View style={{ transform: [{ scaleX }] }}>
            {phase === 'revealed' && result === 'pile'  && <CoinPile />}
            {phase === 'revealed' && result === 'face'  && <CoinFace />}
            {phase !== 'revealed'                       && <CoinNeutral />}
          </Animated.View>

          {phase === 'revealed' && result && (
            <Text style={s.resultLabel}>
              {result === 'pile' ? 'PILE !' : 'FACE !'}
            </Text>
          )}
        </View>

        {/* ── Choix ────────────────────────────────────────────── */}
        {phase === 'choosing' && (
          <View style={s.choices}>
            <Text style={s.choicePrompt}>{t('chooseYourSide')}</Text>
            <View style={s.btnsRow}>
              <TouchableOpacity
                style={s.choiceBtn}
                onPress={() => handleChoice('pile')}
              >
                <Text style={s.choiceBtnTxt}>{t('heads')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.choiceBtn}
                onPress={() => handleChoice('face')}
              >
                <Text style={s.choiceBtnTxt}>{t('tails')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {phase === 'flipping' && (
          <Text style={s.flippingTxt}>{t('flipping')}</Text>
        )}

        {/* ── Résultat ─────────────────────────────────────────── */}
        {phase === 'revealed' && (
          <View style={s.outcome}>
            <View style={s.outcomeBox}>
              <Text style={s.outcomeTitle}>
                {humanWon ? t('youWon') : t('botWon')}
              </Text>
              <Text style={s.outcomeSub}>
                {humanWon ? t('youAreDealer') : t('botIsDealer')}
              </Text>
            </View>

            <TouchableOpacity style={s.startBtn} onPress={handleStart}>
              <Text style={s.startBtnTxt}>{t('startGame')}</Text>
            </TouchableOpacity>
          </View>
        )}

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

  // En-tête
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
    letterSpacing: 0.8,
  },

  // Pièce
  coinArea: {
    alignItems: 'center',
    gap: 16,
    paddingVertical: 20,
  },
  resultLabel: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 22,
    color: C.brass,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // Choix
  choices: {
    alignItems: 'center',
    gap: 20,
    marginTop: 12,
  },
  choicePrompt: {
    fontSize: 14,
    color: C.boneOff,
    letterSpacing: 0.6,
  },
  btnsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  choiceBtn: {
    backgroundColor: C.brass,
    borderRadius: 10,
    paddingHorizontal: 32,
    paddingVertical: 14,
    minWidth: 110,
    alignItems: 'center',
  },
  choiceBtnTxt: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 15,
    color: C.ink,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  flippingTxt: {
    fontFamily: 'Cairo_400Regular',
    textAlign: 'center',
    color: C.boneOff,
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 24,
  },

  // Résultat
  outcome: {
    marginTop: 20,
    gap: 24,
    alignItems: 'center',
  },
  outcomeBox: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  outcomeTitle: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 18,
    color: C.bone,
  },
  outcomeSub: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 13,
    color: C.boneOff,
    textAlign: 'center',
    lineHeight: 20,
  },
  startBtn: {
    backgroundColor: C.brass,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
  },
  startBtnTxt: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 15,
    color: C.ink,
    letterSpacing: 0.5,
  },
})

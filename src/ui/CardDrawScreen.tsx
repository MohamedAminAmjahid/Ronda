import { useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { PlayerId, Value, Suit } from '../engine/types'
import { HUMAN_ID, BOT_ID } from '../game'
import { CardFace, CardBack } from './components/Card'

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
} as const

const VALUES: Value[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]
const SUITS: Suit[]   = ['oros', 'copas', 'espadas', 'bastos']

function randomCard(): { value: Value; suit: Suit } {
  return {
    value: VALUES[Math.floor(Math.random() * VALUES.length)],
    suit:  SUITS[Math.floor(Math.random() * SUITS.length)],
  }
}

type DrawPhase = 'ready' | 'animating' | 'revealed' | 'tie'

interface Props {
  onStart: (firstDealer: PlayerId) => void
  onBack:  () => void
}

export function CardDrawScreen({ onStart, onBack }: Props) {
  const [phase,       setPhase]       = useState<DrawPhase>('ready')
  const [humanCard,   setHumanCard]   = useState<{ value: Value; suit: Suit } | null>(null)
  const [botCard,     setBotCard]     = useState<{ value: Value; suit: Suit } | null>(null)
  const [humanFaceUp, setHumanFaceUp] = useState(false)
  const [botFaceUp,   setBotFaceUp]   = useState(false)

  const humanScaleX = useRef(new Animated.Value(1)).current
  const botScaleX   = useRef(new Animated.Value(1)).current

  function flipOne(
    scale: Animated.Value,
    setFaceUp: (v: boolean) => void,
    onDone: () => void,
  ) {
    Animated.timing(scale, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setFaceUp(true)
      Animated.timing(scale, { toValue: 1, duration: 150, useNativeDriver: true }).start(onDone)
    })
  }

  const handleDraw = () => {
    const h = randomCard()
    const b = randomCard()
    setHumanCard(h)
    setBotCard(b)
    setHumanFaceUp(false)
    setBotFaceUp(false)
    humanScaleX.setValue(1)
    botScaleX.setValue(1)
    setPhase('animating')

    flipOne(humanScaleX, setHumanFaceUp, () => {
      setTimeout(() => {
        flipOne(botScaleX, setBotFaceUp, () => {
          setPhase(h.value === b.value ? 'tie' : 'revealed')
        })
      }, 250)
    })
  }

  const handleRedraw = () => {
    setHumanCard(null)
    setBotCard(null)
    setHumanFaceUp(false)
    setBotFaceUp(false)
    humanScaleX.setValue(1)
    botScaleX.setValue(1)
    setPhase('ready')
  }

  const humanWon = humanCard !== null && botCard !== null && humanCard.value > botCard.value

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>

        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>← Rituels</Text>
          </TouchableOpacity>
          <Text style={s.title}>Tirer une carte</Text>
          <Text style={s.subtitle}>La plus haute l'emporte — la couleur ne compte pas</Text>
        </View>

        {/* ── Deux cartes ───────────────────────────────────── */}
        <View style={s.cardsRow}>
          <View style={s.cardSlot}>
            <Text style={s.slotLabel}>Vous</Text>
            <Animated.View style={{ transform: [{ scaleX: humanScaleX }] }}>
              {humanFaceUp && humanCard
                ? <CardFace card={humanCard} size="lg" />
                : <CardBack size="lg" />}
            </Animated.View>
            {phase !== 'ready' && humanCard && (
              <Text style={s.cardValue}>{humanCard.value}</Text>
            )}
          </View>

          <Text style={s.vsTxt}>VS</Text>

          <View style={s.cardSlot}>
            <Text style={s.slotLabel}>Bot</Text>
            <Animated.View style={{ transform: [{ scaleX: botScaleX }] }}>
              {botFaceUp && botCard
                ? <CardFace card={botCard} size="lg" />
                : <CardBack size="lg" />}
            </Animated.View>
            {phase !== 'ready' && botCard && (
              <Text style={s.cardValue}>{botCard.value}</Text>
            )}
          </View>
        </View>

        <View style={{ flex: 1 }} />

        {/* ── Actions ───────────────────────────────────────── */}
        {phase === 'ready' && (
          <TouchableOpacity style={s.btnPrimary} onPress={handleDraw}>
            <Text style={s.btnPrimaryTxt}>Tirer les cartes</Text>
          </TouchableOpacity>
        )}

        {phase === 'revealed' && (
          <View style={s.outcome}>
            <View style={s.outcomeBox}>
              <Text style={s.outcomeTitle}>
                {humanWon ? 'Vous avez gagné !' : 'Le bot a gagné.'}
              </Text>
              <Text style={s.outcomeSub}>
                {humanWon
                  ? 'Vous êtes donneur — le bot pose la première carte.'
                  : 'Le bot est donneur — vous posez la première carte.'}
              </Text>
            </View>
            <TouchableOpacity
              style={s.btnPrimary}
              onPress={() => onStart(humanWon ? HUMAN_ID : BOT_ID)}
            >
              <Text style={s.btnPrimaryTxt}>Commencer la partie</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'tie' && (
          <View style={s.outcome}>
            <View style={s.outcomeBox}>
              <Text style={s.outcomeTitle}>Égalité !</Text>
              <Text style={s.outcomeSub}>
                Vous {humanCard?.value} — Bot {botCard?.value}
              </Text>
              <Text style={s.outcomeSub}>On tire à nouveau.</Text>
            </View>
            <TouchableOpacity style={s.btnPrimary} onPress={handleRedraw}>
              <Text style={s.btnPrimaryTxt}>Tirer à nouveau</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 24 }} />
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
    paddingBottom: 28,
    alignItems: 'center',
    gap: 6,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    marginBottom: 8,
  },
  backTxt: {
    color: C.boneOff,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 26,
    color: C.bone,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 12,
    color: C.boneOff,
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  cardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 24,
  },
  cardSlot: {
    alignItems: 'center',
    gap: 10,
  },
  slotLabel: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: C.boneOff,
  },
  cardValue: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 20,
    color: C.brass,
    letterSpacing: 0.5,
  },
  vsTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(244,236,216,0.2)',
    letterSpacing: 2,
    marginTop: 20,
  },

  outcome: {
    gap: 16,
    alignItems: 'center',
  },
  outcomeBox: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  outcomeTitle: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 20,
    color: C.bone,
  },
  outcomeSub: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 13,
    color: C.boneOff,
    textAlign: 'center',
    lineHeight: 20,
  },

  btnPrimary: {
    backgroundColor: C.brass,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
    shadowColor: C.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  btnPrimaryTxt: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 15,
    color: C.ink,
    letterSpacing: 0.5,
  },
})

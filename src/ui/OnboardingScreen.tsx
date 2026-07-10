import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { ChestSVG } from './DailyChestModal'
import { CardBack } from './components/Card'
import { addGold } from '../profile/profile'

const C = {
  gradTop: '#0D0D1A' as const,
  gradBot: '#1A0D2E' as const,
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.60)',
  ink:     '#1C2622',
  card:    'rgba(0,0,0,0.28)',
} as const

const STEP_COUNT = 5
const STARTER_GOLD = 200

interface Props {
  /** startGame = true → lance une 1re partie (vs bot), sinon retour à l'accueil. */
  onDone: (startGame: boolean) => void
}

export function OnboardingScreen({ onDone }: Props) {
  const [step, setStep] = useState(0)
  const [game, setGame] = useState<'ronda' | 'dijouj' | null>(null)
  const [chestOpened, setChestOpened] = useState(false)

  // Transition d'entrée à chaque étape (fondu + léger glissement).
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    anim.setValue(0)
    Animated.timing(anim, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [step, anim])

  const next = () => { if (step < STEP_COUNT - 1) setStep(step + 1) }

  const enterStyle = {
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
  }

  return (
    <LinearGradient colors={[C.gradTop, C.gradBot]} style={s.root}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>

        {/* Passer */}
        <View style={s.topBar}>
          {step < STEP_COUNT - 1 && (
            <TouchableOpacity onPress={() => onDone(false)} hitSlop={10} activeOpacity={0.7}>
              <Text style={s.skip}>Passer</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Contenu de l'étape */}
        <Animated.View style={[s.body, enterStyle]}>
          {step === 0 && <StepWelcome />}
          {step === 1 && <StepChooseGame selected={game} onSelect={setGame} />}
          {step === 2 && <StepRules />}
          {step === 3 && (
            <StepBonus
              opened={chestOpened}
              onOpen={() => { if (!chestOpened) { setChestOpened(true); addGold(STARTER_GOLD) } }}
            />
          )}
          {step === 4 && <StepReady />}
        </Animated.View>

        {/* Progression */}
        <View style={s.dots}>
          {Array.from({ length: STEP_COUNT }).map((_, i) => (
            <View key={i} style={[s.dot, i === step && s.dotActive]} />
          ))}
        </View>

        {/* Bouton principal */}
        <View style={s.footer}>
          {step < STEP_COUNT - 1 ? (
            <TouchableOpacity
              style={[s.cta, step === 3 && !chestOpened && s.ctaDim]}
              onPress={next}
              disabled={step === 3 && !chestOpened}
              activeOpacity={0.85}
            >
              <Text style={s.ctaTxt}>{step === 3 && !chestOpened ? 'Ouvre ton coffre ☝️' : 'Continuer'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.cta} onPress={() => onDone(true)} activeOpacity={0.85}>
              <Text style={s.ctaTxt}>🎮 Jouer ma première partie</Text>
            </TouchableOpacity>
          )}
        </View>

      </SafeAreaView>
    </LinearGradient>
  )
}

// ── Étape 1 : Bienvenue ────────────────────────────────────────────────────────

function StepWelcome() {
  const pulse = useRef(new Animated.Value(0.9)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.06, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.9,  duration: 900, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [pulse])
  return (
    <View style={s.center}>
      <Animated.Text style={[s.logo, { transform: [{ scale: pulse }] }]}>🎴</Animated.Text>
      <Text style={s.title}>Bienvenue dans{'\n'}Dar Lwar9a TM !</Text>
      <Text style={s.sub}>Les jeux de cartes marocains, en ligne. Joue contre l'ordi ou tes amis, monte au classement, gagne de l'or.</Text>
    </View>
  )
}

// ── Étape 2 : Choisis ton jeu ────────────────────────────────────────────────

function StepChooseGame({ selected, onSelect }: { selected: 'ronda' | 'dijouj' | null; onSelect: (g: 'ronda' | 'dijouj') => void }) {
  return (
    <View style={s.center}>
      <Text style={s.title}>Choisis ton jeu</Text>
      <TouchableOpacity style={[s.gameCard, selected === 'ronda' && s.gameCardSel]} onPress={() => onSelect('ronda')} activeOpacity={0.85}>
        <Text style={s.gameIcon}>🃏</Text>
        <View style={s.gameBody}>
          <Text style={s.gameName}>Ronda</Text>
          <Text style={s.gameDesc}>Capture les cartes de la table et enchaîne les combinaisons. Premier à 41 points gagne.</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={[s.gameCard, selected === 'dijouj' && s.gameCardSel]} onPress={() => onSelect('dijouj')} activeOpacity={0.85}>
        <Text style={s.gameIcon}>🎴</Text>
        <View style={s.gameBody}>
          <Text style={s.gameName}>Di Jouj</Text>
          <Text style={s.gameDesc}>Débarrasse-toi de toutes tes cartes en suivant couleur ou valeur. Rapide et nerveux !</Text>
        </View>
      </TouchableOpacity>
    </View>
  )
}

// ── Étape 3 : Règles de base (Ronda) ─────────────────────────────────────────

function StepRules() {
  const deal = useRef(new Animated.Value(0)).current
  useEffect(() => {
    deal.setValue(0)
    Animated.timing(deal, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [deal])
  return (
    <View style={s.center}>
      <Text style={s.title}>Les règles de base</Text>
      <View style={s.cardsRow}>
        {[0, 1, 2].map((i) => (
          <Animated.View
            key={i}
            style={{
              marginLeft: i > 0 ? -18 : 0,
              opacity: deal,
              transform: [
                { translateY: deal.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) },
                { rotate: `${(i - 1) * 8}deg` },
              ],
            }}
          >
            <CardBack size="md" />
          </Animated.View>
        ))}
      </View>
      <View style={s.ruleCard}>
        <Text style={s.ruleLine}>🎯 Le but : atteindre <Text style={s.ruleHi}>41 points</Text>.</Text>
        <Text style={s.ruleLine}>🃏 Annonce <Text style={s.ruleHi}>Ronda</Text> quand tu as 2 cartes identiques en main.</Text>
        <Text style={s.ruleLine}>⚡ Capture les cartes de la table pour marquer.</Text>
      </View>
    </View>
  )
}

// ── Étape 4 : Ton premier bonus ──────────────────────────────────────────────

function StepBonus({ opened, onOpen }: { opened: boolean; onOpen: () => void }) {
  const coins = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!opened) return
    coins.setValue(0)
    Animated.timing(coins, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [opened, coins])
  return (
    <View style={s.center}>
      <Text style={s.title}>Ton premier bonus</Text>
      <View style={s.chestZone}>
        {opened && [0, 1, 2, 3].map((i) => (
          <Animated.Text
            key={i}
            style={[
              s.coin,
              {
                left: 30 + i * 30,
                opacity: coins.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0, 1, 0] }),
                transform: [{ translateY: coins.interpolate({ inputRange: [0, 1], outputRange: [-10, 70] }) }],
              },
            ]}
          >🪙</Animated.Text>
        ))}
        <TouchableOpacity onPress={onOpen} activeOpacity={0.85} disabled={opened}>
          <ChestSVG level="gold" size={120} />
        </TouchableOpacity>
      </View>
      {opened ? (
        <Text style={s.bonusOk}>🎉 +{STARTER_GOLD} 🪙 crédités !</Text>
      ) : (
        <Text style={s.sub}>Tape le coffre pour recevoir <Text style={s.ruleHi}>{STARTER_GOLD} 🪙</Text> de départ !</Text>
      )}
    </View>
  )
}

// ── Étape 5 : Prêt à jouer ────────────────────────────────────────────────────

function StepReady() {
  return (
    <View style={s.center}>
      <Text style={s.logo}>🏆</Text>
      <Text style={s.title}>Prêt à jouer !</Text>
      <Text style={s.sub}>Lance ta première partie contre l'ordinateur pour te faire la main. Bonne chance !</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, alignItems: 'center' },
  topBar: { width: '100%', maxWidth: 460, flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 8, minHeight: 30 },
  skip: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.boneOff },

  body: { flex: 1, width: '100%', maxWidth: 460, paddingHorizontal: 28, justifyContent: 'center' },
  center: { alignItems: 'center', gap: 16 },

  logo:  { fontSize: 72, lineHeight: 84 },
  title: { fontFamily: 'Cairo_600SemiBold', fontSize: 26, color: C.bone, textAlign: 'center', lineHeight: 34 },
  sub:   { fontFamily: 'Cairo_400Regular', fontSize: 15, color: C.boneOff, textAlign: 'center', lineHeight: 23, paddingHorizontal: 6 },

  gameCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, width: '100%',
    backgroundColor: C.card, borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: 'rgba(201,162,39,0.20)',
  },
  gameCardSel: { borderColor: C.brass, backgroundColor: 'rgba(201,162,39,0.12)' },
  gameIcon: { fontSize: 40 },
  gameBody: { flex: 1, gap: 4 },
  gameName: { fontFamily: 'Cairo_600SemiBold', fontSize: 19, color: C.brass },
  gameDesc: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff, lineHeight: 19 },

  cardsRow: { flexDirection: 'row', justifyContent: 'center', marginVertical: 8 },
  ruleCard: {
    width: '100%', backgroundColor: C.card, borderRadius: 16, padding: 18, gap: 12,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.18)',
  },
  ruleLine: { fontFamily: 'Cairo_400Regular', fontSize: 15, color: C.bone, lineHeight: 22 },
  ruleHi:   { fontFamily: 'Cairo_600SemiBold', color: C.brass },

  chestZone: { width: 200, height: 150, alignItems: 'center', justifyContent: 'center' },
  coin: { position: 'absolute', top: 0, fontSize: 26 },
  bonusOk: { fontFamily: 'Cairo_600SemiBold', fontSize: 20, color: C.brass, textAlign: 'center' },

  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center', paddingVertical: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(244,236,216,0.20)' },
  dotActive: { backgroundColor: C.brass, width: 22 },

  footer: { width: '100%', maxWidth: 460, paddingHorizontal: 28, paddingBottom: 16 },
  cta: {
    backgroundColor: C.brass, borderRadius: 16, paddingVertical: 17, alignItems: 'center',
    shadowColor: C.brass, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  ctaDim: { opacity: 0.5 },
  ctaTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 17, color: C.ink, letterSpacing: 0.3 },
})

import { useState, useMemo, useRef, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Modal, Animated, useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams, type Href } from 'expo-router'
import { useI18n } from '../i18n/useI18n'
import { useDiJoujGame, DJ_HUMAN_ID } from '../game/useDiJoujGame'
import { isPlayable } from '../engine-dijouj/game'
import type { Card, Suit } from '../engine-dijouj/types'
import { CardFace, CardBack } from './components/Card'

const DJ_BET:   Href = '/bet?game=dijouj' as Href
const DJ_LOBBY: Href = '/dijouj-lobby'   as Href

// ── Palette ───────────────────────────────────────────────────────────────────

const C = {
  gradTop: '#1A0008' as const,
  gradBot: '#2D0A1E' as const,
  surface: '#3D1030',
  acc:     '#8B1A4A',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.50)',
  ghost:   'rgba(244,236,216,0.12)',
  red:     '#C0392B',
  amber:   '#8B5E2A',
} as const

const SUITS: Suit[] = ['oros', 'copas', 'espadas', 'bastos']
const SUIT_COLOR: Record<Suit, string> = {
  oros: '#C9A227', copas: '#C0392B', espadas: '#2980B9', bastos: '#27AE60',
}
const SUIT_RANK: Record<Suit, number> = { oros: 0, copas: 1, espadas: 2, bastos: 3 }
function cardKey(c: Card) { return `${c.suit}_${c.value}` }

// ── Helper : rangée de dos de cartes ─────────────────────────────────────────

function CardBackRow({ count, max = 8 }: { count: number; max?: number }) {
  const visible = Math.min(count, max)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {Array.from({ length: visible }).map((_, i) => (
        <View key={i} style={{ marginLeft: i > 0 ? -22 : 0 }}>
          <CardBack size="sm" />
        </View>
      ))}
    </View>
  )
}

// ── Menu Di Jouj ──────────────────────────────────────────────────────────────

function DiJoujMenu() {
  const { t } = useI18n()
  return (
    <LinearGradient colors={[C.gradTop, C.gradBot]} style={s.root}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={s.backBtn}>
            <Text style={s.backTxt}>{t('back')}</Text>
          </TouchableOpacity>
          <Text style={s.title}>DI JOUJ</Text>
          <View style={s.headerSpacer} />
        </View>
        <View style={s.menuCenter}>
          <Text style={s.menuTagline}>{t('dijoujCardDesc')}</Text>
          <View style={s.menuCards}>
            <TouchableOpacity style={s.menuCard} onPress={() => router.push(DJ_BET)} activeOpacity={0.85}>
              <LinearGradient colors={['#4D1028', '#2D0A1E']} style={s.menuCardGrad}>
                <Text style={s.menuCardEmoji}>⚡</Text>
                <View style={s.menuCardText}>
                  <Text style={s.menuCardTitle}>{t('playOnline')}</Text>
                  <Text style={s.menuCardSub}>{t('quickMatch')}</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={s.menuCard} onPress={() => router.push(DJ_LOBBY)} activeOpacity={0.85}>
              <LinearGradient colors={['#4D1028', '#2D0A1E']} style={s.menuCardGrad}>
                <Text style={s.menuCardEmoji}>👥</Text>
                <View style={s.menuCardText}>
                  <Text style={s.menuCardTitle}>{t('playWithFriend')}</Text>
                  <Text style={s.menuCardSub}>2 – 4 {t('djPlayers')}</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  )
}

// ── Jeu local 1v1 (vs Bot) ────────────────────────────────────────────────────

function LocalGame({ onBack }: { onBack: () => void }) {
  const { width } = useWindowDimensions()
  const isSmall   = width < 430
  // Hand cards: sm (46×69) on mobile so all 7 fit without scroll
  const cardSz    = isSmall ? 'sm' : 'lg' as const
  // Pile / discard: one step smaller on mobile
  const pileSz    = isSmall ? 'lg' : 'xl' as const
  const pileWH    = isSmall ? { w: 72, h: 108 } : { w: 80, h: 120 }
  const handGap   = isSmall ? 3 : 8

  const { t } = useI18n()
  const {
    state, isHumanTurn, isBotThinking, isAutoSkipping, isDrawPause,
    playCard, draw, isGameOver, winner, restart,
  } = useDiJoujGame()

  const [pendingWild, setPendingWild] = useState<Card | null>(null)

  const human   = state.players[DJ_HUMAN_ID]
  const bot     = state.players.find(p => p.id !== DJ_HUMAN_ID)!
  const topCard = state.discardPile[state.discardPile.length - 1]

  const sortedHand = useMemo(
    () => [...human.hand].sort((a, b) => SUIT_RANK[a.suit] - SUIT_RANK[b.suit] || a.value - b.value),
    [human.hand],
  )

  const playableSet = useMemo<Set<string>>(() => {
    if (!isHumanTurn) return new Set()
    return new Set(
      human.hand
        .filter(c => isPlayable(c, topCard, state.chosenSuit, state.pendingEffect))
        .map(cardKey),
    )
  }, [isHumanTurn, human.hand, topCard, state.chosenSuit, state.pendingEffect])

  // ── Animations ───────────────────────────────────────────────────────────────

  const discardScale = useRef(new Animated.Value(1)).current
  const prevTopKey   = useRef('')
  const topKey       = topCard ? cardKey(topCard) : ''

  useEffect(() => {
    if (prevTopKey.current && prevTopKey.current !== topKey) {
      discardScale.setValue(0.85)
      Animated.spring(discardScale, { toValue: 1, friction: 6, tension: 180, useNativeDriver: true }).start()
    }
    prevTopKey.current = topKey
  }, [topKey])

  const lastCardPulse = useRef(new Animated.Value(1)).current
  const [showLastCardMsg, setShowLastCardMsg] = useState(false)

  useEffect(() => {
    if (!isGameOver) { setShowLastCardMsg(false); return }
    setShowLastCardMsg(true)
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(lastCardPulse, { toValue: 0.35, duration: 350, useNativeDriver: true }),
      Animated.timing(lastCardPulse, { toValue: 1.0,  duration: 350, useNativeDriver: true }),
    ]))
    loop.start()
    const tid = setTimeout(() => { loop.stop(); lastCardPulse.setValue(1); setShowLastCardMsg(false) }, 2000)
    return () => { clearTimeout(tid); loop.stop(); lastCardPulse.setValue(1) }
  }, [isGameOver])

  // Halo défausse : couleur active selon la couleur de la carte du dessus
  const haloOpacity = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(haloOpacity, { toValue: 0.85, duration: 900, useNativeDriver: false }),
        Animated.timing(haloOpacity, { toValue: 0.30, duration: 900, useNativeDriver: false }),
      ]),
    ).start()
  }, [haloOpacity])
  const haloColor = topCard ? SUIT_COLOR[topCard.suit] : C.brass

  // Pulsation bordure laiton sur les cartes jouables
  const playablePulse = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(playablePulse, { toValue: 1, duration: 600, useNativeDriver: false }),
        Animated.timing(playablePulse, { toValue: 0.4, duration: 600, useNativeDriver: false }),
      ]),
    ).start()
  }, [playablePulse])

  // Indicateur de tour animé
  const turnArrow = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!isHumanTurn) { turnArrow.setValue(0); return }
    Animated.loop(
      Animated.sequence([
        Animated.timing(turnArrow, { toValue: 4, duration: 400, useNativeDriver: true }),
        Animated.timing(turnArrow, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ).start()
    return () => { turnArrow.setValue(0) }
  }, [isHumanTurn, turnArrow])

  const botOpacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!isHumanTurn && !isGameOver) {
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(botOpacity, { toValue: 0.45, duration: 750, useNativeDriver: true }),
        Animated.timing(botOpacity, { toValue: 1.00, duration: 750, useNativeDriver: true }),
      ]))
      loop.start()
      return () => { loop.stop(); botOpacity.setValue(1) }
    }
    botOpacity.setValue(1)
  }, [isHumanTurn, isGameOver])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleCardPress(card: Card) {
    if (!isHumanTurn) return
    if (!playableSet.has(cardKey(card))) return
    if (card.value === 7 && card.suit === 'oros') { setPendingWild(card) }
    else { playCard(card) }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  let statusText: string
  if (isBotThinking)    statusText = t('botThinks').replace('{name}', 'Bot')
  else if (isDrawPause) statusText = t('botTurn')
  else if (isHumanTurn) statusText = t('yourTurn')
  else                  statusText = t('botTurn')

  const pendingEff = state.pendingEffect
  let bannerText: string | null = null
  let bannerBg: string = C.acc
  if (pendingEff?.type === 'draw2')  { bannerText = `+${pendingEff.count} ${t('djDraw')}`; bannerBg = C.red }
  else if (pendingEff?.type === 'skip') { bannerText = t('djSkip'); bannerBg = C.amber }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={[C.gradTop, C.gradBot]} style={s.root}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={s.backBtn}>
            <Text style={s.backTxt}>{t('back')}</Text>
          </TouchableOpacity>
          <Text style={[s.title, isSmall && { fontSize: 15, letterSpacing: 3 }]}>DI JOUJ</Text>
          <View style={s.headerSpacer} />
        </View>

        {/* ── Top : adversaire (Bot) ────────────────────────────────────────── */}
        <Animated.View style={[s.topZone, { opacity: botOpacity }]}>
          <CardBackRow count={bot.hand.length} />
          <Text style={s.oppLabel}>Bot — {bot.hand.length}</Text>
        </Animated.View>

        {/* ── Bannière effet ────────────────────────────────────────────────── */}
        {bannerText !== null && (
          <View style={[s.banner, { backgroundColor: bannerBg }]}>
            <Text style={s.bannerTxt}>{bannerText}</Text>
            {isAutoSkipping && <Text style={s.autoSkipTxt}>{t('djAutoSkip')}</Text>}
          </View>
        )}

        {/* ── Milieu : pioche + défausse (1v1 : pas de zones latérales) ──────── */}
        <View style={s.middleRow}>
          <View style={s.tableCenter}>
            {/* Pioche */}
            <TouchableOpacity
              activeOpacity={isHumanTurn && !isDrawPause ? 0.75 : 1}
              onPress={() => isHumanTurn && !isDrawPause && draw()}
              style={[s.pileWrap, (!isHumanTurn || isDrawPause) && s.pileInactive]}
            >
              {state.drawPile.length > 0
                ? <CardBack size={pileSz} />
                : <View style={[s.emptyPile, { width: pileWH.w, height: pileWH.h }]}><Text style={s.emptyPileTxt}>∅</Text></View>
              }
              <Text style={s.pileCount}>{state.drawPile.length}</Text>
            </TouchableOpacity>

            {/* Défausse */}
            <View style={s.discardWrap}>
              <Animated.View style={{
                borderRadius: 12,
                shadowColor: haloColor,
                shadowOpacity: haloOpacity,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 0 },
                elevation: 12,
              }}>
                <Animated.View style={{ transform: [{ scale: discardScale }] }}>
                  {topCard
                    ? <CardFace card={topCard} size={pileSz} />
                    : <View style={[s.emptyPile, { width: pileWH.w, height: pileWH.h }]} />
                  }
                </Animated.View>
              </Animated.View>
              {state.chosenSuit && (
                <View style={[s.suitDot, { backgroundColor: SUIT_COLOR[state.chosenSuit] }]}>
                  <Text style={s.suitDotTxt}>{state.chosenSuit}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── Statut ────────────────────────────────────────────────────────── */}
        <View style={s.statusBar}>
          {isHumanTurn ? (
            <>
              <Animated.Text style={[s.turnArrowL, { transform: [{ translateX: turnArrow }] }]}>▶</Animated.Text>
              <Text style={[s.statusTxt, s.statusTxtActive]}>{statusText}</Text>
              <Animated.Text style={[s.turnArrowR, { transform: [{ translateX: Animated.multiply(turnArrow, -1) }] }]}>◀</Animated.Text>
            </>
          ) : (
            <Text style={s.statusTxt}>{statusText}</Text>
          )}
        </View>

        {/* ── Main ─────────────────────────────────────────────────────────── */}
        <View style={s.handZone}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={[s.handScroll, { gap: handGap }]} overScrollMode="never">
            {sortedHand.map((card, i) => {
              const playable = playableSet.has(cardKey(card))
              return (
                <Animated.View key={i} style={[
                  s.humanCard,
                  !playable && s.humanCardDimmed,
                  playable && {
                    shadowColor: C.brass,
                    shadowOpacity: playablePulse,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 0 },
                    elevation: 8,
                  },
                ]}>
                  <CardFace
                    card={card} size={cardSz} highlighted={playable}
                    disabled={!playable || !isHumanTurn}
                    onPress={() => handleCardPress(card)}
                  />
                </Animated.View>
              )
            })}
          </ScrollView>
        </View>

        {/* ── Modal couleur ─────────────────────────────────────────────────── */}
        <Modal visible={pendingWild !== null} transparent animationType="fade">
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>{t('djChooseSuit')}</Text>
              <View style={s.suitGrid}>
                {SUITS.map(suit => (
                  <TouchableOpacity key={suit} style={[s.suitBtn, { borderColor: SUIT_COLOR[suit] }]}
                    onPress={() => { playCard(pendingWild!, suit); setPendingWild(null) }} activeOpacity={0.8}>
                    <View style={[s.suitCircle, { backgroundColor: SUIT_COLOR[suit] }]} />
                    <Text style={s.suitLabel}>{suit}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={() => setPendingWild(null)} style={s.cancelBtn}>
                <Text style={s.cancelTxt}>{t('cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* "Dernière carte" */}
        {isGameOver && showLastCardMsg && (
          <View style={s.overlay} pointerEvents="none">
            <Animated.Text style={[s.lastCardTxt, { opacity: lastCardPulse }]}>
              {t('djLastCard')}
            </Animated.Text>
          </View>
        )}

        {/* Game over */}
        {isGameOver && !showLastCardMsg && (
          <View style={s.overlay}>
            <View style={s.overlayBox}>
              <Text style={s.overlayEmoji}>{winner === DJ_HUMAN_ID ? '🏆' : '😔'}</Text>
              <Text style={s.overlayTitle}>
                {winner === DJ_HUMAN_ID ? t('djYouWin') : t('djYouLose')}
              </Text>
              <TouchableOpacity style={s.restartBtn} onPress={restart} activeOpacity={0.8}>
                <Text style={s.restartTxt}>{t('djNewGame')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={s.backFromOverlay}>
                <Text style={s.backFromOverlayTxt}>{t('back')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      </SafeAreaView>
    </LinearGradient>
  )
}

// ── Écran principal ───────────────────────────────────────────────────────────

export function DiJoujScreen() {
  const { train } = useLocalSearchParams<{ train?: string }>()
  const [mode, setMode] = useState<'menu' | 'local'>(train === '1' ? 'local' : 'menu')
  if (mode === 'local') return <LocalGame onBack={() => setMode('menu')} />
  return <DiJoujMenu />
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
  },
  backBtn:      { paddingRight: 12, paddingVertical: 6 },
  backTxt:      { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  title: {
    flex: 1, textAlign: 'center',
    fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 20, letterSpacing: 6,
  },
  headerSpacer: { width: 60 },

  // Menu
  menuCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 24 },
  menuTagline: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 14, textAlign: 'center' },
  menuCards:   { width: '100%', gap: 12 },
  menuCard:    { borderRadius: 16, overflow: 'hidden' },
  menuCardGrad: { paddingVertical: 18, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  menuCardEmoji: { fontSize: 28, lineHeight: 34 },
  menuCardText:  { flex: 1 },
  menuCardTitle: { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 16 },
  menuCardSub:   { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 12, marginTop: 2 },

  // ── Game 1v1 ──────────────────────────────────────────────────────────────

  // Top zone (opponent)
  topZone: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  oppLabel: {
    fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 11, letterSpacing: 0.5,
  },

  // Banner
  banner: {
    marginHorizontal: 28, marginVertical: 2, borderRadius: 8, paddingVertical: 5, alignItems: 'center',
  },
  bannerTxt:   { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 13, letterSpacing: 0.5 },
  autoSkipTxt: {
    fontFamily: 'Cairo_400Regular', color: 'rgba(244,236,216,0.75)', fontSize: 11, marginTop: 2,
  },

  // Middle row
  middleRow: {
    flex: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Table center
  tableCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },

  // Pile
  pileWrap:    { alignItems: 'center', gap: 6 },
  pileInactive: { opacity: 0.45 },
  pileCount:   { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 12 },
  emptyPile: {
    width: 80, height: 120, borderRadius: 8, borderWidth: 1, borderColor: C.ghost,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyPileTxt: { color: C.boneOff, fontSize: 24 },

  discardWrap: { alignItems: 'center', gap: 8 },
  suitDot: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, alignItems: 'center',
  },
  suitDotTxt: {
    fontFamily: 'Cairo_600SemiBold', color: '#fff', fontSize: 11, textTransform: 'capitalize',
  },

  // Status bar
  statusBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 6, gap: 8,
  },
  statusTxt: {
    fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 14, letterSpacing: 0.4, opacity: 0.85,
  },
  statusTxtActive: {
    color: C.brass, opacity: 1,
    textShadowColor: 'rgba(201,162,39,0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  turnArrowL: { fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 13 },
  turnArrowR: { fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 13 },

  // Hand zone
  handZone: { flex: 3, justifyContent: 'center', overflow: 'visible' },
  handScroll: {
    flexGrow: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8, gap: 8,
  },
  humanCard:       { overflow: 'visible' },
  humanCardDimmed: { opacity: 0.38 },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center',
  },
  modalBox: {
    backgroundColor: '#3D1030', borderRadius: 18, paddingVertical: 28, paddingHorizontal: 24,
    width: 300, alignItems: 'center', gap: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 20,
  },
  modalTitle: { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 16, letterSpacing: 0.5 },
  suitGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  suitBtn: {
    width: 128, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 2, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12,
  },
  suitCircle:  { width: 14, height: 14, borderRadius: 7 },
  suitLabel:   { fontFamily: 'Cairo_400Regular', color: C.bone, fontSize: 13, textTransform: 'capitalize' },
  cancelBtn:   { paddingVertical: 4 },
  cancelTxt:   { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },

  // Overlays
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(10,0,6,0.82)', alignItems: 'center', justifyContent: 'center',
  },
  lastCardTxt: {
    fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 36, letterSpacing: 1, textAlign: 'center',
    textShadowColor: 'rgba(201,162,39,0.75)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20,
    paddingHorizontal: 24,
  },
  overlayBox: {
    backgroundColor: '#3D1030', borderRadius: 22, paddingVertical: 40, paddingHorizontal: 44,
    alignItems: 'center', gap: 14, minWidth: 240,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.55, shadowRadius: 20, elevation: 24,
  },
  overlayEmoji: { fontSize: 56, lineHeight: 64 },
  overlayTitle: {
    fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 24, letterSpacing: 0.5, textAlign: 'center',
  },
  restartBtn: {
    marginTop: 6, backgroundColor: C.acc, borderRadius: 14,
    paddingVertical: 15, paddingHorizontal: 36, alignItems: 'center',
    shadowColor: C.acc, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 8,
  },
  restartTxt: { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 16, letterSpacing: 0.5 },
  backFromOverlay:    { marginTop: 4 },
  backFromOverlayTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
})

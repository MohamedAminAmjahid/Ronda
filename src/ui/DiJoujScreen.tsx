import { useState, useMemo, useRef, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Modal, Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { useI18n } from '../i18n/useI18n'
import { useDiJoujGame, DJ_HUMAN_ID } from '../game/useDiJoujGame'
import { isPlayable } from '../engine-dijouj/game'
import type { Card, Suit } from '../engine-dijouj/types'
import { CardFace, CardBack } from './components/Card'

// ── Palette ───────────────────────────────────────────────────────────────────

const C = {
  gradTop:  '#1A0008' as const,
  gradBot:  '#2D0A1E' as const,
  surface:  '#3D1030',
  acc:      '#8B1A4A',
  brass:    '#C9A227',
  bone:     '#F4ECD8',
  boneOff:  'rgba(244,236,216,0.50)',
  ghost:    'rgba(244,236,216,0.12)',
  red:      '#C0392B',
  amber:    '#8B5E2A',
} as const

const SUITS: Suit[] = ['oros', 'copas', 'espadas', 'bastos']

const SUIT_COLOR: Record<Suit, string> = {
  oros:    '#C9A227',
  copas:   '#C0392B',
  espadas: '#2980B9',
  bastos:  '#27AE60',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cardKey(c: Card) { return `${c.suit}_${c.value}` }

// ── Screen ────────────────────────────────────────────────────────────────────

export function DiJoujScreen() {
  const { t } = useI18n()
  const { state, isHumanTurn, isBotThinking, playCard, draw, isGameOver, winner, restart } =
    useDiJoujGame()

  const [pendingWild, setPendingWild] = useState<Card | null>(null)

  const human   = state.players[DJ_HUMAN_ID]
  const bot     = state.players.find(p => p.id !== DJ_HUMAN_ID)!
  const topCard = state.discardPile[state.discardPile.length - 1]

  // ── Playable set ─────────────────────────────────────────────────────────────

  const playableSet = useMemo<Set<string>>(() => {
    if (!isHumanTurn) return new Set()
    return new Set(
      human.hand
        .filter(c => isPlayable(c, topCard, state.chosenSuit, state.pendingEffect))
        .map(cardKey),
    )
  }, [isHumanTurn, human.hand, topCard, state.chosenSuit, state.pendingEffect])

  // ── Animations ───────────────────────────────────────────────────────────────

  // Discard card: scale pop when the top card changes
  const discardScale = useRef(new Animated.Value(1)).current
  const prevTopKey   = useRef('')
  const topKey       = topCard ? cardKey(topCard) : ''

  useEffect(() => {
    if (prevTopKey.current && prevTopKey.current !== topKey) {
      discardScale.setValue(0.85)
      Animated.spring(discardScale, {
        toValue:   1,
        friction:  6,
        tension:   180,
        useNativeDriver: true,
      }).start()
    }
    prevTopKey.current = topKey
  }, [topKey])

  // Bot cards: slow opacity pulse when it's the bot's turn
  const botOpacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!isHumanTurn && !isGameOver) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(botOpacity, { toValue: 0.45, duration: 750, useNativeDriver: true }),
          Animated.timing(botOpacity, { toValue: 1.00, duration: 750, useNativeDriver: true }),
        ]),
      )
      loop.start()
      return () => { loop.stop(); botOpacity.setValue(1) }
    }
    botOpacity.setValue(1)
  }, [isHumanTurn, isGameOver])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleCardPress(card: Card) {
    if (!isHumanTurn) return
    if (!playableSet.has(cardKey(card))) return
    if (card.value === 7 && card.suit === 'oros') {
      setPendingWild(card)
    } else {
      playCard(card)
    }
  }

  function handleSuitChoice(suit: Suit) {
    if (!pendingWild) return
    playCard(pendingWild, suit)
    setPendingWild(null)
  }

  // ── Derived display ───────────────────────────────────────────────────────────

  let statusText: string
  if (isBotThinking)   statusText = t('botThinks').replace('{name}', 'Bot')
  else if (isHumanTurn) statusText = t('yourTurn')
  else                  statusText = t('botTurn')

  const pendingEff = state.pendingEffect
  let bannerText: string | null = null
  let bannerBg: string = C.acc
  if (pendingEff?.type === 'draw2') {
    bannerText = `+${pendingEff.count} ${t('djDraw')}`
    bannerBg   = C.red
  } else if (pendingEff?.type === 'skip') {
    bannerText = t('djSkip')
    bannerBg   = C.amber
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <LinearGradient
      colors={[C.gradTop, C.gradBot]}
      style={s.root}
    >
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={s.backBtn}>
            <Text style={s.backTxt}>{t('back')}</Text>
          </TouchableOpacity>
          <Text style={s.title}>DI JOUJ</Text>
          <View style={s.headerSpacer} />
        </View>

        {/* ── Bot zone (flex 2 ≈ 20%) ────────────────────────────────────────── */}
        <Animated.View style={[s.botZone, { opacity: botOpacity }]}>
          <Text style={s.botLabel}>Bot — {bot.hand.length}</Text>
          <View style={s.botHand}>
            {bot.hand.map((_, i) => (
              <View
                key={i}
                style={[s.botCard, i > 0 && s.botCardOverlap]}
              >
                <CardBack size="md" />
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ── Pending effect banner ───────────────────────────────────────────── */}
        {bannerText !== null && (
          <View style={[s.banner, { backgroundColor: bannerBg }]}>
            <Text style={s.bannerTxt}>{bannerText}</Text>
          </View>
        )}

        {/* ── Table zone (flex 4 ≈ 40%) ──────────────────────────────────────── */}
        <View style={s.tableZone}>

          {/* Draw pile */}
          <TouchableOpacity
            activeOpacity={isHumanTurn ? 0.75 : 1}
            onPress={() => isHumanTurn && draw()}
            style={[s.pileWrap, !isHumanTurn && s.pileInactive]}
          >
            {state.drawPile.length > 0
              ? <CardBack size="xxl" />
              : <View style={s.emptyPile}><Text style={s.emptyPileTxt}>∅</Text></View>
            }
            <Text style={s.pileCount}>{state.drawPile.length}</Text>
          </TouchableOpacity>

          {/* Discard pile */}
          <View style={s.discardWrap}>
            <Animated.View style={{ transform: [{ scale: discardScale }] }}>
              {topCard
                ? <CardFace card={topCard} size="xxl" />
                : <View style={s.emptyPile} />
              }
            </Animated.View>
            {state.chosenSuit && (
              <View style={[s.suitDot, { backgroundColor: SUIT_COLOR[state.chosenSuit] }]}>
                <Text style={s.suitDotTxt}>{state.chosenSuit}</Text>
              </View>
            )}
          </View>

        </View>

        {/* ── Status indicator ───────────────────────────────────────────────── */}
        <View style={s.statusBar}>
          <Text style={s.statusTxt}>{statusText}</Text>
        </View>

        {/* ── Human hand (flex 4 ≈ 40%) ──────────────────────────────────────── */}
        <View style={s.humanZone}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.handScroll}
          >
            {human.hand.map((card, i) => {
              const playable = playableSet.has(cardKey(card))
              return (
                <View
                  key={i}
                  style={[
                    s.humanCard,
                    i > 0 && s.humanCardOverlap,
                    !playable && s.humanCardDimmed,
                  ]}
                >
                  <CardFace
                    card={card}
                    size="xl"
                    highlighted={playable}
                    disabled={!playable || !isHumanTurn}
                    onPress={() => handleCardPress(card)}
                  />
                </View>
              )
            })}
          </ScrollView>
        </View>

        {/* ── Color picker modal (7 de Oros) ─────────────────────────────────── */}
        <Modal visible={pendingWild !== null} transparent animationType="fade">
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>{t('djChooseSuit')}</Text>
              <View style={s.suitGrid}>
                {SUITS.map(suit => (
                  <TouchableOpacity
                    key={suit}
                    style={[s.suitBtn, { borderColor: SUIT_COLOR[suit] }]}
                    onPress={() => handleSuitChoice(suit)}
                    activeOpacity={0.8}
                  >
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

        {/* ── Game over overlay ───────────────────────────────────────────────── */}
        {isGameOver && (
          <View style={s.overlay}>
            <View style={s.overlayBox}>
              <Text style={s.overlayEmoji}>{winner === DJ_HUMAN_ID ? '🏆' : '😔'}</Text>
              <Text style={s.overlayTitle}>
                {winner === DJ_HUMAN_ID ? t('djYouWin') : t('djYouLose')}
              </Text>
              <TouchableOpacity style={s.restartBtn} onPress={restart} activeOpacity={0.8}>
                <Text style={s.restartTxt}>{t('djNewGame')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={s.backFromOverlay}>
                <Text style={s.backFromOverlayTxt}>{t('back')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      </SafeAreaView>
    </LinearGradient>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },

  // Header
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 16,
    paddingTop:     8,
    paddingBottom:  4,
  },
  backBtn:      { paddingRight: 12, paddingVertical: 6 },
  backTxt:      { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  title: {
    flex:        1,
    textAlign:   'center',
    fontFamily:  'Cairo_600SemiBold',
    color:       C.brass,
    fontSize:    20,
    letterSpacing: 6,
  },
  headerSpacer: { width: 60 },

  // Bot zone
  botZone: {
    flex:           2,
    alignItems:     'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  botLabel: {
    fontFamily: 'Cairo_400Regular',
    color:      C.boneOff,
    fontSize:   11,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  botHand: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    flexWrap:       'nowrap',
  },
  botCard:        { zIndex: 1 },
  botCardOverlap: { marginLeft: 10 },

  // Pending effect banner
  banner: {
    marginHorizontal: 28,
    marginVertical:   4,
    borderRadius:     8,
    paddingVertical:  5,
    alignItems:       'center',
  },
  bannerTxt: {
    fontFamily:   'Cairo_600SemiBold',
    color:        C.bone,
    fontSize:     13,
    letterSpacing: 0.5,
  },

  // Table zone
  tableZone: {
    flex:           4,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            28,
    paddingVertical: 8,
  },

  pileWrap: { alignItems: 'center', gap: 6 },
  pileInactive: { opacity: 0.45 },
  pileCount: {
    fontFamily: 'Cairo_400Regular',
    color:      C.boneOff,
    fontSize:   12,
  },
  emptyPile: {
    width: 100, height: 150,
    borderRadius:  8,
    borderWidth:   1,
    borderColor:   C.ghost,
    alignItems:    'center',
    justifyContent:'center',
  },
  emptyPileTxt: { color: C.boneOff, fontSize: 24 },

  discardWrap: { alignItems: 'center', gap: 8 },
  suitDot: {
    paddingHorizontal: 12,
    paddingVertical:   4,
    borderRadius:      14,
    alignItems:        'center',
  },
  suitDotTxt: {
    fontFamily:    'Cairo_600SemiBold',
    color:         '#fff',
    fontSize:      11,
    textTransform: 'capitalize',
  },

  // Status bar
  statusBar: {
    alignItems:    'center',
    paddingVertical: 6,
  },
  statusTxt: {
    fontFamily:   'Cairo_600SemiBold',
    color:        C.bone,
    fontSize:     14,
    letterSpacing: 0.4,
    opacity:      0.85,
  },

  // Human hand zone
  humanZone: {
    flex:          4,
    justifyContent:'center',
    paddingBottom: 4,
  },
  handScroll: {
    flexGrow:       1,
    justifyContent: 'center',
    alignItems:     'flex-end',
    paddingHorizontal: 16,
    paddingBottom:  12,
  },
  humanCard:        { zIndex: 1 },
  humanCardOverlap: { marginLeft: -22 },
  humanCardDimmed:  { opacity: 0.38 },

  // Color picker modal
  modalOverlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  modalBox: {
    backgroundColor: '#3D1030',
    borderRadius:    18,
    paddingVertical: 28,
    paddingHorizontal: 24,
    width:           300,
    alignItems:      'center',
    gap:             18,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 8 },
    shadowOpacity:   0.5,
    shadowRadius:    16,
    elevation:       20,
  },
  modalTitle: {
    fontFamily:   'Cairo_600SemiBold',
    color:        C.bone,
    fontSize:     16,
    letterSpacing: 0.5,
  },
  suitGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           12,
    justifyContent:'center',
  },
  suitBtn: {
    width:          128,
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    borderWidth:    2,
    borderRadius:   10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  suitCircle: {
    width:        14,
    height:       14,
    borderRadius: 7,
  },
  suitLabel: {
    fontFamily:    'Cairo_400Regular',
    color:         C.bone,
    fontSize:      13,
    textTransform: 'capitalize',
  },
  cancelBtn: { paddingVertical: 4 },
  cancelTxt: {
    fontFamily: 'Cairo_400Regular',
    color:      C.boneOff,
    fontSize:   13,
  },

  // Game over overlay
  overlay: {
    position:        'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(10,0,6,0.82)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  overlayBox: {
    backgroundColor: '#3D1030',
    borderRadius:    22,
    paddingVertical: 40,
    paddingHorizontal: 44,
    alignItems:      'center',
    gap:             14,
    minWidth:        240,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 10 },
    shadowOpacity:   0.55,
    shadowRadius:    20,
    elevation:       24,
  },
  overlayEmoji: { fontSize: 56, lineHeight: 64 },
  overlayTitle: {
    fontFamily:   'Cairo_600SemiBold',
    color:        C.bone,
    fontSize:     24,
    letterSpacing: 0.5,
    textAlign:    'center',
  },
  restartBtn: {
    marginTop:         6,
    backgroundColor:   C.acc,
    borderRadius:      14,
    paddingVertical:   15,
    paddingHorizontal: 36,
    alignItems:        'center',
    shadowColor:       C.acc,
    shadowOffset:      { width: 0, height: 4 },
    shadowOpacity:     0.5,
    shadowRadius:      8,
    elevation:         8,
  },
  restartTxt: {
    fontFamily:   'Cairo_600SemiBold',
    color:        C.bone,
    fontSize:     16,
    letterSpacing: 0.5,
  },
  backFromOverlay: { marginTop: 4 },
  backFromOverlayTxt: {
    fontFamily: 'Cairo_400Regular',
    color:      C.boneOff,
    fontSize:   13,
  },
})

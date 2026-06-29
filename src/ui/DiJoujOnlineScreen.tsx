import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Modal, Animated, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { useI18n } from '../i18n/useI18n'
import { useProfile } from '../profile/useProfile'
import { useOnlineDiJouj } from '../online/useOnlineDiJouj'
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

const SUIT_RANK: Record<Suit, number> = { oros: 0, copas: 1, espadas: 2, bastos: 3 }

function cardKey(c: Card) { return `${c.suit}_${c.value}` }

// ── Screen ────────────────────────────────────────────────────────────────────

export function DiJoujOnlineScreen() {
  const { t }        = useI18n()
  const { username } = useProfile()

  const {
    state, isHumanTurn, isBotThinking, isAutoSkipping, isDrawPause,
    playCard, draw, isGameOver, winner, restart,
    connectionStatus, roomCode, opponents, opponentDisconnected,
    gameOver, error, connectQuick, connectPrivate,
  } = useOnlineDiJouj()

  const [pendingWild, setPendingWild] = useState<Card | null>(null)

  const human   = state.players[0]
  const topCard = state.discardPile[state.discardPile.length - 1]

  // ── Main triée ────────────────────────────────────────────────────────────

  const sortedHand = useMemo(
    () => [...human.hand].sort(
      (a, b) => SUIT_RANK[a.suit] - SUIT_RANK[b.suit] || a.value - b.value,
    ),
    [human.hand],
  )

  // ── Playable set ─────────────────────────────────────────────────────────

  const playableSet = useMemo<Set<string>>(() => {
    if (!isHumanTurn || !topCard) return new Set()
    return new Set(
      human.hand
        .filter(c => isPlayable(c, topCard, state.chosenSuit, state.pendingEffect))
        .map(cardKey),
    )
  }, [isHumanTurn, human.hand, topCard, state.chosenSuit, state.pendingEffect])

  // ── Animation défausse ────────────────────────────────────────────────────

  const discardScale = useRef(new Animated.Value(1)).current
  const prevTopKey   = useRef('')
  const topKey       = topCard ? cardKey(topCard) : ''

  useEffect(() => {
    if (prevTopKey.current && prevTopKey.current !== topKey) {
      discardScale.setValue(0.85)
      Animated.spring(discardScale, {
        toValue: 1, friction: 6, tension: 180, useNativeDriver: true,
      }).start()
    }
    prevTopKey.current = topKey
  }, [topKey])

  // ── Pulse adversaire ──────────────────────────────────────────────────────

  const botOpacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!isHumanTurn && !isGameOver && connectionStatus === 'playing') {
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
  }, [isHumanTurn, isGameOver, connectionStatus])

  // ── "Dernière carte" avant overlay ────────────────────────────────────────

  const lastCardPulse = useRef(new Animated.Value(1)).current
  const [showLastCardMsg, setShowLastCardMsg] = useState(false)

  useEffect(() => {
    if (!isGameOver) { setShowLastCardMsg(false); return }
    setShowLastCardMsg(true)
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(lastCardPulse, { toValue: 0.35, duration: 350, useNativeDriver: true }),
        Animated.timing(lastCardPulse, { toValue: 1.0,  duration: 350, useNativeDriver: true }),
      ]),
    )
    loop.start()
    const tid = setTimeout(() => {
      loop.stop(); lastCardPulse.setValue(1); setShowLastCardMsg(false)
    }, 2000)
    return () => { clearTimeout(tid); loop.stop(); lastCardPulse.setValue(1) }
  }, [isGameOver])

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleCardPress(card: Card) {
    if (!isHumanTurn || isDrawPause) return
    if (!playableSet.has(cardKey(card))) return
    if (card.value === 7 && card.suit === 'oros') { setPendingWild(card) }
    else { playCard(card) }
  }

  function handleSuitChoice(suit: Suit) {
    if (!pendingWild) return
    playCard(pendingWild, suit)
    setPendingWild(null)
  }

  const handleLeave = useCallback(() => {
    restart(); router.back()
  }, [restart])

  // ── Dérivés affichage ─────────────────────────────────────────────────────

  const primaryOpp = opponents[0]
  const oppLabel   = primaryOpp?.pseudo ?? 'Adversaire'

  let statusText: string
  if (isBotThinking) {
    const currentOpp = opponents.find(o => {
      // find who has the current turn (rotated index = currentPlayerId)
      return state.currentPlayerId > 0
    })
    statusText = `${currentOpp?.pseudo ?? oppLabel}...`
  } else if (isDrawPause) { statusText = `${oppLabel}...` }
  else if (isHumanTurn)   { statusText = t('yourTurn') }
  else                    { statusText = `${oppLabel}...` }

  const pendingEff = state.pendingEffect
  let bannerText: string | null = null
  let bannerBg: string = C.acc
  if (pendingEff?.type === 'draw2') { bannerText = `+${pendingEff.count} ${t('djDraw')}`; bannerBg = C.red }
  else if (pendingEff?.type === 'skip') { bannerText = t('djSkip'); bannerBg = C.amber }

  const isIdle        = connectionStatus === 'idle'
  const isConnecting  = connectionStatus === 'connecting'
  const isWaiting     = connectionStatus === 'waiting'
  const isDisconn     = connectionStatus === 'disconnected'
  const isPlaying     = connectionStatus === 'playing'

  // ── LOBBY ─────────────────────────────────────────────────────────────────

  if (isIdle || isConnecting) {
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
          <View style={s.lobbyCenter}>
            <Text style={s.lobbyTitle}>Di Jouj — {t('playOnline')}</Text>
            <Text style={s.lobbyUsername}>{username}</Text>
            {isConnecting
              ? <ActivityIndicator color={C.brass} size="large" style={{ marginTop: 32 }} />
              : (
                <View style={s.lobbyBtns}>
                  <TouchableOpacity
                    style={[s.lobbyBtn, { backgroundColor: C.acc }]}
                    onPress={() => connectQuick(username || 'Joueur')}
                    activeOpacity={0.8}
                  >
                    <Text style={s.lobbyBtnTxt}>{t('quickMatch')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.lobbyBtn, { backgroundColor: C.surface, borderWidth: 1, borderColor: C.brass }]}
                    onPress={() => connectPrivate(username || 'Joueur')}
                    activeOpacity={0.8}
                  >
                    <Text style={s.lobbyBtnTxt}>{t('createGame')}</Text>
                  </TouchableOpacity>
                </View>
              )
            }
          </View>
        </SafeAreaView>
      </LinearGradient>
    )
  }

  // ── ATTENTE d'un adversaire ────────────────────────────────────────────────

  if (isWaiting) {
    return (
      <LinearGradient colors={[C.gradTop, C.gradBot]} style={s.root}>
        <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
          <View style={s.header}>
            <TouchableOpacity onPress={handleLeave} activeOpacity={0.7} style={s.backBtn}>
              <Text style={s.backTxt}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={s.title}>DI JOUJ</Text>
            <View style={s.headerSpacer} />
          </View>
          <View style={s.lobbyCenter}>
            <Text style={s.lobbyTitle}>{t('waitingOpponent')}</Text>
            {roomCode && (
              <View style={s.codeBox}>
                <Text style={s.codeLabel}>{t('copy')}</Text>
                <Text style={s.codeValue}>{roomCode}</Text>
              </View>
            )}
            <ActivityIndicator color={C.brass} size="large" style={{ marginTop: 24 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    )
  }

  // ── ERREUR ────────────────────────────────────────────────────────────────

  if (isDisconn && !isPlaying) {
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
          <View style={s.lobbyCenter}>
            <Text style={s.errorTxt}>{error ?? t('reconnectFailed')}</Text>
            <TouchableOpacity
              style={[s.lobbyBtn, { backgroundColor: C.acc, marginTop: 24 }]}
              onPress={() => connectQuick(username || 'Joueur')}
              activeOpacity={0.8}
            >
              <Text style={s.lobbyBtnTxt}>{t('quickMatch')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={{ marginTop: 12 }}>
              <Text style={s.backTxt}>{t('back')}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    )
  }

  // ── JEU ───────────────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={[C.gradTop, C.gradBot]} style={s.root}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>

        <View style={s.header}>
          <TouchableOpacity onPress={handleLeave} activeOpacity={0.7} style={s.backBtn}>
            <Text style={s.backTxt}>{t('back')}</Text>
          </TouchableOpacity>
          <Text style={s.title}>DI JOUJ</Text>
          <View style={s.headerSpacer} />
        </View>

        {/* ── Zone adversaires (flex 2) ───────────────────────────────────────── */}
        <Animated.View style={[s.oppZone, { opacity: botOpacity }]}>
          {state.players.slice(1).map((opp, idx) => {
            const oppInfo = opponents[idx]
            const oppName = oppInfo?.pseudo ?? `Joueur ${idx + 2}`
            return (
              <View key={idx} style={[s.oppSlot, opponents.length > 1 && s.oppSlotMulti]}>
                <Text style={s.oppLabel}>{oppName} — {opp.hand.length}</Text>
                <View style={s.oppHand}>
                  {opp.hand.map((_, i) => (
                    <View key={i} style={[s.oppCard, i > 0 && s.oppCardOverlap]}>
                      <CardBack size={opponents.length > 1 ? 'sm' : 'md'} />
                    </View>
                  ))}
                </View>
              </View>
            )
          })}
        </Animated.View>

        {/* ── Bannière effet ──────────────────────────────────────────────────── */}
        {bannerText !== null && (
          <View style={[s.banner, { backgroundColor: bannerBg }]}>
            <Text style={s.bannerTxt}>{bannerText}</Text>
            {isAutoSkipping && (
              <Text style={s.autoSkipTxt}>{t('djAutoSkip')}</Text>
            )}
          </View>
        )}

        {/* ── Table ──────────────────────────────────────────────────────────── */}
        <View style={s.tableZone}>
          <TouchableOpacity
            activeOpacity={isHumanTurn && !isDrawPause ? 0.75 : 1}
            onPress={() => isHumanTurn && !isDrawPause && draw()}
            style={[s.pileWrap, (!isHumanTurn || isDrawPause) && s.pileInactive]}
          >
            {state.drawPile.length > 0
              ? <CardBack size="xxl" />
              : <View style={s.emptyPile}><Text style={s.emptyPileTxt}>∅</Text></View>
            }
            <Text style={s.pileCount}>{state.drawPile.length}</Text>
          </TouchableOpacity>

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

        {/* ── Statut ─────────────────────────────────────────────────────────── */}
        <View style={s.statusBar}>
          <Text style={s.statusTxt}>{statusText}</Text>
        </View>

        {/* ── Main ───────────────────────────────────────────────────────────── */}
        <View style={s.humanZone}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.handScroll}
            overScrollMode="never"
          >
            {sortedHand.map((card, i) => {
              const playable = playableSet.has(cardKey(card))
              return (
                <View key={i} style={[s.humanCard, !playable && s.humanCardDimmed]}>
                  <CardFace
                    card={card}
                    size="xl"
                    highlighted={playable}
                    disabled={!playable || !isHumanTurn || isDrawPause}
                    onPress={() => handleCardPress(card)}
                  />
                </View>
              )
            })}
          </ScrollView>
        </View>

        {/* ── Modal couleur ──────────────────────────────────────────────────── */}
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

        {/* ── Overlay déconnexion adversaire ─────────────────────────────────── */}
        {opponentDisconnected && !isGameOver && (
          <View style={s.overlay} pointerEvents="none">
            <View style={s.disconnectBox}>
              <Text style={s.disconnectTxt}>{t('opponentDisconnected')}</Text>
              <Text style={s.disconnectSub}>{t('waitingReconnection')}</Text>
            </View>
          </View>
        )}

        {/* ── "Dernière carte" ────────────────────────────────────────────────── */}
        {isGameOver && showLastCardMsg && (
          <View style={s.overlay} pointerEvents="none">
            <Animated.Text style={[s.lastCardTxt, { opacity: lastCardPulse }]}>
              {t('djLastCard')}
            </Animated.Text>
          </View>
        )}

        {/* ── Fin de partie ───────────────────────────────────────────────────── */}
        {isGameOver && !showLastCardMsg && (
          <View style={s.overlay}>
            <View style={s.overlayBox}>
              <Text style={s.overlayEmoji}>{winner === 0 ? '🏆' : '😔'}</Text>
              <Text style={s.overlayTitle}>
                {winner === 0 ? t('djYouWin') : t('djYouLose')}
              </Text>
              {gameOver?.winnerPseudo && (
                <Text style={s.overlaySubtitle}>{gameOver.winnerPseudo}</Text>
              )}
              <TouchableOpacity onPress={handleLeave} activeOpacity={0.7} style={s.backFromOverlay}>
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

  // Lobby
  lobbyCenter: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  lobbyTitle: {
    fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 20,
    textAlign: 'center', marginBottom: 8,
  },
  lobbyUsername: {
    fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 14,
    textAlign: 'center', marginBottom: 4,
  },
  lobbyBtns: { width: '100%', gap: 14, marginTop: 32 },
  lobbyBtn: {
    paddingVertical: 16, paddingHorizontal: 24, borderRadius: 14, alignItems: 'center',
  },
  lobbyBtnTxt: {
    fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 16, letterSpacing: 0.4,
  },
  codeBox: {
    marginTop: 24, alignItems: 'center', backgroundColor: C.surface,
    borderRadius: 12, paddingVertical: 16, paddingHorizontal: 28, gap: 6,
  },
  codeLabel: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 12 },
  codeValue: {
    fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 28, letterSpacing: 6,
  },
  errorTxt: {
    fontFamily: 'Cairo_400Regular', color: C.red, fontSize: 15, textAlign: 'center',
  },

  // Opponents zone
  oppZone: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 12, gap: 8,
  },
  oppSlot: { alignItems: 'center', flex: 1 },
  oppSlotMulti: { maxWidth: 160 },
  oppLabel: {
    fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 11,
    marginBottom: 6, letterSpacing: 0.5,
  },
  oppHand: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'nowrap',
  },
  oppCard:        { zIndex: 1 },
  oppCardOverlap: { marginLeft: 8 },

  // Banner
  banner: {
    marginHorizontal: 28, marginVertical: 4, borderRadius: 8, paddingVertical: 5, alignItems: 'center',
  },
  bannerTxt:   { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 13, letterSpacing: 0.5 },
  autoSkipTxt: {
    fontFamily: 'Cairo_400Regular', color: 'rgba(244,236,216,0.75)', fontSize: 11, marginTop: 2,
  },

  // Table
  tableZone: {
    flex: 4, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 28, paddingVertical: 8,
  },
  pileWrap:    { alignItems: 'center', gap: 6 },
  pileInactive: { opacity: 0.45 },
  pileCount:   { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 12 },
  emptyPile: {
    width: 100, height: 150, borderRadius: 8, borderWidth: 1, borderColor: C.ghost,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyPileTxt: { color: C.boneOff, fontSize: 24 },
  discardWrap:  { alignItems: 'center', gap: 8 },
  suitDot: {
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 14, alignItems: 'center',
  },
  suitDotTxt: {
    fontFamily: 'Cairo_600SemiBold', color: '#fff', fontSize: 11, textTransform: 'capitalize',
  },

  // Status
  statusBar:  { alignItems: 'center', paddingVertical: 6 },
  statusTxt: {
    fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 14, letterSpacing: 0.4, opacity: 0.85,
  },

  // Human hand
  humanZone: { flex: 4, justifyContent: 'center', paddingBottom: 4, overflow: 'visible' },
  handScroll: {
    flexGrow: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 12, gap: 10,
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
  modalTitle:  { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 16, letterSpacing: 0.5 },
  suitGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  suitBtn: {
    width: 128, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 2, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12,
  },
  suitCircle:  { width: 14, height: 14, borderRadius: 7 },
  suitLabel:   { fontFamily: 'Cairo_400Regular', color: C.bone, fontSize: 13, textTransform: 'capitalize' },
  cancelBtn:   { paddingVertical: 4 },
  cancelTxt:   { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },

  // Overlay
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(10,0,6,0.82)', alignItems: 'center', justifyContent: 'center',
  },
  disconnectBox: {
    backgroundColor: C.surface, borderRadius: 16, paddingVertical: 24, paddingHorizontal: 32,
    alignItems: 'center', gap: 8,
  },
  disconnectTxt: { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 16, textAlign: 'center' },
  disconnectSub: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13, textAlign: 'center' },
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
  overlayEmoji:    { fontSize: 56, lineHeight: 64 },
  overlayTitle: {
    fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 24, letterSpacing: 0.5, textAlign: 'center',
  },
  overlaySubtitle: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 14, textAlign: 'center' },
  backFromOverlay:    { marginTop: 4 },
  backFromOverlayTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
})

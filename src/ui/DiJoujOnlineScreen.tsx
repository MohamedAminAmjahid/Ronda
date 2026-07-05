import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Modal, Animated, ActivityIndicator, useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { router, type Href } from 'expo-router'
import { useI18n } from '../i18n/useI18n'
import { useProfile } from '../profile/useProfile'
import { useIsOffline } from '../net/useOnlineStatus'
import { useOnlineDiJouj } from '../online/useOnlineDiJouj'
import { BOT_WAIT_SECS, pickBot } from '../online/botFallback'
import { isPlayable } from '../engine-dijouj/game'
import type { Card, Suit } from '../engine-dijouj/types'
import { CardFace, CardBack } from './components/Card'
import { Matchmaking } from './components/Matchmaking'
import { VoiceButton } from '../voice/VoiceButton'
import { GameChat } from '../voice/GameChat'

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
const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

// ── Rangée de dos horizontaux ─────────────────────────────────────────────────

function CardBackRow({ count, max = 7 }: { count: number; max?: number }) {
  const n = Math.min(count, max)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {Array.from({ length: n }).map((_, i) => (
        <View key={i} style={{ marginLeft: i > 0 ? -22 : 0 }}>
          <CardBack size="sm" />
        </View>
      ))}
    </View>
  )
}

// ── Panneau latéral rotatif ───────────────────────────────────────────────────

function SideOpponent({
  pseudo, count, rotation,
}: { pseudo: string; count: number; rotation: 'left' | 'right' }) {
  return (
    <View style={side.zone}>
      <View style={[side.inner, rotation === 'left' ? side.left : side.right]}>
        <Text style={side.label} numberOfLines={1}>{pseudo} — {count}</Text>
        <CardBackRow count={count} max={5} />
      </View>
    </View>
  )
}

const side = StyleSheet.create({
  zone:  { width: 72, alignSelf: 'stretch', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  inner: { width: 210, alignItems: 'center', gap: 8 },
  left:  { transform: [{ rotate: '-90deg' }] },
  right: { transform: [{ rotate: '90deg' }] },
  label: { fontFamily: 'Cairo_400Regular', color: 'rgba(244,236,216,0.60)', fontSize: 11, letterSpacing: 0.3 },
})

// ── Screen ────────────────────────────────────────────────────────────────────

export function DiJoujOnlineScreen() {
  const { width } = useWindowDimensions()
  const isSmall   = width < 430
  const cardSz    = isSmall ? 'sm' : 'lg' as const
  const pileSz    = isSmall ? 'lg' : 'xl' as const
  const pileWH    = isSmall ? { w: 72, h: 108 } : { w: 80, h: 120 }
  const handGap   = isSmall ? 3 : 8

  const { t }        = useI18n()
  const { username } = useProfile()
  const offline      = useIsOffline()

  const {
    state, isHumanTurn, isBotThinking, isAutoSkipping, isDrawPause,
    playCard, draw, isGameOver, winner, restart,
    connectionStatus, roomCode, isQuick, bet, opponents, opponentDisconnected,
    gameOver, error, connectQuick, connectPrivate,
    chatMessages, sendChatMsg, autoSkip, playerForfeited,
  } = useOnlineDiJouj()

  const [pendingWild, setPendingWild] = useState<Card | null>(null)

  // Quitte la room si l'écran est démonté (navigation, retour…). Sans ça, une
  // room en attente reste ouverte côté serveur et le prochain matchmaking nous
  // apparie à ce fantôme → « moi contre moi ». (Miroir de OnlineScreen Ronda.)
  useEffect(() => {
    return () => { restart() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const human   = state.players[0]
  const topCard = state.discardPile[state.discardPile.length - 1]

  // Opponents by rotated seat index: 1=top, 2=left, 3=right
  const opp0 = opponents[0]  // top (always)
  const opp1 = opponents[1]  // left  (3+ players)
  const opp2 = opponents[2]  // right (4  players)
  const pc   = 1 + opponents.length  // total player count

  const sortedHand = useMemo(
    () => [...human.hand].sort(
      (a, b) => SUIT_RANK[a.suit] - SUIT_RANK[b.suit] || a.value - b.value,
    ),
    [human.hand],
  )

  const playableSet = useMemo<Set<string>>(() => {
    if (!isHumanTurn || !topCard) return new Set()
    return new Set(
      human.hand
        .filter(c => isPlayable(c, topCard, state.chosenSuit, state.pendingEffect))
        .map(cardKey),
    )
  }, [isHumanTurn, human.hand, topCard, state.chosenSuit, state.pendingEffect])

  // ── Animations ────────────────────────────────────────────────────────────

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

  const oppOpacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!isHumanTurn && !isGameOver && connectionStatus === 'playing') {
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(oppOpacity, { toValue: 0.45, duration: 750, useNativeDriver: true }),
        Animated.timing(oppOpacity, { toValue: 1.00, duration: 750, useNativeDriver: true }),
      ]))
      loop.start()
      return () => { loop.stop(); oppOpacity.setValue(1) }
    }
    oppOpacity.setValue(1)
  }, [isHumanTurn, isGameOver, connectionStatus])

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

  // ── Matchmaking : chrono + repli bot silencieux (partie rapide uniquement) ──
  // Une room privée (avec code) attend un ami : jamais de bot. La partie rapide
  // (sans code) bascule sur un bot après le délai — sans jamais le révéler.
  const [mmElapsed, setMmElapsed] = useState(0)
  const botCalledRef  = useRef(false)
  const isQuickWaiting = connectionStatus === 'waiting' && isQuick

  useEffect(() => {
    if (connectionStatus !== 'waiting') { setMmElapsed(0); botCalledRef.current = false; return }
    const id = setInterval(() => setMmElapsed(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [connectionStatus])

  useEffect(() => {
    if (!isQuickWaiting || botCalledRef.current) return
    if (mmElapsed >= BOT_WAIT_SECS) {
      botCalledRef.current = true
      const { name, emoji } = pickBot()
      restart()  // quitte la room en ligne
      router.push(
        `/dijouj?train=1&botName=${encodeURIComponent(name)}&botEmoji=${encodeURIComponent(emoji)}` as Href,
      )
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mmElapsed, isQuickWaiting])

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

  const [confirmLeave, setConfirmLeave] = useState(false)

  const handleLeave = useCallback(() => {
    if (connectionStatus === 'playing') { setConfirmLeave(true); return }
    restart(); router.back()
  }, [connectionStatus, restart])

  // ── Dérivés status ────────────────────────────────────────────────────────

  const currentOppLabel = opponents.find((_, i) => (i + 1) === state.currentPlayerId)?.pseudo
    ?? opp0?.pseudo ?? 'Adversaire'

  let statusText: string
  if (isBotThinking || (!isHumanTurn && !isDrawPause)) statusText = `${currentOppLabel}...`
  else if (isDrawPause) statusText = `${currentOppLabel}...`
  else if (isHumanTurn) statusText = t('yourTurn')
  else statusText = `${currentOppLabel}...`

  const pendingEff = state.pendingEffect
  let bannerText: string | null = null
  let bannerBg: string = C.acc
  if (pendingEff?.type === 'draw2')  { bannerText = `+${pendingEff.count} ${t('djDraw')}`; bannerBg = C.red }
  else if (pendingEff?.type === 'skip') { bannerText = t('djSkip'); bannerBg = C.amber }

  const isIdle       = connectionStatus === 'idle'
  const isConnecting = connectionStatus === 'connecting'
  const isWaiting    = connectionStatus === 'waiting'
  const isDisconn    = connectionStatus === 'disconnected'
  const isPlaying    = connectionStatus === 'playing'

  // ── Lobby / Connecting ────────────────────────────────────────────────────

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
          <View style={s.center}>
            <Text style={s.centerTitle}>Di Jouj — {t('playOnline')}</Text>
            <Text style={s.centerSub}>{username}</Text>
            {offline && (
              <View style={s.offlineNotice}>
                <Text style={s.offlineNoticeTxt}>📵 {t('offlineNeedConnection')}</Text>
              </View>
            )}
            {isConnecting
              ? <ActivityIndicator color={C.brass} size="large" style={{ marginTop: 32 }} />
              : (
                <View style={s.centerBtns}>
                  <TouchableOpacity
                    style={[s.centerBtn, { backgroundColor: C.acc }, offline && s.centerBtnDisabled]}
                    onPress={() => { if (!offline) connectQuick(username || 'Joueur') }}
                    disabled={offline}
                    activeOpacity={0.8}
                  >
                    <Text style={s.centerBtnTxt}>{t('quickMatch')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.centerBtn, { backgroundColor: C.surface, borderWidth: 1, borderColor: C.brass }, offline && s.centerBtnDisabled]}
                    onPress={() => { if (!offline) connectPrivate(username || 'Joueur') }}
                    disabled={offline}
                    activeOpacity={0.8}
                  >
                    <Text style={s.centerBtnTxt}>{t('createGame')}</Text>
                  </TouchableOpacity>
                </View>
              )
            }
          </View>
        </SafeAreaView>
      </LinearGradient>
    )
  }

  // ── Attente adversaire ────────────────────────────────────────────────────

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
          <View style={s.center}>
            {isQuick ? (
              // Partie rapide : animation de matchmaking (aucun code, aucune mention de bot).
              <Matchmaking
                accent={C.brass}
                track="rgba(201,162,39,0.16)"
                textColor={C.bone}
                label={t('searchingOpponent')}
                timeLabel={fmtTime(mmElapsed)}
              />
            ) : (
              // Room privée : on attend un ami → affiche le code.
              <>
                <Text style={s.centerTitle}>{t('waitingOpponent')}</Text>
                {roomCode && (
                  <View style={s.codeBox}>
                    <Text style={s.codeLabel}>{t('copy')}</Text>
                    <Text style={s.codeValue}>{roomCode}</Text>
                  </View>
                )}
                <ActivityIndicator color={C.brass} size="large" style={{ marginTop: 24 }} />
              </>
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>
    )
  }

  // ── Erreur / Déconnexion ──────────────────────────────────────────────────

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
          <View style={s.center}>
            <Text style={s.errorTxt}>{error ?? t('reconnectFailed')}</Text>
            <TouchableOpacity
              style={[s.centerBtn, { backgroundColor: C.acc, marginTop: 24 }]}
              onPress={() => connectQuick(username || 'Joueur')}
              activeOpacity={0.8}
            >
              <Text style={s.centerBtnTxt}>{t('quickMatch')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={{ marginTop: 12 }}>
              <Text style={s.backTxt}>{t('back')}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    )
  }

  // ── Jeu ───────────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
    <LinearGradient colors={[C.gradTop, C.gradBot]} style={s.root}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>

        {/* ── Modale confirmation quitter ──────────────────────────────────── */}
        <Modal visible={confirmLeave} transparent animationType="fade" onRequestClose={() => setConfirmLeave(false)}>
          <View style={s.quitBackdrop}>
            <View style={s.quitCard}>
              <Text style={s.quitTitle}>{t('quitConfirm')}</Text>
              <Text style={s.quitSub}>{t('quitOnline')}</Text>
              <View style={s.quitActions}>
                <TouchableOpacity style={s.stayBtn} onPress={() => setConfirmLeave(false)}>
                  <Text style={s.stayTxt}>{t('stay')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.leaveBtn}
                  onPress={() => { setConfirmLeave(false); restart(); router.back() }}
                >
                  <Text style={s.leaveTxt}>{t('leave')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <View style={s.header}>
          <TouchableOpacity onPress={handleLeave} activeOpacity={0.7} style={s.backBtn}>
            <Text style={s.backTxt}>{t('back')}</Text>
          </TouchableOpacity>
          <Text style={[s.title, isSmall && { fontSize: 15, letterSpacing: 3 }]}>DI JOUJ</Text>
          <View style={s.headerSpacer} />
        </View>

        {/* ── Top : opponent 0 (toujours centré en haut) ─────────────────────── */}
        <Animated.View style={[s.topZone, { opacity: oppOpacity }]}>
          <CardBackRow count={state.players[1]?.hand.length ?? 0} />
          <Text style={s.oppTopLabel}>
            {opp0?.pseudo ?? 'Adversaire'} — {state.players[1]?.hand.length ?? 0}
          </Text>
        </Animated.View>

        {/* ── Bannière effet ────────────────────────────────────────────────── */}
        {bannerText !== null && (
          <View style={[s.banner, { backgroundColor: bannerBg }]}>
            <Text style={s.bannerTxt}>{bannerText}</Text>
            {isAutoSkipping && <Text style={s.autoSkipTxt}>{t('djAutoSkip')}</Text>}
          </View>
        )}

        {/* ── Auto-skip online (server-driven) ─────────────────────────────── */}
        {autoSkip && !bannerText && (
          <View style={[s.banner, { backgroundColor: C.amber }]}>
            <Text style={s.bannerTxt}>{autoSkip.pseudo}</Text>
            <Text style={s.autoSkipTxt}>{t('djAutoSkip')}</Text>
          </View>
        )}

        {/* ── Joueur ayant abandonné ───────────────────────────────────────── */}
        {playerForfeited && (
          <View style={[s.banner, { backgroundColor: C.red }]}>
            <Text style={s.bannerTxt}>{playerForfeited.pseudo}</Text>
            <Text style={s.autoSkipTxt}>{t('playerForfeited')}</Text>
          </View>
        )}

        {/* ── Milieu : [gauche?] + table + [droite?] ────────────────────────── */}
        <View style={s.middleRow}>

          {/* Opponent 1 — gauche (3–4 joueurs) */}
          {pc >= 3 && opp1 && (
            <Animated.View style={{ opacity: oppOpacity }}>
              <SideOpponent
                pseudo={opp1.pseudo}
                count={state.players[2]?.hand.length ?? 0}
                rotation="left"
              />
            </Animated.View>
          )}

          {/* Table centrale */}
          <View style={s.tableCenter}>
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

            <View style={s.discardWrap}>
              <Animated.View style={{ transform: [{ scale: discardScale }] }}>
                {topCard
                  ? <CardFace card={topCard} size={pileSz} />
                  : <View style={[s.emptyPile, { width: pileWH.w, height: pileWH.h }]} />
                }
              </Animated.View>
              {state.chosenSuit && (
                <View style={[s.suitDot, { backgroundColor: SUIT_COLOR[state.chosenSuit] }]}>
                  <Text style={s.suitDotTxt}>{state.chosenSuit}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Opponent 2 — droite (4 joueurs) */}
          {pc >= 4 && opp2 && (
            <Animated.View style={{ opacity: oppOpacity }}>
              <SideOpponent
                pseudo={opp2.pseudo}
                count={state.players[3]?.hand.length ?? 0}
                rotation="right"
              />
            </Animated.View>
          )}
        </View>

        {/* ── Statut ────────────────────────────────────────────────────────── */}
        <View style={s.statusBar}>
          <Text style={s.statusTxt}>{statusText}</Text>
        </View>

        {/* ── Ma main ───────────────────────────────────────────────────────── */}
        <View style={s.handZone}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[s.handScroll, { gap: handGap }]}
            overScrollMode="never"
          >
            {sortedHand.map((card, i) => {
              const playable = playableSet.has(cardKey(card))
              return (
                <View key={i} style={[s.humanCard, !playable && s.humanCardDimmed]}>
                  <CardFace
                    card={card} size={cardSz} highlighted={playable}
                    disabled={!playable || !isHumanTurn || isDrawPause}
                    onPress={() => handleCardPress(card)}
                  />
                </View>
              )
            })}
          </ScrollView>
        </View>

        {/* ── Modal couleur (joker 7 d'oros) ────────────────────────────────── */}
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

        {/* ── Overlay déconnexion ────────────────────────────────────────────── */}
        {opponentDisconnected && !isGameOver && (
          <View style={s.overlay} pointerEvents="none">
            <View style={s.infoBox}>
              <Text style={s.infoTitle}>{t('opponentDisconnected')}</Text>
              <Text style={s.infoSub}>{t('waitingReconnection')}</Text>
            </View>
          </View>
        )}

        {/* ── "Dernière carte" ─────────────────────────────────────────────── */}
        {isGameOver && showLastCardMsg && (
          <View style={s.overlay} pointerEvents="none">
            <Animated.Text style={[s.lastCardTxt, { opacity: lastCardPulse }]}>
              {t('djLastCard')}
            </Animated.Text>
          </View>
        )}

        {/* ── Fin de partie ─────────────────────────────────────────────────── */}
        {isGameOver && !showLastCardMsg && (
          <View style={s.overlay}>
            <View style={s.overlayBox}>
              <Text style={s.overlayEmoji}>{winner === 0 ? '🏆' : '😔'}</Text>
              <Text style={s.overlayTitle}>
                {winner === 0 ? t('djYouWin') : t('djYouLose')}
              </Text>
              {gameOver?.winnerPseudo && winner !== 0 && (
                <Text style={s.overlaySub}>{gameOver.winnerPseudo}</Text>
              )}
              {winner === 0 && gameOver?.goldWon && gameOver.goldWon > 0 && (
                <Text style={s.overlayGold}>
                  🪙 +{gameOver.goldWon - bet} gold gagnés !
                </Text>
              )}
              <TouchableOpacity onPress={handleLeave} activeOpacity={0.7} style={s.backFromOverlay}>
                <Text style={s.backFromOverlayTxt}>{t('back')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      </SafeAreaView>
    </LinearGradient>
    <VoiceButton roomCode={roomCode} username={username || 'Joueur'} />
    <GameChat
      messages={chatMessages}
      sendMessage={sendChatMsg}
      myUsername={username || 'Joueur'}
      accentColor="#6B1A2C"
      isGameOver={isGameOver}
    />
    </View>
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

  // Lobby / waiting states
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  centerTitle: {
    fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 20, textAlign: 'center', marginBottom: 8,
  },
  centerSub: {
    fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 14, textAlign: 'center', marginBottom: 4,
  },
  centerBtns: { width: '100%', gap: 14, marginTop: 32 },
  centerBtn: { paddingVertical: 16, paddingHorizontal: 24, borderRadius: 14, alignItems: 'center' },
  centerBtnDisabled: { opacity: 0.4 },
  centerBtnTxt: { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 16, letterSpacing: 0.4 },
  offlineNotice: {
    marginTop: 20, backgroundColor: 'rgba(90,42,42,0.5)', borderRadius: 10, padding: 12,
    borderLeftWidth: 3, borderLeftColor: C.red,
  },
  offlineNoticeTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.bone, textAlign: 'center' },
  codeBox: {
    marginTop: 24, alignItems: 'center', backgroundColor: C.surface,
    borderRadius: 12, paddingVertical: 16, paddingHorizontal: 28, gap: 6,
  },
  codeLabel: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 12 },
  codeValue: { fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 28, letterSpacing: 6 },
  errorTxt:  { fontFamily: 'Cairo_400Regular', color: C.red, fontSize: 15, textAlign: 'center' },

  // ── Game layout ───────────────────────────────────────────────────────────

  // Top opponent (always)
  topZone: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  oppTopLabel: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 11, letterSpacing: 0.5 },

  // Banner
  banner: {
    marginHorizontal: 28, marginVertical: 2, borderRadius: 8, paddingVertical: 5, alignItems: 'center',
  },
  bannerTxt:   { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 13, letterSpacing: 0.5 },
  autoSkipTxt: {
    fontFamily: 'Cairo_400Regular', color: 'rgba(244,236,216,0.75)', fontSize: 11, marginTop: 2,
  },

  // Middle row (left side? + table + right side?)
  middleRow: { flex: 4, flexDirection: 'row', alignItems: 'stretch' },

  // Table center
  tableCenter: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24,
  },
  pileWrap:     { alignItems: 'center', gap: 6 },
  pileInactive: { opacity: 0.45 },
  pileCount:    { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 12 },
  emptyPile: {
    width: 80, height: 120, borderRadius: 8, borderWidth: 1, borderColor: C.ghost,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyPileTxt: { color: C.boneOff, fontSize: 24 },
  discardWrap:  { alignItems: 'center', gap: 8 },
  suitDot: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, alignItems: 'center',
  },
  suitDotTxt: {
    fontFamily: 'Cairo_600SemiBold', color: '#fff', fontSize: 11, textTransform: 'capitalize',
  },

  // Status bar
  statusBar: { alignItems: 'center', paddingVertical: 6 },
  statusTxt: {
    fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 14, letterSpacing: 0.4, opacity: 0.85,
  },

  // My hand
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

  // Overlays
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(10,0,6,0.82)', alignItems: 'center', justifyContent: 'center',
  },
  infoBox: {
    backgroundColor: C.surface, borderRadius: 16, paddingVertical: 24, paddingHorizontal: 32,
    alignItems: 'center', gap: 8,
  },
  infoTitle: { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 16, textAlign: 'center' },
  infoSub:   { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13, textAlign: 'center' },
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
  overlaySub:  { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 14, textAlign: 'center' },
  overlayGold: {
    fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 18, textAlign: 'center',
    textShadowColor: 'rgba(201,162,39,0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
  },
  backFromOverlay:    { marginTop: 4 },
  backFromOverlayTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },

  // Modale quitter
  quitBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28,
  },
  quitCard: {
    width: '100%', maxWidth: 340, backgroundColor: C.surface, borderRadius: 18, padding: 24, gap: 10,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)',
  },
  quitTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 17, color: C.bone, textAlign: 'center' },
  quitSub:   { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff, textAlign: 'center', lineHeight: 18 },
  quitActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  stayBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.35)',
  },
  stayTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.boneOff },
  leaveBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    backgroundColor: 'rgba(229,57,53,0.20)', borderWidth: 1, borderColor: 'rgba(229,57,53,0.45)',
  },
  leaveTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: '#E53935' },
})

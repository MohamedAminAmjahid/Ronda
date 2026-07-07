import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Modal, Animated, Easing, useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams, type Href } from 'expo-router'
import { Svg, Circle, Path, G } from 'react-native-svg'
import { useI18n } from '../i18n/useI18n'
import { useProfile } from '../profile/useProfile'
import { tableColors } from '../cosmetics/catalog'
import { AvatarDisplay } from './ProfileScreen'
import { PlayerProfileModal } from './PlayerProfileModal'
import { getBotAvatar, updateBotStats } from '../online/botFallback'
import { useDiJoujGame, DJ_HUMAN_ID } from '../game/useDiJoujGame'
import { recordResult, addGold, getProfile } from '../profile/profile'
import { XpGainBar, type XpGain } from './components/XpGainBar'
import { isPlayable } from '../engine-dijouj/game'
import type { Card, Suit } from '../engine-dijouj/types'
import { CardFace, CardBack } from './components/Card'
import { SoundToggle } from './components/SoundToggle'
import { playCardSound, playWinSound, playLoseSound, playGoldSound } from '../hooks/useSoundEffects'

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

// ── Icônes SVG des couleurs ───────────────────────────────────────────────────

function OrosIcon() {
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40">
      <Circle cx="20" cy="20" r="17" fill="#C9A227" />
      <Circle cx="20" cy="20" r="12" fill="rgba(255,255,255,0.18)" />
      <Circle cx="20" cy="20" r="7"  fill="rgba(255,255,255,0.22)" />
    </Svg>
  )
}

function CopasIcon() {
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40">
      {/* Coupe / calice : bol arrondi + pied */}
      <G fill="#C0392B">
        {/* bol de la coupe */}
        <Path d="M8 8 Q8 24 20 26 Q32 24 32 8 Z" />
        {/* pied vertical */}
        <Path d="M18 26 L18 35 L22 35 L22 26 Z" />
        {/* base */}
        <Path d="M13 33 L27 33 L27 37 L13 37 Z" />
      </G>
    </Svg>
  )
}

function EspadasIcon() {
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40">
      {/* Épée verticale : lame pointue + garde + poignée */}
      <G fill="#2980B9">
        {/* lame (triangle effilé) */}
        <Path d="M20 2 L24 30 L20 27 L16 30 Z" />
        {/* garde horizontale */}
        <Path d="M10 30 L30 30 L30 33 L10 33 Z" />
        {/* poignée */}
        <Path d="M18 33 L22 33 L22 40 L18 40 Z" />
      </G>
    </Svg>
  )
}

function BastosIcon() {
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40">
      {/* Bâton/massue épais avec nœuds */}
      <G fill="#27AE60">
        {/* corps du bâton, légèrement incliné */}
        <Path d="M17 38 L16 12 L20 10 L24 12 L23 38 Z" />
        {/* nœud du bas */}
        <Path d="M14 34 Q20 37 26 34 Q20 31 14 34 Z" />
        {/* nœud du milieu */}
        <Path d="M13 22 Q20 25 27 22 Q20 19 13 22 Z" />
        {/* tête du bâton (boule) */}
        <Circle cx="20" cy="9" r="7" />
      </G>
    </Svg>
  )
}

const SUIT_ICON: Record<Suit, () => React.ReactElement> = {
  oros:    OrosIcon,
  copas:   CopasIcon,
  espadas: EspadasIcon,
  bastos:  BastosIcon,
}

const SUIT_BG: Record<Suit, string> = {
  oros:    'rgba(201,162,39,0.20)',
  copas:   'rgba(192,57,43,0.20)',
  espadas: 'rgba(41,128,185,0.20)',
  bastos:  'rgba(39,174,96,0.20)',
}

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

        <View style={s.menuBody}>
          <Text style={s.menuTagline}>{t('dijoujCardDesc')}</Text>

          <View style={s.menuActions}>

            {/* ── Jouer en ligne (principal) ───────────────────────── */}
            <TouchableOpacity style={s.menuBtnPrimary} onPress={() => router.push(DJ_BET)} activeOpacity={0.85}>
              <Text style={s.menuBtnPrimaryLbl}>{t('playOnline')}</Text>
              <Text style={s.menuBtnPrimarySub}>{t('quickMatch')}</Text>
            </TouchableOpacity>

            {/* ── Séparateur ──────────────────────────────────────── */}
            <View style={s.menuOrRow}>
              <View style={s.menuOrLine} />
              <Text style={s.menuOrTxt}>{t('or')}</Text>
              <View style={s.menuOrLine} />
            </View>

            {/* ── Jouer avec un ami (secondaire) ──────────────────── */}
            <TouchableOpacity style={s.menuBtnFriend} onPress={() => router.push(DJ_LOBBY)} activeOpacity={0.85}>
              <Text style={s.menuBtnFriendIcon}>👥</Text>
              <View style={s.menuBtnFriendBody}>
                <Text style={s.menuBtnFriendLbl}>{t('playWithFriend')}</Text>
                <Text style={s.menuBtnFriendSub}>2 – 4 {t('djPlayers')}</Text>
              </View>
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
  const { table } = useProfile()
  const felt = tableColors(table)  // dégradé du tapis équipé
  // Adversaire déguisé : quand la partie vient du repli « matchmaking », on
  // reçoit un prénom/emoji et on n'affiche jamais « Bot ».
  const { botName, botEmoji, botAvatarIdx, botFemale, bet } = useLocalSearchParams<{
    botName?: string; botEmoji?: string; botAvatarIdx?: string; botFemale?: string; bet?: string
  }>()
  const oppLabel  = botName ? `${botEmoji ?? ''} ${botName}`.trim() : 'Bot'
  const stakeBet  = bet ? (parseInt(bet, 10) || 0) : 0  // >0 → partie misée (repli bot)
  // Avatar/genre transmis par le repli matchmaking (mêmes params que le lien
  // de navigation) — absents en entraînement normal (bouton "Bot" classique).
  const hasBotAvatar = botAvatarIdx !== undefined && botFemale !== undefined
  const botIdx    = botAvatarIdx ? (parseInt(botAvatarIdx, 10) || 0) : 0
  const botIsF    = botFemale === '1'
  if (botName) {
    console.log(
      'botAvatarIdx:', botAvatarIdx, 'botFemale:', botFemale,
      'hasBotAvatar:', hasBotAvatar, 'avatar:', getBotAvatar(botIdx, botIsF),
    )
  }
  // Niveau crédible pour le bot déguisé — figé pour toute la partie (pas de re-tirage au re-render).
  const fakeBotLevel = useRef(Math.floor(Math.random() * 16) + 3).current
  // uid fantôme Firestore du bot (voir getOrCreateBotProfile) — permet d'ouvrir
  // son profil comme celui d'un vrai joueur, sans jamais révéler que c'est un bot.
  const botUidStr = botName ? `bot_${botName.toLowerCase()}` : undefined
  const [showBotProfile, setShowBotProfile] = useState(false)
  const {
    state, isHumanTurn, isAutoSkipping, isDrawPause,
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
  const [xpInfo, setXpInfo] = useState<XpGain | null>(null)

  const djResultRecorded = useRef(false)
  useEffect(() => {
    if (!isGameOver) { djResultRecorded.current = false; return }
    if (!djResultRecorded.current) {
      djResultRecorded.current = true
      const won = winner === DJ_HUMAN_ID
      const before = getProfile()
      const { xpGained } = recordResult(won, 'dijouj')
      // Partie misée (repli bot) : victoire crédite le pot (net = +mise). Défaite
      // → la mise reste retirée (déjà déduite à l'écran de mise).
      if (stakeBet > 0 && won) addGold(stakeBet * 2)
      const after = getProfile()
      setXpInfo({ xpGained, oldXp: before.xp, oldLevel: before.level, newXp: after.xp, newLevel: after.level })
      // Sons de fin de partie.
      if (won) { playWinSound(); if (stakeBet > 0) playGoldSound() }
      else {
        playLoseSound()
        // Le bot gagne la mise → met à jour son profil fantôme Firestore.
        if (stakeBet > 0 && botName) void updateBotStats(botName, 'dijouj', stakeBet)
      }
    }
    setShowLastCardMsg(true)
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(lastCardPulse, { toValue: 0.35, duration: 350, useNativeDriver: true }),
      Animated.timing(lastCardPulse, { toValue: 1.0,  duration: 350, useNativeDriver: true }),
    ]))
    loop.start()
    const tid = setTimeout(() => { loop.stop(); lastCardPulse.setValue(1); setShowLastCardMsg(false) }, 2000)
    return () => { clearTimeout(tid); loop.stop(); lastCardPulse.setValue(1) }
  }, [isGameOver, winner])

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

  // ── Forfait pour inactivité (3 auto-skips consécutifs) ───────────────────────
  const autoSkipCount = useRef(0)
  const [forfeited, setForfeited] = useState(false)
  const forfeitedRef = useRef(false)
  const [confirmQuit, setConfirmQuit] = useState(false)

  // Retour : partie misée en cours → confirmation (quitter = perdre la mise).
  const handleBack = () => {
    if (stakeBet > 0 && !isGameOver && !forfeited) { setConfirmQuit(true); return }
    onBack()
  }

  function triggerForfeit() {
    if (forfeitedRef.current) return
    forfeitedRef.current = true
    setForfeited(true)
    recordResult(false, 'dijouj')
    playLoseSound()
    setTimeout(() => router.replace('/' as Href), 2000)
  }

  /** Joue à la place du joueur inactif (carte jouable aléatoire, sinon pioche). */
  function autoPlayTurn() {
    const playable = human.hand.filter(c => isPlayable(c, topCard, state.chosenSuit, state.pendingEffect))
    if (playable.length > 0) {
      const card = playable[Math.floor(Math.random() * playable.length)]
      if (card.value === 7 && card.suit === 'oros') {
        playCard(card, SUITS[Math.floor(Math.random() * SUITS.length)])
      } else {
        playCard(card)
      }
    } else {
      draw()
    }
    autoSkipCount.current += 1
    if (autoSkipCount.current >= 3) triggerForfeit()
  }

  // ── Compte à rebours du tour (7 s, miroir de la version en ligne) ────────────
  // Barre + secondes animées : le joueur voit qu'il doit jouer avant expiration.
  // À 0 → auto-play (autoPlayTurn) ; 3 auto-skips consécutifs → forfait.
  const TURN_SECS = 15
  const [turnLeft, setTurnLeft] = useState(TURN_SECS)
  const turnBar = useRef(new Animated.Value(1)).current
  const isMyLiveTurn = isHumanTurn && !isGameOver && !forfeited

  useEffect(() => {
    if (!isMyLiveTurn) { turnBar.stopAnimation(); turnBar.setValue(1); setTurnLeft(TURN_SECS); return }
    setTurnLeft(TURN_SECS)
    turnBar.setValue(1)
    Animated.timing(turnBar, {
      toValue: 0, duration: TURN_SECS * 1000, easing: Easing.linear, useNativeDriver: false,
    }).start()
    const id = setInterval(() => setTurnLeft(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [isMyLiveTurn])

  // Déclenche l'auto-play une seule fois quand le compte à rebours atteint 0.
  useEffect(() => {
    if (!isMyLiveTurn || turnLeft > 0) return
    autoPlayTurn()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnLeft, isMyLiveTurn])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleCardPress(card: Card) {
    if (!isHumanTurn) return
    if (!playableSet.has(cardKey(card))) return
    // Vrai clic humain → réinitialise le compteur d'inactivité.
    autoSkipCount.current = 0
    // 7 d'oros = joker (choix de couleur), SAUF si c'est la dernière carte :
    // la poser gagne la partie → inutile de choisir la prochaine couleur.
    if (card.value === 7 && card.suit === 'oros' && human.hand.length > 1) { setPendingWild(card) }
    else { playCardSound(); playCard(card) }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  let statusText: string
  if (isHumanTurn) statusText = t('yourTurn')
  else             statusText = `${oppLabel}…`

  const pendingEff = state.pendingEffect
  let bannerText: string | null = null
  let bannerBg: string = C.acc
  if (pendingEff?.type === 'draw2')  { bannerText = `+${pendingEff.count} ${t('djDraw')}`; bannerBg = C.red }
  else if (pendingEff?.type === 'skip') { bannerText = t('djSkip'); bannerBg = C.amber }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={felt} style={s.root}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={s.backBtn}>
            <Text style={s.backTxt}>{t('back')}</Text>
          </TouchableOpacity>
          <Text style={[s.title, isSmall && { fontSize: 15, letterSpacing: 3 }]}>DI JOUJ</Text>
          <View style={[s.headerSpacer, { alignItems: 'flex-end', justifyContent: 'center' }]}>
            <SoundToggle />
          </View>
        </View>

        {/* ── Top : adversaire (Bot déguisé en joueur, ou Bot d'entraînement) ── */}
        <Animated.View style={[s.topZone, { opacity: botOpacity }]}>
          {botName ? (
            <>
              <View style={s.oppProfileRow}>
                <TouchableOpacity onPress={() => setShowBotProfile(true)} activeOpacity={0.7}>
                  {hasBotAvatar ? (
                    <AvatarDisplay
                      type="image"
                      initial={botName[0]?.toUpperCase() ?? '?'}
                      emoji={botEmoji ?? '🙂'}
                      image={getBotAvatar(botIdx, botIsF)}
                      size={40}
                      level={fakeBotLevel}
                    />
                  ) : (
                    <AvatarDisplay
                      type="emoji"
                      initial={botName[0]?.toUpperCase() ?? '?'}
                      emoji={botEmoji ?? '🙂'}
                      image=""
                      size={40}
                      level={fakeBotLevel}
                    />
                  )}
                </TouchableOpacity>
                <Text style={s.oppTopName} numberOfLines={1}>{botName}</Text>
              </View>
              <CardBackRow count={bot.hand.length} />
              <Text style={s.oppTopLabel}>{bot.hand.length} 🂠</Text>
            </>
          ) : (
            <>
              <CardBackRow count={bot.hand.length} />
              <Text style={s.oppLabel}>{oppLabel} — {bot.hand.length}</Text>
            </>
          )}
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
              onPress={() => {
                if (!isHumanTurn || isDrawPause) return
                // Vrai clic humain → réinitialise le compteur d'inactivité.
                autoSkipCount.current = 0
                draw()
              }}
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

        {/* ── Compte à rebours du tour (mon tour uniquement) ────────────────── */}
        {isMyLiveTurn && (
          <View style={s.turnTimer}>
            <Text style={[s.turnTimerTxt, turnLeft <= 3 && s.turnTimerTxtUrgent]}>
              ⏱ {t('yourTurn')} · {turnLeft}s
            </Text>
            <View style={s.turnTimerTrack}>
              <Animated.View
                style={[
                  s.turnTimerFill,
                  {
                    width: turnBar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                    backgroundColor: turnLeft <= 3 ? C.red : C.brass,
                  },
                ]}
              />
            </View>
          </View>
        )}

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

        {/* ── Profil de l'adversaire (tap sur l'avatar) ─────────────────────── */}
        <PlayerProfileModal
          visible={showBotProfile}
          uid={botUidStr}
          name={botName}
          onClose={() => setShowBotProfile(false)}
        />

        {/* ── Modal couleur ─────────────────────────────────────────────────── */}
        <Modal visible={pendingWild !== null} transparent animationType="fade">
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>{t('djChooseSuit')}</Text>
              <View style={s.suitGrid}>
                {SUITS.map(suit => {
                  const Icon = SUIT_ICON[suit]
                  return (
                    <TouchableOpacity
                      key={suit}
                      style={[s.suitBtn, { borderColor: SUIT_COLOR[suit], backgroundColor: SUIT_BG[suit] }]}
                      onPress={() => { playCardSound(); playCard(pendingWild!, suit); setPendingWild(null) }}
                      activeOpacity={0.8}
                    >
                      <Icon />
                      <Text style={s.suitLabel}>{suit}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
              <TouchableOpacity onPress={() => setPendingWild(null)} style={s.cancelBtn}>
                <Text style={s.cancelTxt}>{t('cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Forfait pour inactivité (3 auto-skips consécutifs) */}
        {forfeited && (
          <View style={s.overlay}>
            <View style={s.overlayBox}>
              <Text style={s.overlayEmoji}>⏱️</Text>
              <Text style={s.overlayTitle}>{t('djForfeitInactivity')}</Text>
            </View>
          </View>
        )}

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
              {stakeBet > 0 && winner === DJ_HUMAN_ID && (
                <Text style={s.overlayGold}>🪙 +{stakeBet}</Text>
              )}
              {xpInfo && <XpGainBar {...xpInfo} />}
              <TouchableOpacity
                style={s.restartBtn}
                onPress={() => {
                  // Partie misée → « Rejouer » relance le matchmaking (nouvelle mise).
                  if (stakeBet > 0) { router.replace(DJ_BET); return }
                  restart()
                }}
                activeOpacity={0.8}
              >
                <Text style={s.restartTxt}>{t('djNewGame')}</Text>
              </TouchableOpacity>
              {/* Partie terminée → retour direct au menu, sans confirmation. */}
              <TouchableOpacity onPress={() => router.replace('/' as Href)} activeOpacity={0.7} style={s.backFromOverlay}>
                <Text style={s.backFromOverlayTxt}>🏠 {t('back')}</Text>
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

  // ── Menu boutons ─────────────────────────────────────────────────────────────
  menuBody: {
    flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 32,
  },
  menuTagline: {
    fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 14,
    textAlign: 'center', lineHeight: 20,
  },
  menuActions: { gap: 0 },

  // Jouer en ligne
  menuBtnPrimary: {
    backgroundColor: C.acc,
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 4,
    shadowColor: C.acc,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  menuBtnPrimaryLbl: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 17, color: C.bone, letterSpacing: 0.4,
  },
  menuBtnPrimarySub: {
    fontFamily: 'Cairo_400Regular', fontSize: 12, color: 'rgba(244,236,216,0.55)',
  },

  // Séparateur
  menuOrRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 20,
  },
  menuOrLine: {
    flex: 1, height: 1, backgroundColor: 'rgba(244,236,216,0.10)',
  },
  menuOrTxt: {
    fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.boneOff,
    letterSpacing: 1,
  },

  // Jouer avec un ami
  menuBtnFriend: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: C.acc,
    backgroundColor: 'rgba(139,26,74,0.10)',
  },
  menuBtnFriendIcon:  { fontSize: 24 },
  menuBtnFriendBody:  { gap: 2 },
  menuBtnFriendLbl: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.bone, letterSpacing: 0.4,
  },
  menuBtnFriendSub: {
    fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.boneOff,
  },

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
  oppProfileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '92%' },
  oppTopName:    { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 14, letterSpacing: 0.3, flexShrink: 1 },
  oppTopLabel:   { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 11, letterSpacing: 0.5 },

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

  // Compte à rebours du tour
  turnTimer: { paddingHorizontal: 32, gap: 4, alignItems: 'center' },
  turnTimerTxt: {
    fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 12, letterSpacing: 0.4,
  },
  turnTimerTxtUrgent: { color: C.red },
  turnTimerTrack: {
    width: '100%', height: 6, borderRadius: 3,
    backgroundColor: 'rgba(244,236,216,0.12)', overflow: 'hidden',
  },
  turnTimerFill: { height: '100%', borderRadius: 3 },

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
    width: 120, flexDirection: 'column', alignItems: 'center', gap: 8,
    borderWidth: 2, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 10,
  },
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
  overlayGold: {
    fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 18, textAlign: 'center',
    textShadowColor: 'rgba(201,162,39,0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
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

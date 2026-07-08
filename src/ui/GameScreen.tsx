import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Animated, Easing, Platform, View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withDelay,
  useReducedMotion,
} from 'react-native-reanimated'
import { useRondaGame, HUMAN_ID, BOT_ID } from '../game'
import { CardFace, CardBack } from './components/Card'
import { GoldBadge } from './components/GoldBadge'
import { AvatarDisplay } from './ProfileScreen'
import { PlayerProfileModal } from './PlayerProfileModal'
import { getBotAvatar, updateBotStats } from '../online/botFallback'
import { recordLeaderboardScore } from '../online/client'
import { invalidateLeaderboard } from '../online/leaderboardCache'
import { router, useLocalSearchParams, type Href } from 'expo-router'
import { recordResult, addGold, getProfile } from '../profile/profile'
import { XpGainBar, type XpGain } from './components/XpGainBar'
import { useProfile } from '../profile/useProfile'
import { tableColors } from '../cosmetics/catalog'
import { useI18n } from '../i18n/useI18n'
import type { PlayerId } from '../engine/types'
import { RitualPickerScreen } from './RitualPickerScreen'
import { CoinFlipScreen } from './CoinFlipScreen'
import { CardDrawScreen } from './CardDrawScreen'
import { RpsScreen } from './RpsScreen'
import { TERMS } from './terms'
import { initSounds, playSound } from './sounds'
import { getSoundEnabled, subscribeSound, setSoundEnabled } from '../hooks/soundPrefs'
import { playWinSound, playLoseSound, playGoldSound } from '../hooks/useSoundEffects'
import { ESCALIER_SEQUENCE } from '../engine/capture'
import type { Card, GameEvent } from '../engine/types'
import type { RitualType } from './RitualPickerScreen'

// ── Tokens ───────────────────────────────────────────────────────────────────

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  clay:    '#B5532A',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.35)',
} as const

// Sur web, l'Animated natif de React Native (transform/opacity) est plus fluide
// que Reanimated. Le pilote natif n'existe pas sur web → useNativeDriver seulement
// sur mobile.
const IS_WEB = Platform.OS === 'web'
const USE_NATIVE_DRIVER = !IS_WEB

/**
 * Trie les cartes de la table selon l'ordre de l'escalier
 * (1-2-3-4-5-6-7-10-11-12) — affichage seulement, le moteur reste inchangé.
 */
function sortTableCards(cards: readonly Card[]): Card[] {
  return [...cards].sort(
    (a, b) => ESCALIER_SEQUENCE.indexOf(a.value) - ESCALIER_SEQUENCE.indexOf(b.value),
  )
}

// ── Indicateur "le bot réfléchit / joue" ─────────────────────────────────────

export function BotThinking({ name }: { name?: string }) {
  const { t } = useI18n()
  const [alt, setAlt] = useState(false)
  useEffect(() => {
    const id = setInterval(() => setAlt(a => !a), 800)
    return () => clearInterval(id)
  }, [])
  const who = name ?? t('bot')
  return (
    <Text style={styles.botThinking}>
      {alt ? t('botPlays').replace('{name}', who) : t('botThinks').replace('{name}', who)}
    </Text>
  )
}

// ── Jeton de donneur (cercle laiton « D ») ───────────────────────────────────

function DealerToken() {
  return (
    <View style={styles.dealerToken}>
      <Text style={styles.dealerTokenTxt}>D</Text>
    </View>
  )
}

// ── Overlay annonce "Donne N" ─────────────────────────────────────────────────

function DealAnnounce({ dealNumber, starterText }: { dealNumber: number; starterText: string }) {
  const { t } = useI18n()
  const opacity = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(0.85)).current

  useEffect(() => {
    opacity.setValue(0)
    scale.setValue(0.85)
    Animated.parallel([
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(1000),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Animated.View
      style={[styles.dealAnnounceRoot, { opacity, transform: [{ scale }] }]}
      pointerEvents="none"
    >
      <Text style={styles.dealAnnounceLabel}>{t('dealLabel')}</Text>
      <Text style={styles.dealAnnounceNum}>{dealNumber}</Text>
      <Text style={styles.dealAnnounceStarter}>{starterText}</Text>
    </Animated.View>
  )
}

// ── Écran résultat de donne (Mab9ach) ────────────────────────────────────────

export function DealEndScreen({
  dealNumber,
  scores,
  onContinue,
  labels,
}: {
  dealNumber: number
  scores: [number, number]
  onContinue: () => void
  /** Libellés des deux camps (défaut 1v1 : Toi / Bot ; 2v2 : Équipe A / Équipe B). */
  labels?: [string, string]
}) {
  const { t } = useI18n()
  const resolvedLabels = labels ?? [t('you'), t('bot')]

  return (
    <SafeAreaView style={[styles.root, { justifyContent: 'center' }]}>
      <View style={[styles.column, { alignItems: 'center', justifyContent: 'center', gap: 0, paddingHorizontal: 28 }]}>

        <Text style={styles.dealEndLabel}>{t('dealLabel')} {dealNumber}</Text>

        <Text style={styles.dealEndAr}>{TERMS.mab9ach.ar}</Text>
        <Text style={styles.dealEndLa}>{TERMS.mab9ach.la}</Text>

        <View style={styles.dealEndRow}>
          {([0, 1] as const).map((i) => (
            <View key={i} style={styles.dealEndCell}>
              <Text style={styles.dealEndPlayerName}>{resolvedLabels[i]}</Text>
              <Text style={styles.dealEndTotal}>{scores[i]} pts</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={[styles.btnPrimary, { marginTop: 36 }]} onPress={onContinue}>
          <Text style={styles.btnPrimaryTxt}>{t('continueBtn')}</Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  )
}

// ── Écran fin de partie ───────────────────────────────────────────────────────

/**
 * Écran fin de partie animé, réutilisable 1v1 et 2v2.
 * Rebond d'entrée sur le titre (plus prononcé si victoire), puis fondu du corps.
 */
export function GameOverScreen({
  won,
  scoreText,
  onReplay,
  goldReward = 0,
  onWatchReplay,
  onMenu,
  xpInfo,
}: {
  won: boolean
  scoreText: string
  onReplay: () => void
  /** Or gagné pour cette victoire (affiché si > 0). */
  goldReward?: number
  /** Ouvre le replay de la partie (bouton affiché si fourni). */
  onWatchReplay?: () => void
  /** Retour au menu (bouton affiché si fourni) — sans confirmation, partie finie. */
  onMenu?: () => void
  /** XP gagné cette partie (barre animée affichée si fourni). */
  xpInfo?: XpGain | null
}) {
  const { t } = useI18n()
  const reduceMotion = useReducedMotion()
  const titleScale = useSharedValue(reduceMotion ? 1 : 0.4)
  const titleOpacity = useSharedValue(reduceMotion ? 1 : 0)
  const bodyOpacity = useSharedValue(reduceMotion ? 1 : 0)

  useEffect(() => {
    if (reduceMotion) return
    titleOpacity.value = withTiming(1, { duration: 220 })
    titleScale.value = withSequence(
      withSpring(won ? 1.2 : 1.08, { damping: 7, stiffness: 140, mass: 0.6 }),
      withSpring(1, { damping: 11, stiffness: 160 }),
    )
    bodyOpacity.value = withDelay(180, withTiming(1, { duration: 320 }))
  }, [reduceMotion, won])

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ scale: titleScale.value }],
  }))
  const bodyStyle = useAnimatedStyle(() => ({ opacity: bodyOpacity.value }))

  return (
    <SafeAreaView style={[styles.root, { justifyContent: 'center' }]}>
      <View style={[styles.column, { alignItems: 'center', justifyContent: 'center', gap: 24 }]}>
        <ReAnimated.Text style={[styles.gameOverTitle, titleStyle]}>
          {won ? t('won') : t('lost')}
        </ReAnimated.Text>
        <ReAnimated.View style={[{ alignItems: 'center', gap: 24 }, bodyStyle]}>
          <Text style={styles.gameOverScore}>{scoreText}</Text>
          {goldReward > 0 && (
            <Text style={styles.gameOverReward}>🪙 +{goldReward}</Text>
          )}
          {xpInfo && <XpGainBar {...xpInfo} />}
          <TouchableOpacity style={styles.btnPrimary} onPress={onReplay}>
            <Text style={styles.btnPrimaryTxt}>{t('replay')}</Text>
          </TouchableOpacity>
          {onWatchReplay && (
            <TouchableOpacity style={styles.btnGhost} onPress={onWatchReplay}>
              <Text style={styles.btnGhostTxt}>🎬 {t('watchReplay')}</Text>
            </TouchableOpacity>
          )}
          {onMenu && (
            <TouchableOpacity style={styles.btnGhost} onPress={onMenu}>
              <Text style={styles.btnGhostTxt}>🏠 {t('back')}</Text>
            </TouchableOpacity>
          )}
        </ReAnimated.View>
      </View>
    </SafeAreaView>
  )
}

function GameOver({ scores, onReplay, goldReward = 0, onWatchReplay, onMenu, xpInfo }: { scores: [number, number]; onReplay: () => void; goldReward?: number; onWatchReplay?: () => void; onMenu?: () => void; xpInfo?: XpGain | null }) {
  const { t } = useI18n()
  return (
    <GameOverScreen
      won={scores[HUMAN_ID] >= 41}
      scoreText={`${t('you')} ${scores[HUMAN_ID]} — ${t('bot')} ${scores[BOT_ID]}`}
      onReplay={onReplay}
      goldReward={goldReward}
      onWatchReplay={onWatchReplay}
      onMenu={onMenu}
      xpInfo={xpInfo}
    />
  )
}

// ── Mapping événement → libellé ──────────────────────────────────────────────

const EVENT_LABEL: Record<GameEvent, { ar: string; la: string; pts?: string }> = {
  caida:       { ...TERMS.araWahd,    pts: '+1' },
  ara_khamssa: { ...TERMS.araKhamssa, pts: '+5' },
  ara_3achra:  { ...TERMS.ara3achra,  pts: '+10' },
  missa:  TERMS.missa,
  ronda:  TERMS.ronda,
  tringa: TERMS.tringa,
  contre: { ar: '', la: 'Contre' },   // pas de terme arabe pour le contre
}

// ── Overlay d'événement plein écran ──────────────────────────────────────────

export function EventOverlay({ events }: { events: readonly GameEvent[] }) {
  const opacity = useRef(new Animated.Value(0)).current
  const scale   = useRef(new Animated.Value(0.82)).current

  useEffect(() => {
    opacity.setValue(0)
    scale.setValue(0.82)

    // Entrée : fondu + zoom ressort
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(scale,   { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
    ]).start()

    // Sortie : fondu après 1 100 ms (total visible ≈ 1 500 ms)
    const tid = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start()
    }, 1100)

    return () => clearTimeout(tid)
  }, [])

  return (
    <Animated.View style={[styles.overlayRoot, { opacity }]} pointerEvents="none">
      <Animated.View style={[styles.overlayCard, { transform: [{ scale }] }]}>
        {events.map((e, i) => {
          const label = EVENT_LABEL[e]
          return (
            <View key={i} style={[styles.overlayEvent, i > 0 && styles.overlayEventGap]}>
              {label.ar ? (
                <Text style={styles.overlayAr}>{label.ar}</Text>
              ) : null}
              <Text style={[styles.overlayLa, !label.ar && styles.overlayLaAlone]}>
                {label.la}
              </Text>
              {label.pts ? (
                <Text style={styles.overlayPts}>{label.pts}</Text>
              ) : null}
            </View>
          )
        })}
      </Animated.View>
    </Animated.View>
  )
}

// ── Animation de distribution ─────────────────────────────────────────────────
// Chaque carte « part » de la pioche (centre de l'écran) et glisse vers sa
// position finale. On approxime la position de départ par un offset par zone
// (depuis le centre) — l'effet visuel prime sur la précision pixel.

const DEAL_STAGGER = 150
const FROM_PLAYER_Y = -210   // main joueur (bas) : la carte vient d'en haut (centre)
const FROM_BOT_Y    = 175    // main bot (haut) : la carte vient d'en bas (centre)
const FROM_TABLE_Y  = 46     // table (centre) : court trajet depuis la pioche
const SPREAD_HAND   = 38     // éventail horizontal depuis le centre (main)
const SPREAD_TABLE  = 44     // éventail horizontal depuis le centre (table)

export function DealFly({
  children,
  startX,
  startY,
  delay,
}: {
  children: ReactNode
  startX: number   // offset initial (centre pioche - position finale)
  startY: number
  delay: number
}) {
  const reduceMotion = useReducedMotion()
  const tx = useRef(new Animated.Value(reduceMotion ? 0 : startX)).current
  const ty = useRef(new Animated.Value(reduceMotion ? 0 : startY)).current
  const op = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current

  useEffect(() => {
    // Son de distribution, calé sur le départ de la carte.
    const sndTid = setTimeout(() => { void playSound('card_deal') }, delay)
    if (reduceMotion) return () => clearTimeout(sndTid)

    if (IS_WEB) {
      // Web : une seule valeur animée (translateY) + timing → plus fluide
      // qu'un double spring X+Y.
      Animated.parallel([
        Animated.timing(ty, { toValue: 0, duration: 260, delay, easing: Easing.out(Easing.quad), useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(op, { toValue: 1, duration: 180, delay, useNativeDriver: USE_NATIVE_DRIVER }),
      ]).start()
    } else {
      // Mobile natif : spring X+Y (effet « éventail » depuis la pioche).
      const spring = { useNativeDriver: USE_NATIVE_DRIVER, damping: 16, stiffness: 130, mass: 0.7, delay }
      Animated.parallel([
        Animated.spring(tx, { toValue: 0, ...spring }),
        Animated.spring(ty, { toValue: 0, ...spring }),
        Animated.timing(op, { toValue: 1, duration: 180, delay, useNativeDriver: USE_NATIVE_DRIVER }),
      ]).start()
    }
    return () => clearTimeout(sndTid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const transform = IS_WEB
    ? [{ translateY: ty }]
    : [{ translateX: tx }, { translateY: ty }]

  return <Animated.View style={{ opacity: op, transform }}>{children}</Animated.View>
}

// ── Animation pose : glisse depuis la main vers la table (~250 ms) ────────────

function PlayedCard({
  children,
  from,
}: {
  children: ReactNode
  from: 'top' | 'bottom'   // côté d'origine (haut = bot, bas = joueur)
}) {
  const reduceMotion = useReducedMotion()
  const start = from === 'bottom' ? 80 : -80
  const ty = useSharedValue(reduceMotion ? 0 : start)
  const op = useSharedValue(reduceMotion ? 1 : 0)

  useEffect(() => {
    if (reduceMotion) return
    ty.value = withSpring(0, { damping: 15, stiffness: 150, mass: 0.6 })
    op.value = withTiming(1, { duration: 140 })
  }, [])

  const st = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ translateY: ty.value }],
  }))

  return <ReAnimated.View style={st}>{children}</ReAnimated.View>
}

// ── Animation capture : aspiration séquentielle des cartes vers la pile ───────
// Les cartes capturées disparaissent instantanément de state.table (le moteur
// les retire). Pour les voir réellement s'envoler, on les ré-affiche EN PLACE
// dans la rangée de table (opacity réduite) et chacune s'aspire l'une après
// l'autre vers la pile du captureur. Pour 4 cartes : (4-1)*200 + 500 = 1100 ms.

// Sur web, on raccourcit le stagger et la durée : les animations longues
// amplifient le lag. Mobile natif garde des valeurs plus généreuses.
export const FLY_STAGGER = IS_WEB ? 200 : 300
export const FLY_DURATION = IS_WEB ? 500 : 800
const FLY_ZOOM = 150                       // phase de « bond » (zoom)
const FLY_SUCK = FLY_DURATION - FLY_ZOOM   // phase d'aspiration

export function FlyingCard({
  card,
  dir,
  delay,
}: {
  card: Card
  dir: number   // +1 = vers le bas (joueur), -1 = vers le haut (bot)
  delay: number
}) {
  const reduceMotion = useReducedMotion()
  const scale = useRef(new Animated.Value(1)).current
  const ty    = useRef(new Animated.Value(0)).current
  const op    = useRef(new Animated.Value(0.5)).current   // marqueur « déjà capturée »

  useEffect(() => {
    if (reduceMotion) { scale.setValue(0); op.setValue(0); return }
    const ease = Easing.in(Easing.cubic)
    // La carte « bondit » (1 → 1.15) puis s'aspire (1.15 → 0).
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.15, duration: FLY_ZOOM, delay, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(scale, { toValue: 0,    duration: FLY_SUCK, easing: ease, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start()
    // Glissement vers la pile + fondu pendant la phase d'aspiration.
    Animated.timing(ty, { toValue: 180 * dir, duration: FLY_SUCK, delay: delay + FLY_ZOOM, easing: ease, useNativeDriver: USE_NATIVE_DRIVER }).start()
    Animated.timing(op, { toValue: 0,         duration: FLY_SUCK, delay: delay + FLY_ZOOM, useNativeDriver: USE_NATIVE_DRIVER }).start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Animated.View style={{ opacity: op, transform: [{ translateY: ty }, { scale }] }}>
      <CardFace card={card} size="md" />
    </Animated.View>
  )
}

// ── Mini pile de cartes capturées (dos empilés + chiffre) ─────────────────────

function MiniPile({ count }: { count: number }) {
  const reduceMotion = useReducedMotion()
  const pop  = useSharedValue(1)
  const prev = useRef(count)

  useEffect(() => {
    if (!reduceMotion && count > prev.current) {
      pop.value = withSequence(
        withTiming(1.18, { duration: 110 }),
        withSpring(1, { damping: 9, stiffness: 170 }),
      )
    }
    prev.current = count
  }, [count])

  const st = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }))
  const layers = Math.min(4, count)

  return (
    <View style={styles.pileCol}>
      <ReAnimated.View style={[styles.pileBox, st]}>
        {count === 0 ? (
          <View style={styles.pileEmpty} />
        ) : (
          Array.from({ length: layers }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.pileCard,
                // offset 0 = carte de devant (rendue en dernier → au-dessus)
                { left: (layers - 1 - i) * 2.5, bottom: (layers - 1 - i) * 2.5 },
              ]}
            />
          ))
        )}
      </ReAnimated.View>
      <Text style={styles.pileNum}>{count}</Text>
    </View>
  )
}

// ── Pile de pioche : épaisseur ∝ cartes restantes ─────────────────────────────

function DeckStack({ count }: { count: number }) {
  // 0 carte → vide (effet Mab9ach fort). Sinon épaisseur croissante (max ~7).
  const layers = count === 0 ? 0 : Math.min(7, Math.max(1, Math.round(count / 5)))

  return (
    <View style={styles.deckCol}>
      <View style={styles.deckStack}>
        {layers === 0 ? (
          <View style={styles.deckEmpty} />
        ) : (
          Array.from({ length: layers }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.deckLayer,
                // offset 0 = carte de devant (au-dessus), épaisseur derrière
                { right: (layers - 1 - i) * 1.6, bottom: (layers - 1 - i) * 1.6 },
                i === layers - 1 && styles.deckTop,
              ]}
            />
          ))
        )}
      </View>
      <Text style={styles.deckCount}>{count}</Text>
    </View>
  )
}

// ── Écran de jeu ─────────────────────────────────────────────────────────────

interface GameScreenProps {
  onBack: () => void   // retour au menu
  /**
   * Source de l'état de jeu. Par défaut le hook solo (vs IA) ; le mode en ligne
   * injecte useOnlineGame (même interface). Le solo reste strictement inchangé.
   */
  useGame?: typeof useRondaGame
  /** Nom de l'adversaire (mode online). undefined en solo → affiche « Bot ». */
  opponentName?: string
  /** true = partie en ligne → quitter demande confirmation (l'adversaire gagne). */
  online?: boolean
  /**
   * Mise (or) quand la partie vient du matchmaking et bascule sur un bot.
   * >0 → partie misée : victoire crédite le pot (2×mise), et « Rejouer » relance
   * le matchmaking au lieu d'une partie locale.
   */
  stakeBet?: number
  /** Avatar/genre du bot de repli matchmaking (absents en entraînement normal). */
  botAvatarIdx?: number
  botFemale?: boolean
  /** uid fantôme Firestore du bot (voir getOrCreateBotProfile) et son prénom brut. */
  botUid?: string
  rawBotName?: string
}

export function GameScreen({
  onBack, useGame = useRondaGame, opponentName, online = false, stakeBet = 0,
  botAvatarIdx, botFemale, botUid, rawBotName,
}: GameScreenProps) {
  const { appPhase, view, setCaptureAnimating, startGame, nextDeal, playCard, declare, contest, newGame } = useGame()
  const { t } = useI18n()
  const { table, username } = useProfile()
  const felt = tableColors(table)[0]  // couleur de fond du tapis équipé
  // Partie venue du matchmaking en ligne (repli bot) → bonus XP online (+15),
  // exactement comme une vraie partie en ligne.
  const { wasOnline } = useLocalSearchParams<{ wasOnline?: string }>()
  const isOnlineGame = wasOnline === '1'

  // ── Tous les hooks AVANT tout return conditionnel ─────────────────────────
  const [selectedRitual, setSelectedRitual] = useState<RitualType | null>(null)
  const [toastEvents, setToastEvents] = useState<readonly GameEvent[] | null>(null)
  const [confirmQuit, setConfirmQuit] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Niveau crédible pour le bot déguisé — figé pour toute la partie.
  const fakeBotLevel = useRef(Math.floor(Math.random() * 16) + 3).current
  const [showBotProfile, setShowBotProfile] = useState(false)
  const hasBotAvatar = botAvatarIdx !== undefined && botFemale !== undefined

  // Récompense de fin de partie : on enregistre le résultat une seule fois quand
  // la partie se termine (incrémente les stats + crédite l'or si victoire).
  const [winReward, setWinReward] = useState(0)
  const [xpInfo, setXpInfo] = useState<XpGain | null>(null)
  const resultRecorded = useRef(false)

  // Pulsation du bouton Ronda/Tringa
  const rondaPulse = useRef(new Animated.Value(1)).current
  const rondaPulseAnim = useRef<Animated.CompositeAnimation | null>(null)
  useEffect(() => {
    if (view.isGameOver) {
      if (!resultRecorded.current) {
        resultRecorded.current = true
        const won = view.state.players[HUMAN_ID].score >= 41
        const before = getProfile()
        const { goldReward, xpGained } = recordResult(won, 'ronda', { online: isOnlineGame })
        // Partie misée (repli bot) : victoire crédite le pot (net = +mise). Défaite
        // → la mise reste retirée. En ligne, ce réglage est géré par le serveur.
        if (stakeBet > 0 && !online && won) addGold(stakeBet * 2)
        // Partie misée vs bot (hors-ligne, aucune Room côté serveur) : sans cet
        // appel, la victoire ne contribuerait jamais au classement hebdomadaire.
        if (won && stakeBet > 0 && rawBotName) {
          void recordLeaderboardScore(username, stakeBet, 'ronda')
          invalidateLeaderboard() // force un refetch au prochain affichage
        }
        setWinReward(goldReward)
        const after = getProfile()
        setXpInfo({ xpGained, oldXp: before.xp, oldLevel: before.level, newXp: after.xp, newLevel: after.level })
        // Sons de fin de partie.
        if (won) { playWinSound(); if (goldReward > 0 || stakeBet > 0) playGoldSound() }
        else {
          playLoseSound()
          // Le bot gagne la mise → met à jour son profil fantôme Firestore.
          if (stakeBet > 0 && rawBotName) void updateBotStats(rawBotName, 'ronda', stakeBet, isOnlineGame)
          // Partie perçue comme en ligne : le bot doit apparaître au classement
          // hebdomadaire comme n'importe quel adversaire en ligne qui gagnerait
          // (symétrique à l'appel côté victoire du joueur, ligne ~605).
          if (stakeBet > 0 && rawBotName && isOnlineGame) {
            void recordLeaderboardScore(rawBotName, stakeBet, 'ronda')
            invalidateLeaderboard()
          }
        }
      }
    } else {
      resultRecorded.current = false
      setWinReward(0)
      setXpInfo(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.isGameOver])

  // Quitter : confirmation seulement si la partie est en cours (en ligne, départ
  // = défaite). Une fois terminée, retour direct au menu sans alerte.
  const handleQuit = () => {
    if (view.isGameOver) { onBack(); return }
    setConfirmQuit(true)
  }

  // ── Préchargement des sons (une fois) ─────────────────────────────────────
  useEffect(() => { void initSounds() }, [])

  // Sourdine : préférence son unique et persistée (musique + effets + sons du jeu).
  const [soundOn, setSoundOn] = useState(getSoundEnabled())
  useEffect(() => subscribeSound(setSoundOn), [])
  const muted = !soundOn
  const toggleMute = () => { void setSoundEnabled(!soundOn) }

  // Délai avant l'écran de résultat de donne : on laisse 1,5 s pour voir la
  // dernière carte posée / l'animation de capture avant d'afficher DealEndScreen.
  const [showDealEnd, setShowDealEnd] = useState(false)
  useEffect(() => {
    if (!view.isDealEnd) {
      setShowDealEnd(false)
      return
    }
    const t = setTimeout(() => setShowDealEnd(true), 1500)
    return () => clearTimeout(t)
  }, [view.isDealEnd])

  // ── Détection de distribution (manche) ────────────────────────────────────
  // Incrémenter dealGen à chaque fois qu'une donne se produit :
  // hand.length monte de <3 à 3 (re-donne) ou de 0 à 3 (première donne).
  const [dealGen, setDealGen]  = useState(0)
  const prevHandLen = useRef(-1)

  // Son Mab9ach quand on entre dans la dernière redistribution.
  const prevMabqach = useRef(false)
  useEffect(() => {
    const m = view.state.isMabqach
    if (m && !prevMabqach.current) void playSound('mabqach')
    prevMabqach.current = m
  }, [view.state.isMabqach])

  // ── Annonce "Donne N" ─────────────────────────────────────────────────────
  // Déclenché quand dealNumber change (ou quand on entre en IN_GAME).
  const [dealAnnouncing, setDealAnnouncing] = useState<number | null>(null)
  // Qui commence la donne, capturé au moment de l'annonce (currentPlayer initial).
  const [starterIsHuman, setStarterIsHuman] = useState(true)
  const prevDealNumber = useRef<number | null>(null)

  useEffect(() => {
    if (appPhase !== 'IN_GAME') {
      prevDealNumber.current = null
      return
    }
    const dn = view.state.dealNumber
    if (prevDealNumber.current === dn) return
    prevDealNumber.current = dn
    setStarterIsHuman(view.state.currentPlayer === HUMAN_ID)
    setDealAnnouncing(dn + 1)   // 1-indexé pour l'affichage
    const tid = setTimeout(() => setDealAnnouncing(null), 1500)
    return () => clearTimeout(tid)
  }, [view.state.dealNumber, appPhase])

  const { lastEvent } = view
  const currHandLen = view.state.players[HUMAN_ID]?.hand?.length ?? 0

  useEffect(() => {
    const prev = prevHandLen.current
    if (prev < 3 && currHandLen === 3) {
      setDealGen(g => g + 1)
    }
    prevHandLen.current = currHandLen
  }, [currHandLen])

  // ── Détection de capture → animation d'aspiration ─────────────────────────
  // On compare la table d'un coup au suivant : les cartes disparues lors d'une
  // capture (même donne, même manche) s'envolent vers la pile du captureur.
  const [flying, setFlying] = useState<{ cards: Card[]; by: PlayerId; id: number } | null>(null)
  const prevTableRef = useRef<Card[]>([])
  const prevRoundRef = useRef(-1)
  const prevDealRef  = useRef(-1)
  const flyId        = useRef(0)
  const flyTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sndTimers    = useRef<ReturnType<typeof setTimeout>[]>([])

  // Cartes posées sur la table AU MOMENT d'une nouvelle donne (pour ne faire
  // voler depuis la pioche que ces 4 cartes-là, pas celles posées en cours de jeu).
  // Mis à jour synchroniquement quand le numéro de donne change.
  const lastDealNumRef = useRef(-1)
  const dealtTableRef  = useRef<string[]>([])
  if (view.state.dealNumber !== lastDealNumRef.current) {
    lastDealNumRef.current = view.state.dealNumber
    dealtTableRef.current  = view.state.table.map(c => `${c.value}-${c.suit}`)
  }

  useEffect(() => {
    const gs = view.state
    const cur = gs.table
    const sameDeal  = gs.dealNumber  === prevDealRef.current
    const sameRound = gs.roundNumber === prevRoundRef.current
    const key = (c: Card) => `${c.value}-${c.suit}`
    const curKeys  = new Set(cur.map(key))
    const prevKeys = new Set(prevTableRef.current.map(key))
    const removed = prevTableRef.current.filter(c => !curKeys.has(key(c)))
    const added   = cur.filter(c => !prevKeys.has(key(c)))

    // On ne réagit qu'aux coups en cours de jeu (pas distribution / fin de donne).
    if (sameDeal && sameRound) {
      if (removed.length > 0 && gs.lastCapture !== null) {
        // Capture : gel du jeu + aspiration séquentielle + un son par carte.
        flyId.current += 1
        setFlying({ cards: removed, by: gs.lastCapture.playerId, id: flyId.current })
        setCaptureAnimating(true)

        if (flyTimer.current) clearTimeout(flyTimer.current)
        const total = (removed.length - 1) * FLY_STAGGER + FLY_DURATION + 60
        flyTimer.current = setTimeout(() => {
          setFlying(null)
          setCaptureAnimating(false)   // dégèle le jeu
        }, total)

        // Un « card_capture » par carte, calé sur le stagger de l'animation.
        sndTimers.current.forEach(clearTimeout)
        sndTimers.current = removed.map((_, i) =>
          setTimeout(() => { void playSound('card_capture') }, i * FLY_STAGGER),
        )
      } else if (added.length > 0) {
        // Pose simple (carte posée sur la table sans capturer).
        void playSound('card_place')
      }
    }

    prevTableRef.current = [...cur]
    prevRoundRef.current = gs.roundNumber
    prevDealRef.current  = gs.dealNumber
  }, [view.state])

  useEffect(() => () => {
    if (flyTimer.current) clearTimeout(flyTimer.current)
    sndTimers.current.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    if (!lastEvent) return
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToastEvents(lastEvent.events)
    toastTimer.current = setTimeout(() => setToastEvents(null), 1500)

    // Sons d'annonce liés aux événements.
    if (lastEvent.events.includes('caida')) {
      void playSound('caida')
    } else if (lastEvent.events.includes('ronda') || lastEvent.events.includes('tringa')) {
      void playSound('announce')
    }

    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [lastEvent?.id])

  // Tri des cartes de table mémoïsé : ne se recalcule que si la table change,
  // pas à chaque re-render (animations, états transitoires…).
  const sortedTable = useMemo(() => sortTableCards(view.state.table), [view.state.table])

  // Pulsation Ronda : démarre quand disponible, s'arrête sinon.
  // (Déclaré AVANT tout return conditionnel pour ne jamais changer le nombre de
  // hooks entre le rituel et la partie — sinon React plante et affiche un écran blanc.)
  const canDeclareNow = view.canDeclare
  useEffect(() => {
    if (canDeclareNow) {
      rondaPulseAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(rondaPulse, { toValue: 1.08, duration: 500, useNativeDriver: true }),
          Animated.timing(rondaPulse, { toValue: 1,    duration: 500, useNativeDriver: true }),
        ]),
      )
      rondaPulseAnim.current.start()
    } else {
      rondaPulseAnim.current?.stop()
      rondaPulse.setValue(1)
    }
    return () => { rondaPulseAnim.current?.stop() }
  }, [canDeclareNow, rondaPulse])

  // ── Sélection du rituel (avant la partie) ─────────────────────────────────
  if (appPhase === 'RITUAL_PICKER') {
    if (!selectedRitual) {
      return <RitualPickerScreen onSelect={setSelectedRitual} onBack={onBack} />
    }
    if (selectedRitual === 'coin_flip') {
      return <CoinFlipScreen onStart={startGame} onBack={() => setSelectedRitual(null)} />
    }
    if (selectedRitual === 'card_draw') {
      return <CardDrawScreen onStart={startGame} onBack={() => setSelectedRitual(null)} />
    }
    return <RpsScreen onStart={startGame} onBack={() => setSelectedRitual(null)} />
  }

  // ── Partie en cours ───────────────────────────────────────────────────────
  const { state, isHumanTurn, canDeclare, canContest, contestValue, isGameOver, isDealEnd, isBotThinking } = view

  // Garde : état non prêt (init) → écran de chargement plutôt qu'un rendu blanc.
  if (!state || !state.players?.[HUMAN_ID] || !state.players?.[BOT_ID]) {
    return (
      <SafeAreaView style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#C9A227" size="large" />
      </SafeAreaView>
    )
  }

  const human = state.players[HUMAN_ID]
  const bot   = state.players[BOT_ID]

  if (isGameOver) {
    return (
      <GameOver
        scores={[human.score, bot.score]}
        goldReward={winReward}
        xpInfo={xpInfo}
        onReplay={() => {
          // Partie misée → « Rejouer » relance le matchmaking (nouvelle mise).
          if (stakeBet > 0) { router.replace('/bet?game=ronda' as Href); return }
          setSelectedRitual(null); newGame()
        }}
        onWatchReplay={() => router.push('/replay' as Href)}
        onMenu={() => router.replace('/' as Href)}
      />
    )
  }

  if (isDealEnd && showDealEnd) {
    return (
      <DealEndScreen
        dealNumber={state.dealNumber + 1}
        scores={[human.score, bot.score]}
        onContinue={nextDeal}
      />
    )
  }

  // Carte du dernier coup encore présente sur la table.
  // lastPlayed[1 - currentPlayer] = le joueur qui vient de jouer.
  // Si ce joueur a capturé, sa carte n'est plus dans state.table → null → pas de repère.
  const lastPlayerId = (1 - state.currentPlayer) as 0 | 1
  const lastPlayedCard = state.lastPlayed[lastPlayerId]
  const lastOnTable = lastPlayedCard
    ? (state.table.find(c => c.value === lastPlayedCard.value && c.suit === lastPlayedCard.suit) ?? null)
    : null

  // Ordre du donneur : table (4) → bot (3) → joueur (3). À une redistribution
  // (roundNumber ≥ 1), seules les mains sont distribuées (pas de cartes table).
  const isFreshDeal = state.roundNumber === 0
  const botBase    = isFreshDeal ? 4 * DEAL_STAGGER : 0
  const playerBase = botBase + 3 * DEAL_STAGGER

  const handleCardPress = (card: Card) => {
    if (isHumanTurn && !flying) playCard(card)
  }

  const handleDeclare = () => {
    if (human.pendingCombo) declare(human.pendingCombo)
  }

  const comboTerm =
    human.pendingCombo?.type === 'tringa' ? TERMS.tringa : TERMS.ronda

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: felt }]} edges={['top', 'bottom']}>
      {/* Colonne centrée — max 430 px sur grand écran */}
      <View style={styles.column}>

      {/* ── 1. Barre de score ──────────────────────────────── */}
      <View style={styles.scorebar}>
        <TouchableOpacity style={styles.quitBtn} onPress={handleQuit} accessibilityLabel={t('quit')}>
          <Text style={styles.quitTxt}>✕</Text>
        </TouchableOpacity>
        <View style={styles.scorebarInner}>
          <View>
            <View style={styles.sbNameRow}>
              <Text style={styles.sbName}>{t('you')}</Text>
              {state.dealer === HUMAN_ID && <DealerToken />}
            </View>
            <Text style={styles.sbScore}>{human.score}</Text>
          </View>
          <View style={styles.sbMid}>
            <Text style={styles.sbDash}>—</Text>
            <Text style={styles.sbTarget}>{t('target')}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 3 }}>
            {hasBotAvatar && (
              <TouchableOpacity onPress={() => setShowBotProfile(true)} activeOpacity={0.7}>
                <AvatarDisplay
                  type="image"
                  initial={(opponentName ?? 'B')[0]?.toUpperCase() ?? '?'}
                  emoji=""
                  image={getBotAvatar(botAvatarIdx!, botFemale!)}
                  size={28}
                  level={fakeBotLevel}
                />
              </TouchableOpacity>
            )}
            <View style={styles.sbNameRow}>
              {state.dealer === BOT_ID && <DealerToken />}
              <Text style={styles.sbName}>{opponentName ?? t('bot')}</Text>
            </View>
            <Text style={styles.sbScore}>{bot.score}</Text>
          </View>
        </View>
        <GoldBadge style={{ marginLeft: 14 }} />
        <TouchableOpacity
          style={styles.muteBtn}
          onPress={toggleMute}
          accessibilityLabel={muted ? t('unmute') : t('mute')}
        >
          <Text style={styles.muteIcon}>{muted ? '🔇' : '🔊'}</Text>
        </TouchableOpacity>
      </View>

      {/* Profil de l'adversaire (tap sur l'avatar du bot déguisé) */}
      <PlayerProfileModal
        visible={showBotProfile}
        uid={botUid}
        name={rawBotName}
        onClose={() => setShowBotProfile(false)}
      />

      {/* Confirmation de départ. Partie misée → forfait = mise perdue + défaite. */}
      <Modal visible={confirmQuit} transparent animationType="fade" onRequestClose={() => setConfirmQuit(false)}>
        <View style={styles.quitBackdrop}>
          <View style={styles.quitCard}>
            <Text style={styles.quitCardTitle}>
              {stakeBet > 0 ? t('forfeitStakeConfirm').replace('{n}', String(stakeBet)) : t('quitConfirm')}
            </Text>
            {online && <Text style={styles.quitCardText}>{t('quitOnline')}</Text>}
            <View style={styles.quitActions}>
              <TouchableOpacity style={styles.quitStay} onPress={() => setConfirmQuit(false)}>
                <Text style={styles.quitStayTxt}>{t('stay')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quitLeave}
                onPress={() => {
                  setConfirmQuit(false)
                  // Forfait volontaire d'une partie misée : défaite enregistrée
                  // (la mise, déjà déduite au moment de miser via
                  // BetScreen.launchGame → removeGold(bet), reste perdue — ne
                  // PAS la redéduire ici, ça la débiterait deux fois). Le bot
                  // gagnant doit en revanche recevoir le même traitement
                  // qu'une défaite normale (updateBotStats + classement
                  // hebdo), ce qui manquait sur ce chemin.
                  if (stakeBet > 0) {
                    recordResult(false, 'ronda', { online: isOnlineGame })
                    if (rawBotName) {
                      void updateBotStats(rawBotName, 'ronda', stakeBet, isOnlineGame)
                      if (isOnlineGame) { void recordLeaderboardScore(rawBotName, stakeBet, 'ronda'); invalidateLeaderboard() }
                    }
                    router.replace('/' as Href)
                    return
                  }
                  onBack()
                }}
              >
                <Text style={styles.quitLeaveTxt}>{t('leave')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 2. Main adverse (dos) + pile capturée du bot ───── */}
      <View style={styles.handRow}>
        <View style={styles.rowSide} />
        <View style={styles.botHand}>
          {bot.hand.map((_, i) => {
            const center = (bot.hand.length - 1) / 2
            return (
              <DealFly
                key={`b-${dealGen}-${i}`}
                startX={(center - i) * SPREAD_HAND}
                startY={FROM_BOT_Y}
                delay={botBase + i * DEAL_STAGGER}
              >
                <CardBack size="sm" />
              </DealFly>
            )
          })}
        </View>
        <View style={[styles.rowSide, styles.rowSideEnd]}>
          <MiniPile count={bot.captured.length} />
        </View>
      </View>

      {/* ── Bannière Mab9ach ───────────────────────────────── */}
      {state.isMabqach && (
        <View style={styles.mabBanner}>
          <Text style={styles.mabBannerAr}>{TERMS.mab9ach.ar}</Text>
          <Text style={styles.mabBannerLa}>{TERMS.mab9ach.la}</Text>
        </View>
      )}

      {/* ── 3. Zone de table ───────────────────────────────── */}
      <View style={styles.tableZone}>
        {state.table.length === 0 && !flying ? (
          <Text style={styles.tableEmpty}>{t('tableEmpty')}</Text>
        ) : (
          <View style={styles.tableCards}>
            {sortedTable.map((card) => {
              const k = `${card.value}-${card.suit}`
              const isLast =
                lastOnTable !== null &&
                card.value === lastOnTable.value &&
                card.suit  === lastOnTable.suit
              const face = <CardFace card={card} size="md" highlighted={isLast} />

              // 1. La dernière carte posée glisse depuis la main du joueur concerné.
              if (isLast) {
                return (
                  <PlayedCard key={`played-${k}`} from={lastPlayerId === HUMAN_ID ? 'bottom' : 'top'}>
                    {face}
                  </PlayedCard>
                )
              }
              // 2. Les 4 cartes initiales de la donne volent depuis la pioche.
              const di = dealtTableRef.current.indexOf(k)
              if (di !== -1) {
                const center = (dealtTableRef.current.length - 1) / 2
                return (
                  <DealFly
                    key={`deal-${state.dealNumber}-${k}`}
                    startX={(center - di) * SPREAD_TABLE}
                    startY={FROM_TABLE_Y}
                    delay={di * DEAL_STAGGER}
                  >
                    {face}
                  </DealFly>
                )
              }
              // 3. Carte ordinaire (posée en cours de jeu, désormais statique).
              return <View key={`t-${k}`}>{face}</View>
            })}

            {/* Cartes capturées : maintenues en place puis aspirées vers la pile */}
            {flying?.cards.map((card, i) => (
              <FlyingCard
                key={`fly-${flying.id}-${card.value}-${card.suit}`}
                card={card}
                dir={flying.by === HUMAN_ID ? 1 : -1}
                delay={i * FLY_STAGGER}
              />
            ))}
          </View>
        )}

        {/* Pile de pioche (bas-droite) */}
        <View style={styles.tableFooter}>
          <DeckStack count={state.deck.length} />
        </View>
      </View>

      {/* ── Indicateur bot (sous la table) ─────────────────── */}
      {isBotThinking && <BotThinking name={opponentName} />}

      {/* ── Spacer ─────────────────────────────────────────── */}
      <View style={{ flex: 1 }} />

      {/* ── 4. Tour / statut ───────────────────────────────── */}
      {!isHumanTurn && !isBotThinking && (
        <View style={styles.statusBar}>
          <Text style={styles.statusTxt}>
            {opponentName ? `${opponentName}…` : t('botTurn')}
          </Text>
        </View>
      )}

      {/* ── 5. Main du joueur + pile capturée du joueur ────── */}
      <View style={styles.handRow}>
        <View style={styles.rowSide} />
        <View style={styles.playerHand}>
          {human.hand.map((card, i) => {
            const center = (human.hand.length - 1) / 2
            return (
              <DealFly
                key={`h-${dealGen}-${card.value}-${card.suit}`}
                startX={(center - i) * SPREAD_HAND}
                startY={FROM_PLAYER_Y}
                delay={playerBase + i * DEAL_STAGGER}
              >
                <CardFace
                  card={card}
                  size="lg"
                  onPress={() => handleCardPress(card)}
                  disabled={!isHumanTurn || !!flying}
                />
              </DealFly>
            )
          })}
        </View>
        <View style={[styles.rowSide, styles.rowSideEnd]}>
          <MiniPile count={human.captured.length} />
        </View>
      </View>

      {/* ── Overlay d'événement (par-dessus le jeu, ne bloque pas les taps) */}
      {toastEvents && (
        <EventOverlay key={lastEvent?.id ?? 0} events={toastEvents} />
      )}

      {/* ── Overlay "Donne N" ─────────────────────────────── */}
      {dealAnnouncing !== null && (
        <DealAnnounce
          dealNumber={dealAnnouncing}
          starterText={starterIsHuman ? t('youStart') : t('opponentStarts').replace('{name}', opponentName ?? t('bot'))}
        />
      )}

      {/* ── 6. Barre d'actions ─────────────────────────────── */}
      <View style={styles.actionBar}>
        <View style={styles.abLeft}>
          {canDeclare && !flying && (
            <Animated.View style={{ transform: [{ scale: rondaPulse }] }}>
              <TouchableOpacity
                style={styles.btnRonda}
                onPress={handleDeclare}
                activeOpacity={0.8}
              >
                <Text style={styles.btnRondaAr}>{comboTerm.ar}</Text>
                <Text style={styles.btnRondaLa}>{comboTerm.la}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
          {canContest && contestValue !== null && !flying && (
            <TouchableOpacity style={styles.btnContre} onPress={() => contest(contestValue)}>
              <Text style={styles.btnContreTxt}>Contre</Text>
              <Text style={styles.btnContreSub}>{contestValue}</Text>
            </TouchableOpacity>
          )}
        </View>
        {/* La pioche est désormais affichée en pile dans la zone de table. */}
      </View>

      </View>{/* /column */}
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.table,
    alignItems: 'center',       // centre la colonne horizontalement
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: 430,
  },

  // Score bar
  scorebar: {
    backgroundColor: 'rgba(9,64,47,0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(201,162,39,0.22)',
    borderLeftWidth: 0,
    borderRightWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  scorebarInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quitBtn: {
    marginRight: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  quitTxt: { fontSize: 15, color: 'rgba(244,236,216,0.7)', fontWeight: '600' },
  quitBackdrop: {
    flex: 1, backgroundColor: 'rgba(9,64,47,0.85)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28,
  },
  quitCard: {
    width: '100%', maxWidth: 360, backgroundColor: C.deep, borderRadius: 16,
    padding: 22, gap: 12, borderWidth: 1, borderColor: 'rgba(201,162,39,0.3)',
  },
  quitCardTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 18, color: C.bone },
  quitCardText: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff, lineHeight: 21 },
  quitActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 4 },
  quitStay: { paddingVertical: 12, paddingHorizontal: 18 },
  quitStayTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.brass },
  quitLeave: {
    backgroundColor: 'rgba(231,76,60,0.15)', borderRadius: 10, paddingVertical: 12,
    paddingHorizontal: 22, borderWidth: 1.5, borderColor: '#E74C3C',
  },
  quitLeaveTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: '#E74C3C' },
  muteBtn: {
    marginLeft: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  muteIcon: {
    fontSize: 16,
  },
  sbName: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 9,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: C.boneOff,
  },
  sbNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dealerToken: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.brass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealerTokenTxt: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 11,
    color: C.ink,
    lineHeight: 14,
  },
  sbScore: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 30,
    color: C.bone,
    lineHeight: 34,
  },
  sbMid: {
    alignItems: 'center',
    gap: 3,
  },
  sbDash: {
    fontSize: 18,
    color: 'rgba(244,236,216,0.12)',
  },
  sbTarget: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 11,
    color: C.brass,
    letterSpacing: 0.5,
  },

  // Bot hand — wrap sur 2e rangée si besoin
  botHand: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 10,
    rowGap: 8,
    paddingTop: 14,
    paddingHorizontal: 16,
  },

  // Table zone
  tableZone: {
    marginTop: 14,
    marginHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 14,
    padding: 14,
    shadowColor: C.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  tableCards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 10,
    rowGap: 10,
  },
  tableEmpty: {
    fontFamily: 'Cairo_400Regular',
    color: C.boneOff,
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },
  deckLabel: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 11,
    color: C.boneOff,
    textAlign: 'right',
    marginTop: 10,
  },
  deckNum: {
    fontFamily: 'Cairo_600SemiBold',
    color: 'rgba(244,236,216,0.6)',
  },

  // Rangée main + pile capturée (latérale)
  handRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 8,
  },
  rowSide: {
    flex: 1,
    justifyContent: 'center',
  },
  rowSideEnd: {
    alignItems: 'flex-end',
  },

  // Mini pile de cartes capturées
  pileCol: {
    alignItems: 'center',
    gap: 3,
  },
  pileBox: {
    width: 32,
    height: 42,
  },
  pileCard: {
    position: 'absolute',
    width: 22,
    height: 32,
    borderRadius: 3,
    backgroundColor: C.deep,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.55)',
  },
  pileEmpty: {
    position: 'absolute',
    left: 5,
    bottom: 5,
    width: 22,
    height: 32,
    borderRadius: 3,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(244,236,216,0.18)',
  },
  pileNum: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 12,
    color: C.bone,
  },

  // Pile de pioche dans la table
  tableFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    marginTop: 10,
  },
  deckCol: {
    alignItems: 'center',
    gap: 3,
  },
  deckStack: {
    width: 36,
    height: 46,
  },
  deckLayer: {
    position: 'absolute',
    width: 26,
    height: 36,
    borderRadius: 4,
    backgroundColor: C.deep,
    borderWidth: 1,
    borderColor: 'rgba(244,236,216,0.18)',
  },
  deckTop: {
    borderColor: C.brass,
    backgroundColor: '#0B4D3A',
  },
  deckEmpty: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 36,
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(244,236,216,0.16)',
  },
  deckCount: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 11,
    color: 'rgba(244,236,216,0.6)',
  },

  // Indicateur "le bot réfléchit / joue" — discret, sous la table
  botThinking: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 12,
    color: C.boneOff,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 10,
  },

  // Status bar (tour bot)
  statusBar: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  statusTxt: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 12,
    color: C.boneOff,
    fontStyle: 'italic',
  },

  // Player hand — wrap sur 2e rangée si besoin
  playerHand: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 10,
    rowGap: 8,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },

  // Action bar
  actionBar: {
    backgroundColor: C.deep,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(201,162,39,0.1)',
    marginTop: 12,
  },
  abLeft: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  abRight: {
    marginLeft: 'auto',
    alignItems: 'flex-end',
  },
  abPiocheLabel: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: C.boneOff,
  },
  abPiocheNum: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 13,
    color: 'rgba(244,236,216,0.55)',
  },

  // Overlay d'événement plein écran
  overlayRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
    zIndex: 50,
  },
  overlayCard: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 36,
    gap: 0,
  },
  overlayEvent: {
    alignItems: 'center',
    gap: 8,
  },
  overlayEventGap: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(201,162,39,0.25)',
  },
  overlayAr: {
    fontFamily: 'ReemKufi_700Bold',
    fontSize: 68,
    color: C.brass,
    lineHeight: 78,
    textAlign: 'center',
  },
  overlayLa: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 13,
    color: C.bone,
    letterSpacing: 3.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  overlayLaAlone: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 52,
    letterSpacing: 2,
    color: C.brass,
  },
  overlayPts: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 30,
    color: C.bone,
    marginTop: 8,
  },

  // Bouton Ronda / Tringa
  btnRonda: {
    backgroundColor: C.brass,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    shadowColor: C.brass,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
    elevation: 6,
  },
  btnRondaAr: {
    fontFamily: 'ReemKufi_700Bold',
    fontSize: 16,
    color: C.ink,
    lineHeight: 20,
  },
  btnRondaLa: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 9,
    color: 'rgba(28,38,34,0.6)',
    letterSpacing: 0.8,
    lineHeight: 12,
  },

  // Bouton Contre (clay)
  btnContre: {
    backgroundColor: C.clay,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  btnContreTxt: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 14,
    color: C.bone,
    letterSpacing: 0.5,
    lineHeight: 18,
  },
  btnContreSub: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 9,
    color: 'rgba(244,236,216,0.7)',
    lineHeight: 12,
  },

  // Bannière Mab9ach en jeu
  mabBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(201,162,39,0.13)',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: C.brass,
  },
  mabBannerAr: {
    fontFamily: 'ReemKufi_700Bold',
    fontSize: 15,
    color: C.brass,
  },
  mabBannerLa: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 11,
    color: C.boneOff,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // Overlay annonce "Donne N"
  dealAnnounceRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9,64,47,0.91)',
    zIndex: 60,
  },
  dealAnnounceLabel: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 11,
    color: C.boneOff,
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  dealAnnounceNum: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 96,
    color: C.brass,
    lineHeight: 100,
  },
  dealAnnounceStarter: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 13,
    color: C.boneOff,
    letterSpacing: 1,
    marginTop: 8,
  },

  // Écran résultat de donne
  dealEndLabel: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 11,
    color: C.boneOff,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  dealEndAr: {
    fontFamily: 'ReemKufi_700Bold',
    fontSize: 64,
    color: C.brass,
    lineHeight: 72,
    textAlign: 'center',
  },
  dealEndLa: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 12,
    color: C.boneOff,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 32,
  },
  dealEndRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  dealEndCell: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 12,
    gap: 6,
  },
  dealEndPlayerName: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 10,
    color: C.boneOff,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  dealEndDelta: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 48,
    lineHeight: 54,
  },
  dealEndTotal: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 13,
    color: C.boneOff,
  },

  // Game over
  gameOverTitle: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 40,
    color: C.bone,
  },
  gameOverScore: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 18,
    color: C.boneOff,
  },
  gameOverReward: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 20,
    color: C.brass,
  },
  btnPrimary: {
    backgroundColor: C.brass,
    borderRadius: 10,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  btnPrimaryTxt: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 15,
    color: C.ink,
    letterSpacing: 0.5,
  },
  btnGhost: {
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: C.brass,
  },
  btnGhostTxt: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 14,
    color: C.brass,
    letterSpacing: 0.3,
  },
})

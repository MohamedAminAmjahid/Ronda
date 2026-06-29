import { useState, useMemo } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useI18n } from '../i18n/useI18n'
import { useDiJoujGame, DJ_HUMAN_ID } from '../game/useDiJoujGame'
import { isPlayable } from '../engine-dijouj/game'
import type { Card, Suit } from '../engine-dijouj/types'
import { CardFace, CardBack } from './components/Card'

// ── Constants ─────────────────────────────────────────────────────────────────

const SUITS: Suit[] = ['oros', 'copas', 'espadas', 'bastos']

const SUIT_COLOR: Record<Suit, string> = {
  oros:    '#C9A227',
  copas:   '#C0392B',
  espadas: '#2980B9',
  bastos:  '#27AE60',
}

const C = {
  bg:      '#2D0A1E',
  surface: '#3D1030',
  acc:     '#8B1A4A',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.55)',
  ghost:   'rgba(244,236,216,0.15)',
  red:     '#C0392B',
  amber:   '#8B5E2A',
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function cardKey(c: Card) { return `${c.suit}_${c.value}` }

// ── Screen ────────────────────────────────────────────────────────────────────

export function DiJoujScreen() {
  const { t } = useI18n()
  const { state, isHumanTurn, isBotThinking, playCard, draw, isGameOver, winner, restart } =
    useDiJoujGame()

  // Card pending color-picker (7 de Oros)
  const [pendingWild, setPendingWild] = useState<Card | null>(null)

  const human   = state.players[DJ_HUMAN_ID]
  const bot     = state.players.find(p => p.id !== DJ_HUMAN_ID)!
  const topCard = state.discardPile[state.discardPile.length - 1]

  // Which human cards are currently playable
  const playableSet = useMemo<Set<string>>(() => {
    if (!isHumanTurn) return new Set()
    return new Set(
      human.hand
        .filter(c => isPlayable(c, topCard, state.chosenSuit, state.pendingEffect))
        .map(cardKey),
    )
  }, [isHumanTurn, human.hand, topCard, state.chosenSuit, state.pendingEffect])

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleCardPress(card: Card) {
    if (!isHumanTurn) return
    if (!playableSet.has(cardKey(card))) return
    if (card.value === 7 && card.suit === 'oros') {
      setPendingWild(card)  // show color picker first
    } else {
      playCard(card)
    }
  }

  function handleSuitChoice(suit: Suit) {
    if (!pendingWild) return
    playCard(pendingWild, suit)
    setPendingWild(null)
  }

  // ── Derived display values ───────────────────────────────────────────────────

  let statusText: string
  if (isBotThinking) statusText = t('botThinks').replace('{name}', 'Bot')
  else if (isHumanTurn) statusText = t('yourTurn')
  else statusText = t('botTurn')

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
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={s.backBtn}>
          <Text style={s.backTxt}>{t('back')}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>DI JOUJ</Text>
        <View style={s.headerSpacer} />
      </View>

      {/* Bot hand (face-down) */}
      <View style={s.botZone}>
        <Text style={s.botLabel}>Bot — {bot.hand.length}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.botHand}
        >
          {bot.hand.slice(0, 10).map((_, i) => (
            <View
              key={i}
              style={[s.botCard, { marginLeft: i > 0 ? -20 : 0 }]}
            >
              <CardBack size="sm" />
            </View>
          ))}
          {bot.hand.length > 10 && (
            <View style={s.extraBadge}>
              <Text style={s.extraBadgeTxt}>+{bot.hand.length - 10}</Text>
            </View>
          )}
        </ScrollView>
      </View>

      {/* Pending effect banner */}
      {bannerText !== null && (
        <View style={[s.banner, { backgroundColor: bannerBg }]}>
          <Text style={s.bannerTxt}>{bannerText}</Text>
        </View>
      )}

      {/* Table: draw pile + discard */}
      <View style={s.table}>

        {/* Draw pile */}
        <TouchableOpacity
          activeOpacity={isHumanTurn ? 0.7 : 1}
          onPress={() => isHumanTurn && draw()}
          style={[s.pileTap, !isHumanTurn && s.pileDisabled]}
        >
          {state.drawPile.length > 0
            ? <CardBack size="md" />
            : <View style={s.emptyPile}><Text style={s.emptyPileTxt}>∅</Text></View>
          }
          <Text style={s.pileCount}>{state.drawPile.length}</Text>
        </TouchableOpacity>

        {/* Discard + chosen-suit badge */}
        <View style={s.discardZone}>
          {topCard && (
            <CardFace card={topCard} size="md" />
          )}
          {state.chosenSuit && (
            <View style={[s.suitBadge, { backgroundColor: SUIT_COLOR[state.chosenSuit] }]}>
              <Text style={s.suitBadgeTxt}>{state.chosenSuit}</Text>
            </View>
          )}
        </View>

      </View>

      {/* Status bar */}
      <View style={s.statusBar}>
        <Text style={s.statusTxt}>{statusText}</Text>
      </View>

      {/* Human hand */}
      <View style={s.humanZone}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.handScroll}
        >
          {human.hand.map((card, i) => {
            const playable = playableSet.has(cardKey(card))
            return (
              <View key={i} style={[s.humanCard, { marginLeft: i > 0 ? -12 : 0 }]}>
                <CardFace
                  card={card}
                  size="md"
                  highlighted={playable}
                  disabled={!playable || !isHumanTurn}
                  onPress={() => handleCardPress(card)}
                />
              </View>
            )
          })}
        </ScrollView>
      </View>

      {/* Color picker modal (7 de Oros) */}
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
                  <View style={[s.suitDot, { backgroundColor: SUIT_COLOR[suit] }]} />
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

      {/* Game over overlay */}
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
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn:      { paddingRight: 8 },
  backTxt:      { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  headerTitle:  {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Cairo_600SemiBold',
    color: C.bone,
    fontSize: 18,
    letterSpacing: 4,
  },
  headerSpacer: { width: 60 },

  // Bot zone
  botZone: { alignItems: 'center', paddingVertical: 8, minHeight: 80 },
  botLabel: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 12, marginBottom: 4 },
  botHand:  { alignItems: 'center', paddingHorizontal: 16 },
  botCard:  { zIndex: 1 },
  extraBadge: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 6,
  },
  extraBadgeTxt: { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 12 },

  // Banner
  banner: {
    marginHorizontal: 24,
    marginVertical: 6,
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  bannerTxt: {
    fontFamily: 'Cairo_600SemiBold',
    color: C.bone,
    fontSize: 14,
    letterSpacing: 0.5,
  },

  // Table
  table: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    paddingVertical: 12,
  },
  pileTap: { alignItems: 'center', gap: 4 },
  pileDisabled: { opacity: 0.5 },
  pileCount: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 11 },
  emptyPile: {
    width: 58, height: 87,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.ghost,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyPileTxt: { color: C.boneOff, fontSize: 20 },

  discardZone: { alignItems: 'center', gap: 6 },
  suitBadge: {
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 12,
  },
  suitBadgeTxt: {
    fontFamily: 'Cairo_600SemiBold',
    color: '#fff',
    fontSize: 11,
    textTransform: 'capitalize',
  },

  // Status
  statusBar: { alignItems: 'center', paddingVertical: 6 },
  statusTxt: {
    fontFamily: 'Cairo_400Regular',
    color: C.boneOff,
    fontSize: 13,
    letterSpacing: 0.4,
  },

  // Human hand
  humanZone: { paddingBottom: 12 },
  handScroll: { paddingHorizontal: 16, alignItems: 'flex-end' },
  humanCard:  { zIndex: 1 },

  // Color picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBox: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 24,
    width: 280,
    alignItems: 'center',
    gap: 16,
  },
  modalTitle: {
    fontFamily: 'Cairo_600SemiBold',
    color: C.bone,
    fontSize: 16,
    letterSpacing: 0.5,
  },
  suitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  suitBtn: {
    width: 112,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 2,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  suitDot:   { width: 14, height: 14, borderRadius: 7 },
  suitLabel: {
    fontFamily: 'Cairo_400Regular',
    color: C.bone,
    fontSize: 13,
    textTransform: 'capitalize',
  },
  cancelBtn: { marginTop: 4 },
  cancelTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },

  // Game over overlay
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayBox: {
    backgroundColor: C.surface,
    borderRadius: 20,
    paddingVertical: 36,
    paddingHorizontal: 40,
    alignItems: 'center',
    gap: 12,
    minWidth: 240,
  },
  overlayEmoji: { fontSize: 52 },
  overlayTitle: {
    fontFamily: 'Cairo_600SemiBold',
    color: C.bone,
    fontSize: 22,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  restartBtn: {
    marginTop: 8,
    backgroundColor: C.acc,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  restartTxt: {
    fontFamily: 'Cairo_600SemiBold',
    color: C.bone,
    fontSize: 15,
    letterSpacing: 0.4,
  },
  backFromOverlay: { marginTop: 4 },
  backFromOverlayTxt: {
    fontFamily: 'Cairo_400Regular',
    color: C.boneOff,
    fontSize: 13,
  },
})

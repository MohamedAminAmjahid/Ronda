import { useEffect, useRef, useState } from 'react'
import { Animated, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRondaGame, HUMAN_ID, BOT_ID } from '../game'
import { CardFace, CardBack } from './components/Card'
import { RitualPickerScreen } from './RitualPickerScreen'
import { CoinFlipScreen } from './CoinFlipScreen'
import { CardDrawScreen } from './CardDrawScreen'
import { RpsScreen } from './RpsScreen'
import { TERMS } from './terms'
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

// ── Écran fin de partie ───────────────────────────────────────────────────────

function GameOver({ scores, onReplay }: { scores: [number, number]; onReplay: () => void }) {
  const won = scores[HUMAN_ID] >= 41
  return (
    <SafeAreaView style={[styles.root, { justifyContent: 'center' }]}>
      <View style={[styles.column, { alignItems: 'center', justifyContent: 'center', gap: 24 }]}>
        <Text style={styles.gameOverTitle}>{won ? 'Bravo !' : 'Perdu.'}</Text>
        <Text style={styles.gameOverScore}>
          Toi {scores[HUMAN_ID]} — Bot {scores[BOT_ID]}
        </Text>
        <TouchableOpacity style={styles.btnPrimary} onPress={onReplay}>
          <Text style={styles.btnPrimaryTxt}>Rejouer</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

// ── Mapping événement → libellé ──────────────────────────────────────────────

const EVENT_LABEL: Record<GameEvent, { ar: string; la: string }> = {
  caida:  TERMS.araWahd,
  missa:  TERMS.missa,
  ronda:  TERMS.ronda,
  tringa: TERMS.tringa,
  contre: { ar: '', la: 'Contre' },   // pas de terme arabe pour le contre
}

// ── Overlay d'événement plein écran ──────────────────────────────────────────

function EventOverlay({ events }: { events: readonly GameEvent[] }) {
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
            </View>
          )
        })}
      </Animated.View>
    </Animated.View>
  )
}

// ── Écran de jeu ─────────────────────────────────────────────────────────────

interface GameScreenProps {
  onBack: () => void   // retour au menu
}

export function GameScreen({ onBack }: GameScreenProps) {
  const { appPhase, view, startGame, playCard, declare, newGame } = useRondaGame()

  // ── Tous les hooks AVANT tout return conditionnel ─────────────────────────
  const [selectedRitual, setSelectedRitual] = useState<RitualType | null>(null)
  const [toastEvents, setToastEvents] = useState<readonly GameEvent[] | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { lastEvent } = view

  useEffect(() => {
    if (!lastEvent) return
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToastEvents(lastEvent.events)
    toastTimer.current = setTimeout(() => setToastEvents(null), 1500)
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [lastEvent?.id])

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
  const { state, isHumanTurn, canDeclare, isGameOver } = view
  const human = state.players[HUMAN_ID]
  const bot   = state.players[BOT_ID]

  if (isGameOver) {
    return (
      <GameOver
        scores={[human.score, bot.score]}
        onReplay={() => { setSelectedRitual(null); newGame() }}
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

  const handleCardPress = (card: Card) => {
    if (isHumanTurn) playCard(card)
  }

  const handleDeclare = () => {
    if (human.pendingCombo) declare(human.pendingCombo)
  }

  const comboTerm =
    human.pendingCombo?.type === 'tringa' ? TERMS.tringa : TERMS.ronda

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Colonne centrée — max 430 px sur grand écran */}
      <View style={styles.column}>

      {/* ── 1. Barre de score ──────────────────────────────── */}
      <View style={styles.scorebar}>
        <View>
          <Text style={styles.sbName}>Toi</Text>
          <Text style={styles.sbScore}>{human.score}</Text>
        </View>
        <View style={styles.sbMid}>
          <Text style={styles.sbDash}>—</Text>
          <Text style={styles.sbTarget}>→ 41</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.sbName}>Bot</Text>
          <Text style={styles.sbScore}>{bot.score}</Text>
        </View>
      </View>

      {/* ── 2. Main adverse (dos) ──────────────────────────── */}
      <View style={styles.botHand}>
        {bot.hand.map((_, i) => (
          <CardBack key={i} size="sm" />
        ))}
      </View>

      {/* ── 3. Zone de table ───────────────────────────────── */}
      <View style={styles.tableZone}>
        {state.table.length === 0 ? (
          <Text style={styles.tableEmpty}>Table vide</Text>
        ) : (
          <View style={styles.tableCards}>
            {state.table.map((card, i) => (
              <CardFace
                key={`${card.value}-${card.suit}-${i}`}
                card={card}
                size="md"
                highlighted={
                  lastOnTable !== null &&
                  card.value === lastOnTable.value &&
                  card.suit  === lastOnTable.suit
                }
              />
            ))}
          </View>
        )}
        <Text style={styles.deckLabel}>
          Pioche : <Text style={styles.deckNum}>{state.deck.length}</Text>
        </Text>
      </View>

      {/* ── Spacer ─────────────────────────────────────────── */}
      <View style={{ flex: 1 }} />

      {/* ── 4. Tour / statut ───────────────────────────────── */}
      {!isHumanTurn && (
        <View style={styles.statusBar}>
          <Text style={styles.statusTxt}>Tour du bot…</Text>
        </View>
      )}

      {/* ── 5. Main du joueur ──────────────────────────────── */}
      <View style={styles.playerHand}>
        {human.hand.map((card) => (
          <CardFace
            key={`${card.value}-${card.suit}`}
            card={card}
            size="lg"
            onPress={() => handleCardPress(card)}
            disabled={!isHumanTurn}
          />
        ))}
      </View>

      {/* ── Overlay d'événement (par-dessus le jeu, ne bloque pas les taps) */}
      {toastEvents && (
        <EventOverlay key={lastEvent?.id ?? 0} events={toastEvents} />
      )}

      {/* ── 6. Barre d'actions ─────────────────────────────── */}
      <View style={styles.actionBar}>
        <View style={styles.abLeft}>
          {canDeclare && (
            <TouchableOpacity style={styles.btnRonda} onPress={handleDeclare}>
              <Text style={styles.btnRondaAr}>{comboTerm.ar}</Text>
              <Text style={styles.btnRondaLa}>{comboTerm.la}</Text>
            </TouchableOpacity>
          )}
          {/* Contre : étape 3 */}
        </View>

        <View style={styles.abRight}>
          <Text style={styles.abPiocheLabel}>Pioche</Text>
          <Text style={styles.abPiocheNum}>{state.deck.length}</Text>
        </View>
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
    backgroundColor: C.deep,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(201,162,39,0.1)',
  },
  sbName: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 9,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: C.boneOff,
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

  // Bouton Ronda / Tringa
  btnRonda: {
    backgroundColor: C.brass,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
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
})

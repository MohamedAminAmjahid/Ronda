import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Svg, Polygon } from 'react-native-svg'
import { useRonda2v2Game, HUMAN_ID_2V2 } from '../game/useRonda2v2Game'
import { teamOf, prevPlayer, type PlayerId2v2 } from '../engine2v2/types2v2'
import { CardFace, CardBack } from './components/Card'
import { GoldBadge } from './components/GoldBadge'
import { recordResult } from '../profile/profile'
import {
  DealFly,
  FlyingCard,
  EventOverlay,
  BotThinking,
  DealEndScreen,
  GameOverScreen,
  FLY_STAGGER,
  FLY_DURATION,
} from './GameScreen'
import { RitualPickerScreen } from './RitualPickerScreen'
import { CoinFlipScreen } from './CoinFlipScreen'
import { CardDrawScreen } from './CardDrawScreen'
import { RpsScreen } from './RpsScreen'
import { TERMS } from './terms'
import { initSounds, playSound, setMuted, isMuted } from './sounds'
import { ESCALIER_SEQUENCE } from '../engine/capture'
import type { Card, GameEvent, PlayerId } from '../engine/types'
import type { RitualType } from './RitualPickerScreen'

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  clay:    '#B5532A',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.35)',
  teamB:   'rgba(244,236,216,0.3)',
} as const

const DEAL_STAGGER = 130

/**
 * Trie les cartes de la table selon l'ordre de l'escalier
 * (1-2-3-4-5-6-7-10-11-12) — affichage seulement, le moteur reste inchangé.
 */
function sortTableCards(cards: readonly Card[]): Card[] {
  return [...cards].sort(
    (a, b) => ESCALIER_SEQUENCE.indexOf(a.value) - ESCALIER_SEQUENCE.indexOf(b.value),
  )
}

// ── Étoile khatam (marqueur équipe A) ─────────────────────────────────────────

function KhatamMini({ size = 16, color = C.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Polygon
        points="14,4 15.7,9.8 21.1,6.9 18.2,12.3 24,14 18.2,15.7 21.1,21.1 15.7,18.2 14,24 12.3,18.2 6.9,21.1 9.8,15.7 4,14 9.8,12.3 6.9,6.9 12.3,9.8"
        fill={color}
      />
    </Svg>
  )
}

// ── En-tête de siège : label + jeton de donneur ──────────────────────────────

function SeatLabel({ label, isDealer }: { label: string; isDealer: boolean }) {
  return (
    <View style={styles.seatHead}>
      <Text style={styles.seatLabel}>{label}</Text>
      {isDealer && (
        <View style={styles.dealerToken}>
          <Text style={styles.dealerTokenTxt}>D</Text>
        </View>
      )}
    </View>
  )
}

// ── Pile d'équipe ──────────────────────────────────────────────────────────────

function TeamPile({ team, count }: { team: 0 | 1; count: number }) {
  const color = team === 0 ? C.brass : C.teamB
  const layers = Math.min(4, count)
  return (
    <View style={styles.pileCol}>
      <View style={styles.pileBox}>
        {count === 0 ? (
          <View style={styles.pileEmpty} />
        ) : (
          Array.from({ length: layers }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.pileCard,
                { backgroundColor: color, left: (layers - 1 - i) * 2.5, bottom: (layers - 1 - i) * 2.5 },
              ]}
            >
              {i === layers - 1 && team === 0 ? (
                <View style={styles.pileStar}><KhatamMini /></View>
              ) : null}
            </View>
          ))
        )}
      </View>
      <Text style={styles.pileNum}>{count}</Text>
    </View>
  )
}

// ── Main d'un bot (dos de cartes) ──────────────────────────────────────────────

function BotHand({
  count,
  dealGen,
  pid,
  side,
}: {
  count: number
  dealGen: number
  pid: PlayerId2v2
  side: 'top' | 'left' | 'right'
}) {
  // Offset de départ depuis le centre (pioche) vers la position finale du siège.
  const startX = side === 'left' ? 120 : side === 'right' ? -120 : 0
  const startY = side === 'top' ? 150 : 0
  return (
    <View style={[styles.botHand, side !== 'top' && styles.botHandV]}>
      {Array.from({ length: count }).map((_, i) => (
        <DealFly
          key={`b${pid}-${dealGen}-${i}`}
          startX={startX}
          startY={startY}
          delay={i * DEAL_STAGGER}
        >
          <CardBack size="sm" />
        </DealFly>
      ))}
    </View>
  )
}

// ── Écran de jeu 2v2 ──────────────────────────────────────────────────────────

interface Props {
  onBack: () => void
  /** Source de l'état. Par défaut le hook solo ; l'online injecte useOnlineGame2v2. */
  useGame2v2?: typeof useRonda2v2Game
  /** true = partie en ligne → quitter demande confirmation (l'équipe adverse gagne). */
  online?: boolean
}

export function GameScreen2v2({ onBack, useGame2v2 = useRonda2v2Game, online = false }: Props) {
  const { appPhase, view, setCaptureAnimating, startGame, nextDeal, playCard, declare, contest, newGame } =
    useGame2v2()

  const [showContest, setShowContest] = useState(false)
  const [confirmQuit, setConfirmQuit] = useState(false)

  const handleQuit = () => setConfirmQuit(true)

  // Récompense de fin de partie : enregistrée une seule fois (équipe du joueur = A).
  const [winReward, setWinReward] = useState(0)
  const resultRecorded = useRef(false)
  useEffect(() => {
    if (view.isGameOver) {
      if (!resultRecorded.current) {
        resultRecorded.current = true
        setWinReward(recordResult(view.teamScores[0] >= 41, 'ronda', { mode: '2v2' }))
      }
    } else {
      resultRecorded.current = false
      setWinReward(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.isGameOver])

  const [selectedRitual, setSelectedRitual] = useState<RitualType | null>(null)
  const [toastEvents, setToastEvents] = useState<readonly GameEvent[] | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [dealGen, setDealGen] = useState(0)
  const prevHandLen = useRef(-1)

  const [muted, setMutedState] = useState(isMuted())
  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    setMutedState(next)
  }

  // Préchargement des sons (une fois).
  useEffect(() => { void initSounds() }, [])

  // Délai avant l'écran de résultat (voir la dernière carte / capture).
  const [showDealEnd, setShowDealEnd] = useState(false)
  useEffect(() => {
    if (!view.isDealEnd) { setShowDealEnd(false); return }
    const t = setTimeout(() => setShowDealEnd(true), 1500)
    return () => clearTimeout(t)
  }, [view.isDealEnd])

  // Son Mab9ach à l'entrée de la dernière redistribution.
  const prevMabqach = useRef(false)
  useEffect(() => {
    const m = view.state.isMabqach
    if (m && !prevMabqach.current) void playSound('mabqach')
    prevMabqach.current = m
  }, [view.state.isMabqach])

  const { lastEvent } = view
  const currHandLen = view.state.players[HUMAN_ID_2V2]?.hand?.length ?? 0
  useEffect(() => {
    const prev = prevHandLen.current
    if (prev < 3 && currHandLen === 3) setDealGen(g => g + 1)
    prevHandLen.current = currHandLen
  }, [currHandLen])

  // Toast + sons d'annonce.
  useEffect(() => {
    if (!lastEvent) return
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToastEvents(lastEvent.events)
    toastTimer.current = setTimeout(() => setToastEvents(null), 1500)
    if (lastEvent.events.includes('caida') || lastEvent.events.includes('ara_khamssa') || lastEvent.events.includes('ara_3achra')) {
      void playSound('caida')
    } else if (lastEvent.events.includes('ronda') || lastEvent.events.includes('tringa')) {
      void playSound('announce')
    }
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current) }
  }, [lastEvent?.id])

  // ── Détection de capture → aspiration + gel + sons par carte ───────────────
  const [flying, setFlying] = useState<{ cards: Card[]; by: PlayerId2v2; id: number } | null>(null)
  const prevTableRef = useRef<Card[]>([])
  const prevRoundRef = useRef(-1)
  const prevDealRef  = useRef(-1)
  const flyId        = useRef(0)
  const flyTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sndTimers    = useRef<ReturnType<typeof setTimeout>[]>([])

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

    if (sameDeal && sameRound) {
      if (removed.length > 0 && gs.lastCapture !== null) {
        flyId.current += 1
        setFlying({ cards: removed, by: gs.lastCapture.playerId, id: flyId.current })
        setCaptureAnimating(true)
        if (flyTimer.current) clearTimeout(flyTimer.current)
        const total = (removed.length - 1) * FLY_STAGGER + FLY_DURATION + 60
        flyTimer.current = setTimeout(() => {
          setFlying(null)
          setCaptureAnimating(false)
        }, total)
        sndTimers.current.forEach(clearTimeout)
        sndTimers.current = removed.map((_, i) =>
          setTimeout(() => { void playSound('card_capture') }, i * FLY_STAGGER),
        )
      } else if (added.length > 0) {
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

  // ── Sélection du rituel (avant la partie) ─────────────────────────────────
  if (appPhase === 'RITUAL_PICKER') {
    const onStart = (d: PlayerId) => startGame(d as PlayerId2v2)
    if (!selectedRitual) return <RitualPickerScreen onSelect={setSelectedRitual} onBack={onBack} />
    if (selectedRitual === 'coin_flip') return <CoinFlipScreen onStart={onStart} onBack={() => setSelectedRitual(null)} />
    if (selectedRitual === 'card_draw') return <CardDrawScreen onStart={onStart} onBack={() => setSelectedRitual(null)} />
    return <RpsScreen onStart={onStart} onBack={() => setSelectedRitual(null)} />
  }

  const { state, isHumanTurn, canDeclare, contestTargets, isGameOver, isDealEnd, isBotThinking, teamScores, teamCapturedCount } = view
  const human = state.players[HUMAN_ID_2V2]

  // Fin de partie.
  if (isGameOver) {
    return (
      <GameOverScreen
        won={teamScores[0] >= 41}
        scoreText={`Vous ${teamScores[0]} — Adversaires ${teamScores[1]}`}
        onReplay={() => { setSelectedRitual(null); newGame() }}
        goldReward={winReward}
      />
    )
  }

  // Résultat de donne (après le délai).
  if (isDealEnd && showDealEnd) {
    return (
      <DealEndScreen
        dealNumber={state.dealNumber + 1}
        scores={[teamScores[0], teamScores[1]]}
        labels={['Vous', 'Adversaires']}
        onContinue={nextDeal}
      />
    )
  }

  // Dernière carte posée encore présente sur la table (repère + animation pose).
  const lastPlayerId = prevPlayer(state.currentPlayer)
  const lastPlayedCard = state.lastPlayed[lastPlayerId]
  const lastOnTable = lastPlayedCard
    ? state.table.find(c => c.value === lastPlayedCard.value && c.suit === lastPlayedCard.suit) ?? null
    : null

  const handleCardPress = (card: Card) => { if (isHumanTurn && !flying) playCard(card) }
  const handleDeclare = () => { if (human.pendingCombo) declare(human.pendingCombo) }
  const comboTerm = human.pendingCombo?.type === 'tringa' ? TERMS.tringa : TERMS.ronda

  // FlyingCard n'anime que verticalement : capteur en bas (joueur 0) → +1, en haut (joueur 1) → -1.
  const flyDir = flying ? (flying.by === 0 ? 1 : flying.by === 1 ? -1 : 0) : 0

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.column}>

        {/* ── Barre de score équipe ────────────────────────── */}
        <View style={styles.scorebar}>
          <TouchableOpacity style={styles.quitBtn} onPress={handleQuit} accessibilityLabel="Quitter la partie">
            <Text style={styles.quitTxt}>✕</Text>
          </TouchableOpacity>
          <View style={styles.scorebarInner}>
            <View>
              <Text style={styles.sbName}>Vous</Text>
              <Text style={styles.sbScore}>{teamScores[0]}</Text>
            </View>
            <View style={styles.sbMid}>
              <Text style={styles.sbDash}>—</Text>
              <Text style={styles.sbTarget}>→ 41</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.sbName}>Adversaires</Text>
              <Text style={styles.sbScore}>{teamScores[1]}</Text>
            </View>
          </View>
          <GoldBadge style={{ marginLeft: 12 }} />
          <TouchableOpacity style={styles.muteBtn} onPress={toggleMute}>
            <Text style={styles.muteIcon}>{muted ? '🔇' : '🔊'}</Text>
          </TouchableOpacity>
        </View>

        {/* Confirmation de départ (mode en ligne uniquement) */}
        <Modal visible={confirmQuit} transparent animationType="fade" onRequestClose={() => setConfirmQuit(false)}>
          <View style={styles.quitBackdrop}>
            <View style={styles.quitCard}>
              <Text style={styles.quitCardTitle}>Quitter la partie ?</Text>
              <Text style={styles.quitCardText}>
                {online
                  ? "Si tu quittes, l'équipe adverse gagne automatiquement. Continuer ?"
                  : 'Veux-tu vraiment quitter la partie en cours ?'}
              </Text>
              <View style={styles.quitActions}>
                <TouchableOpacity style={styles.quitStay} onPress={() => setConfirmQuit(false)}>
                  <Text style={styles.quitStayTxt}>Rester</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quitLeave} onPress={() => { setConfirmQuit(false); onBack() }}>
                  <Text style={styles.quitLeaveTxt}>Quitter</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── Coéquipier (haut, joueur 2) ──────────────────── */}
        <View style={styles.topZone}>
          <SeatLabel label="Coéquipier" isDealer={state.dealer === 2} />
          <BotHand count={state.players[2].hand.length} dealGen={dealGen} pid={2} side="top" />
        </View>

        {/* ── Rangée centrale : adversaire 1 | table | adversaire 2 ── */}
        <View style={styles.midZone}>
          <View style={styles.sideZone}>
            <SeatLabel label="Adversaire 1" isDealer={state.dealer === 1} />
            <BotHand count={state.players[1].hand.length} dealGen={dealGen} pid={1} side="left" />
          </View>

          <View style={styles.centerZone}>
            {state.isMabqach && (
              <View style={styles.mabBanner}>
                <Text style={styles.mabBannerAr}>{TERMS.mab9ach.ar}</Text>
                <Text style={styles.mabBannerLa}>{TERMS.mab9ach.la}</Text>
              </View>
            )}

            <View style={styles.tableZone}>
              {state.table.length === 0 && !flying ? (
                <Text style={styles.tableEmpty}>Table vide</Text>
              ) : (
                <View style={styles.tableCards}>
                  {sortTableCards(state.table).map((card) => {
                    const k = `${card.value}-${card.suit}`
                    const isLast =
                      lastOnTable !== null && card.value === lastOnTable.value && card.suit === lastOnTable.suit
                    const di = dealtTableRef.current.indexOf(k)
                    const face = <CardFace card={card} size="md" highlighted={isLast} />
                    if (di !== -1) {
                      const center = (dealtTableRef.current.length - 1) / 2
                      return (
                        <DealFly key={`deal-${state.dealNumber}-${k}`} startX={(center - di) * 30} startY={40} delay={di * DEAL_STAGGER}>
                          {face}
                        </DealFly>
                      )
                    }
                    return <View key={`t-${k}`}>{face}</View>
                  })}
                  {flying?.cards.map((card, i) => (
                    <FlyingCard key={`fly-${flying.id}-${card.value}-${card.suit}`} card={card} dir={flyDir} delay={i * FLY_STAGGER} />
                  ))}
                </View>
              )}
            </View>

            {/* Piles d'équipe : A (laiton) à gauche, B (grise) à droite */}
            <View style={styles.pilesRow}>
              <TeamPile team={0} count={teamCapturedCount[0]} />
              <Text style={styles.deckLabel}>Pioche {state.deck.length}</Text>
              <TeamPile team={1} count={teamCapturedCount[1]} />
            </View>
          </View>

          <View style={styles.sideZone}>
            <SeatLabel label="Adversaire 2" isDealer={state.dealer === 3} />
            <BotHand count={state.players[3].hand.length} dealGen={dealGen} pid={3} side="right" />
          </View>
        </View>

        {/* Indicateur bot */}
        {isBotThinking && <BotThinking />}

        {/* ── Ta main (bas, joueur 0) ──────────────────────── */}
        <View style={styles.bottomZone}>
          <SeatLabel label="Toi" isDealer={state.dealer === 0} />
          <View style={styles.playerHand}>
            {human.hand.map((card, i) => {
              const center = (human.hand.length - 1) / 2
              return (
                <DealFly key={`h-${dealGen}-${card.value}-${card.suit}`} startX={(center - i) * 38} startY={-200} delay={i * DEAL_STAGGER}>
                  <CardFace card={card} size="lg" onPress={() => handleCardPress(card)} disabled={!isHumanTurn || !!flying} />
                </DealFly>
              )
            })}
          </View>
        </View>

        {/* Overlay d'événement */}
        {toastEvents && <EventOverlay key={lastEvent?.id ?? 0} events={toastEvents} />}

        {/* Chooser de contre : une valeur par adversaire ayant révélé une paire */}
        {showContest && contestTargets.length > 0 && (
          <View style={styles.contestChooser}>
            <Text style={styles.contestTitle}>Contester quelle valeur ?</Text>
            <View style={styles.contestRow}>
              {contestTargets.map((t) => (
                <TouchableOpacity
                  key={`${t.player}-${t.value}`}
                  style={styles.contestChoice}
                  onPress={() => { setShowContest(false); contest(t.player, t.value) }}
                >
                  <Text style={styles.contestChoiceVal}>{t.value}</Text>
                  <Text style={styles.contestChoiceWho}>Adv. {t.player === 1 ? 1 : 2}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.contestCancel} onPress={() => setShowContest(false)}>
                <Text style={styles.contestCancelTxt}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Barre d'actions */}
        <View style={styles.actionBar}>
          {canDeclare && !flying && (
            <TouchableOpacity style={styles.btnRonda} onPress={handleDeclare}>
              <Text style={styles.btnRondaAr}>{comboTerm.ar}</Text>
              <Text style={styles.btnRondaLa}>{comboTerm.la}</Text>
            </TouchableOpacity>
          )}
          {contestTargets.length > 0 && !flying && (
            <TouchableOpacity style={styles.btnContre} onPress={() => setShowContest(s => !s)}>
              <Text style={styles.btnContreTxt}>Contre</Text>
            </TouchableOpacity>
          )}
        </View>

      </View>
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.table, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 520 },

  scorebar: {
    backgroundColor: C.deep,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(201,162,39,0.1)',
  },
  scorebarInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sbName: { fontFamily: 'Cairo_400Regular', fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase', color: C.boneOff },
  sbScore: { fontFamily: 'Cairo_600SemiBold', fontSize: 28, color: C.bone, lineHeight: 32 },
  sbMid: { alignItems: 'center', gap: 3 },
  sbDash: { fontSize: 18, color: 'rgba(244,236,216,0.12)' },
  sbTarget: { fontFamily: 'Cairo_600SemiBold', fontSize: 11, color: C.brass, letterSpacing: 0.5 },
  muteBtn: { marginLeft: 14, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)' },
  quitBtn: { marginRight: 12, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)' },
  quitTxt: { fontSize: 15, color: 'rgba(244,236,216,0.7)', fontWeight: '600' },
  quitBackdrop: { flex: 1, backgroundColor: 'rgba(9,64,47,0.85)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  quitCard: { width: '100%', maxWidth: 360, backgroundColor: C.deep, borderRadius: 16, padding: 22, gap: 12, borderWidth: 1, borderColor: 'rgba(201,162,39,0.3)' },
  quitCardTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 18, color: C.bone },
  quitCardText: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff, lineHeight: 21 },
  quitActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 4 },
  quitStay: { paddingVertical: 12, paddingHorizontal: 18 },
  quitStayTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.brass },
  quitLeave: { backgroundColor: 'rgba(231,76,60,0.15)', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 22, borderWidth: 1.5, borderColor: '#E74C3C' },
  quitLeaveTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: '#E74C3C' },
  muteIcon: { fontSize: 16 },

  topZone: { alignItems: 'center', paddingTop: 12, gap: 6 },
  midZone: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, marginTop: 8 },
  sideZone: { width: 70, alignItems: 'center', gap: 6 },
  centerZone: { flex: 1, alignItems: 'center' },
  bottomZone: { alignItems: 'center', paddingTop: 4, gap: 6, marginTop: 'auto' },

  seatHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  seatLabel: { fontFamily: 'Cairo_400Regular', fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase', color: C.boneOff },
  dealerToken: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: C.brass,
    alignItems: 'center', justifyContent: 'center',
  },
  dealerTokenTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 11, color: C.ink, lineHeight: 14 },

  botHand: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 8, rowGap: 6 },
  botHandV: { flexDirection: 'column', alignItems: 'center', rowGap: 6 },

  tableZone: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 14,
    padding: 12,
    minWidth: 180,
    minHeight: 110,
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  tableCards: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 8, rowGap: 8 },
  tableEmpty: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13, fontStyle: 'italic', textAlign: 'center' },

  pilesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: 16, marginTop: 12 },
  deckLabel: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff },

  pileCol: { alignItems: 'center', gap: 3 },
  pileBox: { width: 34, height: 44 },
  pileCard: {
    position: 'absolute', width: 24, height: 34, borderRadius: 3,
    borderWidth: 1, borderColor: 'rgba(28,38,34,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  pileStar: { opacity: 0.7 },
  pileEmpty: {
    position: 'absolute', left: 5, bottom: 5, width: 24, height: 34, borderRadius: 3,
    borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(244,236,216,0.18)',
  },
  pileNum: { fontFamily: 'Cairo_600SemiBold', fontSize: 12, color: C.bone },

  mabBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginBottom: 8, paddingVertical: 5, paddingHorizontal: 12,
    backgroundColor: 'rgba(201,162,39,0.13)', borderRadius: 8, borderLeftWidth: 3, borderLeftColor: C.brass,
  },
  mabBannerAr: { fontFamily: 'ReemKufi_700Bold', fontSize: 14, color: C.brass },
  mabBannerLa: { fontFamily: 'Cairo_400Regular', fontSize: 10, color: C.boneOff, letterSpacing: 1.2, textTransform: 'uppercase' },

  playerHand: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 10, rowGap: 8, paddingHorizontal: 16 },

  actionBar: {
    backgroundColor: C.deep, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(201,162,39,0.1)', marginTop: 12, minHeight: 54,
  },
  btnRonda: { backgroundColor: C.brass, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', marginRight: 8 },
  btnRondaAr: { fontFamily: 'ReemKufi_700Bold', fontSize: 16, color: C.ink, lineHeight: 20 },
  btnRondaLa: { fontFamily: 'Cairo_400Regular', fontSize: 9, color: 'rgba(28,38,34,0.6)', letterSpacing: 0.8, lineHeight: 12 },

  btnContre: { backgroundColor: C.clay, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  btnContreTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.bone, letterSpacing: 0.5 },

  contestChooser: {
    backgroundColor: C.deep, paddingHorizontal: 16, paddingVertical: 10, gap: 8,
    borderTopWidth: 1, borderTopColor: 'rgba(201,162,39,0.15)',
  },
  contestTitle: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff, letterSpacing: 1, textTransform: 'uppercase' },
  contestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  contestChoice: { backgroundColor: C.clay, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6, alignItems: 'center' },
  contestChoiceVal: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.bone, lineHeight: 20 },
  contestChoiceWho: { fontFamily: 'Cairo_400Regular', fontSize: 9, color: 'rgba(244,236,216,0.7)', lineHeight: 12 },
  contestCancel: { paddingHorizontal: 12, paddingVertical: 8 },
  contestCancelTxt: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.boneOff },

  btnPrimary: { backgroundColor: C.brass, borderRadius: 10, paddingHorizontal: 28, paddingVertical: 14 },
  btnPrimaryTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.ink, letterSpacing: 0.5 },
})

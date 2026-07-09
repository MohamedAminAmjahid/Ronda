import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated, Modal } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router, useFocusEffect, type Href } from 'expo-router'
import { useAuth } from '../firebase/auth'
import { useProfile } from '../profile/useProfile'
import { useI18n } from '../i18n/useI18n'
import type { TranslationKey } from '../i18n/translations'
import {
  fetchCurrentTournament, registerForTournament, TOURNAMENT_ADVANCE_KEY,
  type Tournament, type BracketMatch, type TournamentAdvancePending,
} from '../online/client'
import { AvatarDisplay } from './ProfileScreen'
import { PlayerProfileModal } from './PlayerProfileModal'

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  clay:    '#B5532A',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
  green:   '#27AE60',
  amber:   '#D9A22C',
} as const

// Rafraîchissement léger tant que l'écran reste ouvert — le bracket avance en
// arrière-plan (autres joueurs qui terminent leurs matches) sans action de
// l'utilisateur ; useFocusEffect seul ne le capterait pas.
const POLL_MS = 30_000

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0j 00:00:00'
  const s = Math.floor(ms / 1000)
  const days = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${days}j ${pad(h)}:${pad(m)}:${pad(sec)}`
}

/** Extrait le numéro de semaine ISO d'un weekId '2026-W28' → '28'. */
function weekNumber(weekId: string): string {
  return weekId.split('-W')[1] ?? weekId
}

/** Nom du tour déduit du nombre de matches (fiable quel que soit maxPlayers,
 * contrairement à round↔nom fixe qui suppose toujours 16 joueurs). */
function roundLabel(matchCount: number, round: number, t: (k: TranslationKey) => string): string {
  if (matchCount === 1) return t('roundFinal')
  if (matchCount === 2) return t('roundSemi')
  if (matchCount === 4) return t('roundQuarter')
  if (matchCount === 8) return t('roundOf16')
  return t('roundGeneric').replace('{n}', String(round))
}

function matchStatusInfo(
  m: BracketMatch, myUid: string | null, t: (k: TranslationKey) => string,
): { label: string; color: string } {
  if (m.status === 'done') return { label: `✅ ${t('matchDone')}`, color: C.boneOff }
  if (m.status === 'forfeit') return { label: `✅ ${t('matchForfeit')}`, color: C.boneOff }
  if (m.status === 'pending') return { label: `🟡 ${t('matchPending')}`, color: C.amber }
  const isMine = !!myUid && (m.player1Uid === myUid || m.player2Uid === myUid)
  return isMine
    ? { label: `🟢 ${t('matchWaitingYou')}`, color: C.green }
    : { label: `🟢 ${t('matchInProgress')}`, color: C.green }
}

interface Props {
  onBack: () => void
}

export function TournamentScreen({ onBack }: Props) {
  const { t } = useI18n()
  const { user } = useAuth()
  const { username } = useProfile()
  const myUid = user?.uid ?? null

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [registering, setRegistering] = useState(false)
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [profileTarget, setProfileTarget] = useState<{ uid: string; name: string } | null>(null)
  const [advanceModal, setAdvanceModal] = useState<TournamentAdvancePending | null>(null)

  // Notif « tu avances / tu es champion » : écrite par online/store.ts juste
  // après un game_over gagné sur un match de tournoi. Lue une seule fois ici
  // (à chaque focus, puisqu'on revient précisément sur cet écran après un
  // match — voir GameScreen.tsx onMenu) puis effacée.
  useFocusEffect(useCallback(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(TOURNAMENT_ADVANCE_KEY)
        if (!raw) return
        await AsyncStorage.removeItem(TOURNAMENT_ADVANCE_KEY)
        setAdvanceModal(JSON.parse(raw) as TournamentAdvancePending)
      } catch { /* ignore */ }
    })()
  }, []))

  const load = useCallback(async () => {
    try {
      const data = await fetchCurrentTournament()
      setTournament(data)
      setError(null)
    } catch {
      setError(t('tournamentLoadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  useEffect(() => {
    const id = setInterval(() => { void load() }, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const isRegistered = !!myUid && !!tournament?.participants.includes(myUid)

  const countdownMs = tournament?.registrationDeadline
    ? new Date(tournament.registrationDeadline).getTime() - now
    : 0

  const handleRegister = async () => {
    if (!myUid || registering) return
    setRegistering(true)
    setRegisterError(null)
    try {
      await registerForTournament(myUid, username)
      await load()
    } catch (e) {
      setRegisterError((e as Error).message)
    } finally {
      setRegistering(false)
    }
  }

  // Aucun code à transmettre : l'appariement se fait automatiquement côté
  // serveur (RondaRoom.filterBy(['tournamentMatchId']), voir online/store.ts
  // connectTournamentMatch) — m.roomCode est purement informatif (affiché
  // nulle part actuellement) et jamais utilisé pour rejoindre la partie.
  const handlePlay = (m: BracketMatch, isFinal: boolean) => {
    if (!m.player1Uid || !m.player2Uid) return
    router.push(
      `/online?mode=friend&tournamentMatchId=${encodeURIComponent(m.matchId)}` +
      `&tp1=${encodeURIComponent(m.player1Uid)}&tp2=${encodeURIComponent(m.player2Uid)}` +
      `&tFinal=${isFinal ? 1 : 0}` as Href,
    )
  }

  const openProfile = (uid: string | null, name: string) => {
    if (!uid) return
    setProfileTarget({ uid, name })
  }

  // ── Bouton d'inscription : état dérivé du tournoi + de l'inscription ──────
  const registerState = useMemo(() => {
    if (!tournament) return null
    if (isRegistered) return 'registered' as const
    if (tournament.status !== 'open') return 'closed' as const
    if (tournament.participants.length >= tournament.maxPlayers) return 'full' as const
    return 'can_register' as const
  }, [tournament, isRegistered])

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>
        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>{t('back')}</Text>
          </TouchableOpacity>
          <Text style={s.title}>🏆 {t('tournamentTitle')}</Text>
        </View>

        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {loading && !tournament ? (
            <TournamentSkeleton />
          ) : error && !tournament ? (
            <Text style={s.empty}>{error}</Text>
          ) : !tournament ? (
            <Text style={s.empty}>{t('noTournamentYet')}</Text>
          ) : (
            <>
              <Text style={s.subtitle}>
                {t('tournamentSubtitle').replace('{n}', weekNumber(tournament.weekId))}
              </Text>

              {/* ── Infos tournoi ── */}
              <View style={s.card}>
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>💰 {t('prizePoolLabel')}</Text>
                  <Text style={s.infoValue}>{tournament.prizePool} 🪙</Text>
                </View>
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>👥</Text>
                  <Text style={s.infoValue}>
                    {t('playersRegistered')
                      .replace('{n}', String(tournament.participants.length))
                      .replace('{max}', String(tournament.maxPlayers))}
                  </Text>
                </View>
                {tournament.status === 'open' && (
                  <View style={s.infoRow}>
                    <Text style={s.infoLabel}>⏳ {t('registrationCloses')}</Text>
                    <Text style={s.countdown}>{formatCountdown(countdownMs)}</Text>
                  </View>
                )}
                {tournament.status === 'finished' && tournament.champion && (
                  <Text style={s.championTxt}>
                    {t('championLabel').replace(
                      '{name}', tournament.participantNames[tournament.champion] ?? '?',
                    )}
                  </Text>
                )}
              </View>

              {/* ── Bouton d'inscription ── */}
              {registerState === 'registered' && (
                <View style={s.btnDisabled}>
                  <Text style={s.btnDisabledTxt}>{t('registeredWaiting')}</Text>
                </View>
              )}
              {registerState === 'can_register' && (
                <TouchableOpacity
                  style={s.btnPrimary}
                  onPress={() => { void handleRegister() }}
                  disabled={registering}
                  activeOpacity={0.85}
                >
                  <Text style={s.btnPrimaryTxt}>
                    {registering
                      ? t('registering')
                      : tournament.entryFee > 0
                        ? t('registerPaid').replace('{n}', String(tournament.entryFee))
                        : t('registerFree')}
                  </Text>
                </TouchableOpacity>
              )}
              {registerState === 'full' && (
                <View style={s.btnDisabled}>
                  <Text style={s.btnDisabledTxt}>{t('tournamentFull')}</Text>
                </View>
              )}
              {registerState === 'closed' && (
                <View style={s.btnDisabled}>
                  <Text style={s.btnDisabledTxt}>{t('registrationClosed')}</Text>
                </View>
              )}
              {registerError && <Text style={s.errorTxt}>{registerError}</Text>}

              {/* ── Bracket ── */}
              {tournament.bracket.length > 0 && (
                <>
                  <Text style={s.sectionLabel}>{t('bracketTitle')}</Text>
                  {tournament.bracket.map((round) => (
                    <View key={round.round} style={{ gap: 8, marginBottom: 14 }}>
                      <Text style={s.roundLabel}>
                        {roundLabel(round.matches.length, round.round, t)}
                      </Text>
                      {round.matches.map((m) => {
                        const isMine = !!myUid && (m.player1Uid === myUid || m.player2Uid === myUid)
                        const p1Name = m.player1Uid ? (tournament.participantNames[m.player1Uid] ?? '?') : t('tbdOpponent')
                        const p2Name = m.player2Uid ? (tournament.participantNames[m.player2Uid] ?? '?') : t('tbdOpponent')
                        const p1Avatar = m.player1Uid ? tournament.participantAvatars[m.player1Uid] : undefined
                        const p2Avatar = m.player2Uid ? tournament.participantAvatars[m.player2Uid] : undefined
                        const { label, color } = matchStatusInfo(m, myUid, t)
                        const canPlay = m.status === 'ready' && isMine
                        const isFinal = round.round === tournament.bracket.length
                        return (
                          <View key={m.matchId} style={[s.matchCard, isMine && s.matchCardMine]}>
                            <View style={s.matchPlayers}>
                              <TouchableOpacity
                                style={s.matchPlayer}
                                disabled={!m.player1Uid}
                                onPress={() => openProfile(m.player1Uid, p1Name)}
                                activeOpacity={0.7}
                              >
                                <AvatarDisplay
                                  type={(p1Avatar?.avatarType ?? 'initial') as 'initial' | 'emoji' | 'image'}
                                  initial={p1Name[0]?.toUpperCase() ?? '?'}
                                  emoji={p1Avatar?.avatarEmoji ?? ''}
                                  image={p1Avatar?.avatarImage ?? ''}
                                  size={32}
                                />
                                <Text
                                  style={[s.matchPlayerName, m.winnerUid === m.player1Uid && s.matchWinnerName]}
                                  numberOfLines={1}
                                >
                                  {p1Name}
                                </Text>
                              </TouchableOpacity>
                              <Text style={s.vsTxt}>VS</Text>
                              <TouchableOpacity
                                style={[s.matchPlayer, { alignItems: 'flex-end' }]}
                                disabled={!m.player2Uid}
                                onPress={() => openProfile(m.player2Uid, p2Name)}
                                activeOpacity={0.7}
                              >
                                <Text
                                  style={[s.matchPlayerName, m.winnerUid === m.player2Uid && s.matchWinnerName]}
                                  numberOfLines={1}
                                >
                                  {p2Name}
                                </Text>
                                <AvatarDisplay
                                  type={(p2Avatar?.avatarType ?? 'initial') as 'initial' | 'emoji' | 'image'}
                                  initial={p2Name[0]?.toUpperCase() ?? '?'}
                                  emoji={p2Avatar?.avatarEmoji ?? ''}
                                  image={p2Avatar?.avatarImage ?? ''}
                                  size={32}
                                />
                              </TouchableOpacity>
                            </View>
                            <View style={s.matchFooter}>
                              <Text style={[s.matchStatusTxt, { color }]}>{label}</Text>
                              {canPlay && (
                                <TouchableOpacity style={s.playBtn} onPress={() => handlePlay(m, isFinal)} activeOpacity={0.85}>
                                  <Text style={s.playBtnTxt}>{t('playNowBtn')}</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        )
                      })}
                    </View>
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      </View>

      <PlayerProfileModal
        visible={profileTarget !== null}
        uid={profileTarget?.uid}
        name={profileTarget?.name}
        onClose={() => setProfileTarget(null)}
      />

      <Modal visible={advanceModal !== null} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalEmoji}>{advanceModal?.isFinal ? '🏆' : '🎉'}</Text>
            <Text style={s.modalTitle}>
              {advanceModal?.isFinal ? t('championModalTitle') : t('advanceModalTitle')}
            </Text>
            {!!advanceModal?.goldWon && advanceModal.goldWon > 0 && (
              <Text style={s.modalGold}>🪙 +{advanceModal.goldWon}</Text>
            )}
            <TouchableOpacity style={s.btnPrimary} onPress={() => setAdvanceModal(null)} activeOpacity={0.85}>
              <Text style={s.btnPrimaryTxt}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

// ── Skeleton (premier chargement, aucun cache à montrer) ────────────────────

function SkeletonBlock({ height, width = '100%' }: { height: number; width?: number | `${number}%` }) {
  const pulse = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1,   duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 650, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])
  return <Animated.View style={[s.skeletonBlock, { height, width, opacity: pulse }]} />
}

function TournamentSkeleton() {
  return (
    <View style={{ gap: 10 }}>
      <SkeletonBlock height={16} width="50%" />
      <SkeletonBlock height={90} />
      <SkeletonBlock height={48} />
      <SkeletonBlock height={16} width="30%" />
      <SkeletonBlock height={64} />
      <SkeletonBlock height={64} />
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.table, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 480, paddingHorizontal: 18 },

  header: { paddingTop: 16, paddingBottom: 8, gap: 4 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6 },
  backTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  title: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: C.bone,
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  subtitle: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff, marginBottom: 10 },

  body: { paddingBottom: 24, gap: 10 },

  card: {
    backgroundColor: C.deep, borderRadius: 14, padding: 16, gap: 10,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.3)',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoLabel: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff },
  infoValue: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.bone },
  countdown: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.brass },
  championTxt: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.brass, textAlign: 'center', marginTop: 4,
  },

  btnPrimary: {
    backgroundColor: C.brass, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  btnPrimaryTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.ink, letterSpacing: 0.3 },
  btnDisabled: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    backgroundColor: 'rgba(244,236,216,0.08)', borderWidth: 1, borderColor: 'rgba(244,236,216,0.15)',
  },
  btnDisabledTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.boneOff },
  errorTxt: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.clay, textAlign: 'center' },

  sectionLabel: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.boneOff,
    letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 12, marginBottom: 4,
  },
  roundLabel: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.brass },

  matchCard: {
    backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 12, padding: 12, gap: 10,
  },
  matchCardMine: { borderWidth: 1.5, borderColor: C.brass, backgroundColor: 'rgba(201,162,39,0.12)' },
  matchPlayers: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  matchPlayer: { flex: 1, alignItems: 'center', gap: 4 },
  matchPlayerName: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.bone, maxWidth: 100 },
  matchWinnerName: { fontFamily: 'Cairo_600SemiBold', color: C.brass },
  vsTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 12, color: C.boneOff, paddingHorizontal: 8 },
  matchFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  matchStatusTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 12 },
  playBtn: { backgroundColor: C.brass, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  playBtnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 12, color: C.ink },

  empty: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff, textAlign: 'center', marginTop: 30, lineHeight: 20 },

  skeletonBlock: { borderRadius: 10, backgroundColor: 'rgba(244,236,216,0.10)' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(6,26,18,0.88)', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    width: '100%', maxWidth: 320, backgroundColor: C.deep, borderRadius: 18, padding: 24,
    alignItems: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(201,162,39,0.35)',
  },
  modalEmoji: { fontSize: 44 },
  modalTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 18, color: C.bone, textAlign: 'center' },
  modalGold: { fontFamily: 'Cairo_600SemiBold', fontSize: 20, color: C.brass },
})

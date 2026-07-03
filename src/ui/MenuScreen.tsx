import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Linking, Modal, ScrollView, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, type Href } from 'expo-router'
import { useProfile } from '../profile/useProfile'
import { useI18n } from '../i18n/useI18n'
import { loadActiveRoom, clearActiveRoom, type ActiveRoom } from '../profile/profile'
import { reconnect as reconnect1v1 } from '../online/store'
import { reconnectLobby } from '../online/lobby2v2'
import { GameChoiceModal, type GameKey } from './GameChoiceModal'
import { useAuth } from '../firebase/auth'
import { useDailyBonus } from '../hooks/useDailyBonus'
import { useSpinWheel } from '../hooks/useSpinWheel'
import { useDailyChest } from '../hooks/useDailyChest'
import { StreakInfoModal } from './StreakInfoModal'
import { SpinWheelModal } from './SpinWheelModal'
import { DailyChestModal } from './DailyChestModal'

const LINKEDIN_URL = 'https://www.linkedin.com/in/amjahid-mohamed-amin'

type ActionType = 'online' | 'friend' | 'training'

// ── Tokens ────────────────────────────────────────────────────────────────────

const C = {
  bg:          '#0D0D1A',
  night:       '#1A0D2E',
  brass:       '#C9A227',
  brassBorder: 'rgba(201,162,39,0.30)',
  bone:        '#F4ECD8',
  boneOff:     'rgba(244,236,216,0.45)',
  boneGhost:   'rgba(244,236,216,0.12)',
  ink:         '#1C2622',
} as const

// ── Bouton rond accès rapide ──────────────────────────────────────────────────

function QuickBtn({
  icon, label, hasBadge, onPress,
}: { icon: string; label: string; hasBadge: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={qb.btn} onPress={onPress} activeOpacity={0.80}>
      <Text style={qb.icon}>{icon}</Text>
      <Text style={qb.label}>{label}</Text>
      {hasBadge && <View style={qb.badge} />}
    </TouchableOpacity>
  )
}

const qb = StyleSheet.create({
  btn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.30)',
    alignItems: 'center', justifyContent: 'center', gap: 1,
  },
  icon:  { fontSize: 22, lineHeight: 26 },
  label: { fontFamily: 'Cairo_400Regular', fontSize: 9, color: 'rgba(244,236,216,0.55)', lineHeight: 11 },
  badge: {
    position: 'absolute', top: 3, right: 3,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#E53935',
    borderWidth: 1.5, borderColor: '#0D0D1A',
  },
})

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onLeaderboard: () => void
  onRules:       () => void
  onCredits:     () => void
}

// ── Écran ─────────────────────────────────────────────────────────────────────

export function MenuScreen({ onLeaderboard, onRules, onCredits }: Props) {
  const { username } = useProfile()
  const { t, lang, setLang } = useI18n()
  const { user } = useAuth()

  // ── Accès rapide : streak / roue / coffre ─────────────────────────────────
  const { pending: streakPending, alreadyClaimed: streakClaimed, claim: claimStreak, streak } = useDailyBonus()
  const { canSpin, spin } = useSpinWheel()
  const { reward: chest, openChest } = useDailyChest()
  const [showStreak, setShowStreak] = useState(false)
  const [showSpin,   setShowSpin]   = useState(false)
  const [showChest,  setShowChest]  = useState(false)

  // ── Animation de fond ─────────────────────────────────────────────────────
  const bgPulse = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bgPulse, { toValue: 1, duration: 4000, useNativeDriver: false }),
        Animated.timing(bgPulse, { toValue: 0, duration: 4000, useNativeDriver: false }),
      ]),
    ).start()
  }, [bgPulse])
  const bgColor = bgPulse.interpolate({
    inputRange:  [0, 1],
    outputRange: ['#0D0D1A', '#110D22'],
  })

  // ── Action en cours (détermine quelle modale de jeu ouvrir) ──────────────
  const [action, setAction] = useState<ActionType | null>(null)

  const modalTitle: string = (() => {
    if (action === 'online')   return `⚡ ${t('playOnline')}`
    if (action === 'friend')   return `👥 ${t('playWithFriend')}`
    if (action === 'training') return `🤖 ${t('training')}`
    return ''
  })()

  const handleChoose = (game: GameKey) => {
    const a = action
    setAction(null)
    if (a === 'online') {
      router.push((game === 'ronda' ? '/bet?game=ronda' : '/bet?game=dijouj') as Href)
    } else if (a === 'friend') {
      router.push((game === 'ronda' ? '/online?mode=friend' : '/dijouj-lobby') as Href)
    } else if (a === 'training') {
      router.push((game === 'ronda' ? '/play' : '/dijouj?train=1') as Href)
    }
  }

  // ── Reconnexion à une partie en cours ──────────────────────────────────────
  const [resumeRoom,  setResumeRoom]  = useState<ActiveRoom | null>(null)
  const [resuming,    setResuming]    = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)

  useEffect(() => {
    void loadActiveRoom().then((r) => { if (r) setResumeRoom(r) })
  }, [])

  const onResume = async () => {
    if (!resumeRoom || resuming) return
    setResuming(true)
    setResumeError(null)
    try {
      if (resumeRoom.roomType === 'ronda2v2') {
        await reconnectLobby(resumeRoom.reconnectionToken)
        setResumeRoom(null)
        router.push('/lobby2v2?reconnect=1' as Href)
      } else {
        await reconnect1v1(resumeRoom.reconnectionToken)
        setResumeRoom(null)
        router.push('/online' as Href)
      }
    } catch {
      clearActiveRoom()
      setResumeError(t('reconnectFailed'))
    } finally {
      setResuming(false)
    }
  }

  const onForfeit = () => {
    clearActiveRoom()
    setResumeRoom(null)
    setResumeError(null)
  }

  return (
    <Animated.View style={[s.rootBg, { backgroundColor: bgColor }]}>
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>

        {/* ── Accès rapide flottant (droite) ───────────────────── */}
        {!!user && (
          <View style={s.quickBar}>
            <QuickBtn
              icon="🔥" label="Streak"
              hasBadge={!streakClaimed && streakPending !== null}
              onPress={() => setShowStreak(true)}
            />
            <QuickBtn
              icon="🎰" label="Roue"
              hasBadge={canSpin}
              onPress={() => setShowSpin(true)}
            />
            <QuickBtn
              icon="🎁" label="Coffre"
              hasBadge={chest !== null}
              onPress={() => { if (chest) setShowChest(true) }}
            />
          </View>
        )}

        {/* ── Modale de reconnexion ────────────────────────────── */}
        <Modal visible={resumeRoom !== null} transparent animationType="fade" onRequestClose={onForfeit}>
          <View style={s.modalBackdrop}>
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>{t('activeGame')}</Text>
              {resumeError ? (
                <>
                  <Text style={s.resumeText}>{resumeError}</Text>
                  <View style={s.modalActions}>
                    <TouchableOpacity style={s.modalSave} onPress={onForfeit}>
                      <Text style={s.modalSaveTxt}>OK</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={s.resumeText}>
                    {t('resumeGameMsg').replace('{code}', resumeRoom?.code ? ` (code : ${resumeRoom.code})` : '')}
                  </Text>
                  <View style={s.modalActions}>
                    <TouchableOpacity style={s.modalCancel} onPress={onForfeit} disabled={resuming}>
                      <Text style={s.modalCancelTxt}>{t('abandon')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.modalSave, resuming && s.btnDisabledOpacity]}
                      onPress={onResume}
                      disabled={resuming}
                    >
                      <Text style={s.modalSaveTxt}>{resuming ? t('connecting') : t('resume')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>

        {/* ── Modale de choix du jeu ───────────────────────────── */}
        <GameChoiceModal
          visible={action !== null}
          title={modalTitle}
          onChoose={handleChoose}
          onClose={() => setAction(null)}
        />

        {/* ── Contenu scrollable ────────────────────────────────── */}
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

          {/* ── Titre plateforme ──────────────────────────────────── */}
          <View style={s.hero}>
            <View style={s.titleRow}>
              <Text style={s.platformTitle}>Dar Lwar9a</Text>
              <Text style={s.platformTM}>TM</Text>
            </View>
            <Text style={s.platformAr}>دار الورقة</Text>
            <View style={s.divider} />
            <Text style={s.helloTxt}>Salut {username || '…'} 👋</Text>
          </View>

          {/* ── 3 boutons d'action ───────────────────────────────── */}
          <View style={s.actionSection}>

            {/* ⚡ Jouer en ligne */}
            <TouchableOpacity
              style={s.actionBtnOnline}
              onPress={() => setAction('online')}
              activeOpacity={0.85}
            >
              <Text style={s.actionBtnIcon}>⚡</Text>
              <View style={s.actionBtnBody}>
                <Text style={s.actionBtnLblDark}>{t('playOnline')}</Text>
                <Text style={s.actionBtnSubDark}>{t('onlineSub')}</Text>
              </View>
            </TouchableOpacity>

            {/* 👥 Jouer avec un ami */}
            <TouchableOpacity
              style={s.actionBtnFriend}
              onPress={() => setAction('friend')}
              activeOpacity={0.85}
            >
              <Text style={s.actionBtnIcon}>👥</Text>
              <View style={s.actionBtnBody}>
                <Text style={s.actionBtnLbl}>{t('playWithFriend')}</Text>
                <Text style={s.actionBtnSub}>{t('friendSub')}</Text>
              </View>
            </TouchableOpacity>

            {/* 🤖 Entraînement */}
            <TouchableOpacity
              style={s.actionBtnTraining}
              onPress={() => setAction('training')}
              activeOpacity={0.75}
            >
              <Text style={[s.actionBtnIcon, s.trainingIcon]}>🤖</Text>
              <View style={s.actionBtnBody}>
                <Text style={s.actionBtnLblMuted}>{t('training')}</Text>
                <Text style={s.actionBtnSubMuted}>{t('trainingSub')}</Text>
              </View>
            </TouchableOpacity>

          </View>

          {/* ── Liens texte ──────────────────────────────────────── */}
          <View style={s.textLinks}>
            <TouchableOpacity style={s.linkBtn} onPress={() => router.push('/daily-quests' as Href)}>
              <Text style={s.linkTxt}>{t('dailyQuests')}</Text>
            </TouchableOpacity>
            <Text style={s.linkSep}>·</Text>
            <TouchableOpacity style={s.linkBtn} onPress={onLeaderboard}>
              <Text style={s.linkTxt}>{t('leaderboard')}</Text>
            </TouchableOpacity>
            <Text style={s.linkSep}>·</Text>
            <TouchableOpacity style={s.linkBtn} onPress={onRules}>
              <Text style={s.linkTxt}>{t('rules')}</Text>
            </TouchableOpacity>
            <Text style={s.linkSep}>·</Text>
            <TouchableOpacity style={s.linkBtn} onPress={onCredits}>
              <Text style={s.linkTxt}>{t('credits')}</Text>
            </TouchableOpacity>
          </View>

          {/* ── Sélecteur de langue ──────────────────────────────── */}
          <View style={s.langRow}>
            {(['ar', 'fr', 'en'] as const).map((lg) => (
              <TouchableOpacity
                key={lg}
                style={[s.langBtn, lang === lg && s.langBtnActive]}
                onPress={() => setLang(lg)}
                accessibilityLabel={lg}
              >
                <Text style={[s.langLabel, lang === lg && s.langLabelActive]}>
                  {lg.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Pied ─────────────────────────────────────────────── */}
          <View style={s.footer}>
            <Text style={s.footerTxt}>v1.0</Text>
            <TouchableOpacity onPress={() => Linking.openURL(LINKEDIN_URL)}>
              <Text style={s.author}>Made by Amjahid Mohamed Amin</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </View>

      {/* ── Modales accès rapide ─────────────────────────────── */}
      {showStreak && (
        <StreakInfoModal
          streak={streak}
          pending={streakPending}
          alreadyClaimed={streakClaimed}
          onClaim={claimStreak}
          onClose={() => setShowStreak(false)}
        />
      )}
      {showSpin && (
        <SpinWheelModal
          canSpin={canSpin}
          onSpin={spin}
          onClose={() => setShowSpin(false)}
        />
      )}
      {showChest && chest && (
        <DailyChestModal
          level={chest.level}
          gold={chest.gold}
          onOpen={openChest}
          onClose={() => setShowChest(false)}
        />
      )}
    </SafeAreaView>
    </Animated.View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  rootBg: { flex: 1 },
  root:   { flex: 1, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 430, paddingHorizontal: 24 },

  // Accès rapide flottant
  quickBar: {
    position: 'absolute', right: 12, top: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', gap: 10, zIndex: 10,
  },

  // Scrollable
  scroll:        { flex: 1 },
  scrollContent: { gap: 16, paddingBottom: 28, paddingTop: 8 },

  // Hero
  hero:     { alignItems: 'center', paddingVertical: 28, gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  platformTitle: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 38,
    color: C.bone,
    letterSpacing: 1.5,
    textShadowColor: 'rgba(201,162,39,0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  platformTM: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 14,
    color: C.boneOff,
    letterSpacing: 2,
    marginBottom: 8,
  },
  platformAr: {
    fontFamily: 'ReemKufi_700Bold',
    fontSize: 24,
    color: C.brass,
    letterSpacing: 1,
    textShadowColor: 'rgba(201,162,39,0.30)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  divider: {
    width: 40, height: 1,
    backgroundColor: 'rgba(201,162,39,0.25)',
    marginVertical: 6,
  },
  helloTxt: {
    fontFamily: 'Cairo_400Regular', fontSize: 14, color: 'rgba(244,236,216,0.50)',
  },

  // ── 3 boutons d'action ────────────────────────────────────────────────────
  actionSection: { gap: 12 },

  actionBtnOnline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 22,
    backgroundColor: C.brass,
    shadowColor: C.brass,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  actionBtnFriend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 22,
    borderWidth: 1.5,
    borderColor: C.brass,
    backgroundColor: 'rgba(201,162,39,0.07)',
  },
  actionBtnTraining: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(244,236,216,0.18)',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },

  actionBtnIcon:  { fontSize: 26 },
  trainingIcon:   { opacity: 0.70 },
  actionBtnBody:  { gap: 2 },

  // Online (on brass bg — dark text)
  actionBtnLblDark: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 17, color: C.ink, letterSpacing: 0.3,
  },
  actionBtnSubDark: {
    fontFamily: 'Cairo_400Regular', fontSize: 12, color: 'rgba(28,38,34,0.60)',
  },

  // Friend (brass border — brass label)
  actionBtnLbl: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.brass, letterSpacing: 0.3,
  },
  actionBtnSub: {
    fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.boneOff,
  },

  // Training (muted)
  actionBtnLblMuted: {
    fontFamily: 'Cairo_400Regular', fontSize: 15, color: 'rgba(244,236,216,0.45)', letterSpacing: 0.3,
  },
  actionBtnSubMuted: {
    fontFamily: 'Cairo_400Regular', fontSize: 12, color: 'rgba(244,236,216,0.28)',
  },

  // Text links
  textLinks: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginTop: 4,
  },
  linkSep: { color: 'rgba(244,236,216,0.18)', fontSize: 12 },
  linkBtn: { paddingVertical: 8, paddingHorizontal: 10 },
  linkTxt: {
    fontFamily: 'Cairo_400Regular', fontSize: 12, color: 'rgba(244,236,216,0.26)',
    letterSpacing: 1, textTransform: 'uppercase',
  },

  // Language selector
  langRow: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  langBtn: {
    width: 44, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(244,236,216,0.10)', backgroundColor: 'rgba(255,255,255,0.04)',
  },
  langBtnActive:   { borderColor: C.brass, backgroundColor: 'rgba(201,162,39,0.15)' },
  langLabel: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: 'rgba(244,236,216,0.26)', letterSpacing: 0.5,
  },
  langLabelActive: { color: C.brass },

  // Footer
  footer:    { alignItems: 'center', paddingTop: 4, gap: 4 },
  footerTxt: { fontSize: 10, color: 'rgba(244,236,216,0.14)', letterSpacing: 1, textTransform: 'uppercase' },
  author: {
    fontFamily: 'Cairo_400Regular', fontSize: 11,
    color: 'rgba(244,236,216,0.28)', letterSpacing: 0.3, textDecorationLine: 'underline',
  },

  // Modal reconnexion
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(13,13,26,0.90)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28,
  },
  modalCard: {
    width: '100%', maxWidth: 360, backgroundColor: C.night, borderRadius: 16, padding: 22, gap: 10,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)',
  },
  modalTitle: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.boneOff, letterSpacing: 1.5, textTransform: 'uppercase',
  },
  resumeText:     { fontFamily: 'Cairo_400Regular', fontSize: 15, color: C.bone, lineHeight: 22 },
  modalActions:   { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 6 },
  modalCancel:    { paddingVertical: 12, paddingHorizontal: 16 },
  modalCancelTxt: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff },
  modalSave:      { backgroundColor: C.brass, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 22 },
  modalSaveTxt:   { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.ink },
  btnDisabledOpacity: { opacity: 0.4 },
})

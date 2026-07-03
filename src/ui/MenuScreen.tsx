import { type ReactElement, useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Linking, Modal, ScrollView, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, type Href } from 'expo-router'
import { useProfile } from '../profile/useProfile'
import { useI18n } from '../i18n/useI18n'
import { loadActiveRoom, clearActiveRoom, xpRequired, type ActiveRoom } from '../profile/profile'
import { reconnect as reconnect1v1 } from '../online/store'
import { reconnectLobby } from '../online/lobby2v2'
import { GameChoiceModal, type GameKey } from './GameChoiceModal'
import { AvatarDisplay } from './ProfileScreen'
import { useAuth } from '../firebase/auth'
import { useDailyBonus } from '../hooks/useDailyBonus'
import { useSpinWheel } from '../hooks/useSpinWheel'
import { useDailyChest } from '../hooks/useDailyChest'
import { StreakInfoModal } from './StreakInfoModal'
import { SpinWheelModal } from './SpinWheelModal'
import { DailyChestModal, ChestSVG } from './DailyChestModal'

const LINKEDIN_URL = 'https://www.linkedin.com/in/amjahid-mohamed-amin'

type ActionType = 'online' | 'friend' | 'training'
type Lang = 'ar' | 'fr' | 'en'

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

// ── Sélecteur de langue (modale) ──────────────────────────────────────────────

const LANG_OPTIONS: { key: Lang; label: string }[] = [
  { key: 'fr', label: 'Français'  },
  { key: 'en', label: 'English'   },
  { key: 'ar', label: 'العربية'  },
]

function LangModal({ lang, onSelect, onClose }: {
  lang: Lang
  onSelect: (l: Lang) => void
  onClose: () => void
}) {
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <TouchableOpacity style={lm.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={lm.card} onStartShouldSetResponder={() => true}>
          <TouchableOpacity style={lm.closeBtn} onPress={onClose} hitSlop={10}>
            <Text style={lm.closeTxt}>✕</Text>
          </TouchableOpacity>
          <Text style={lm.title}>🌐 Langue</Text>
          {LANG_OPTIONS.map(o => (
            <TouchableOpacity
              key={o.key}
              style={[lm.opt, lang === o.key && lm.optActive]}
              onPress={() => { onSelect(o.key); onClose() }}
              activeOpacity={0.75}
            >
              <Text style={[lm.optTxt, lang === o.key && lm.optTxtActive]}>{o.label}</Text>
              {lang === o.key && <Text style={lm.check}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

const lm = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(13,13,26,0.82)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 48,
  },
  card: {
    width: '100%', maxWidth: 280, backgroundColor: C.night,
    borderRadius: 16, padding: 20, gap: 4,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45, shadowRadius: 18, elevation: 12,
  },
  closeBtn: {
    position: 'absolute', top: 14, right: 14,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(244,236,216,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt:     { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: 'rgba(244,236,216,0.40)' },
  title:        { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.bone, marginBottom: 6, marginTop: 4 },
  opt: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(244,236,216,0.08)',
    backgroundColor: 'rgba(244,236,216,0.04)', marginTop: 6,
  },
  optActive:    { borderColor: 'rgba(201,162,39,0.40)', backgroundColor: 'rgba(201,162,39,0.10)' },
  optTxt:       { fontFamily: 'Cairo_400Regular', fontSize: 15, color: 'rgba(244,236,216,0.65)' },
  optTxtActive: { color: C.brass, fontFamily: 'Cairo_600SemiBold' },
  check:        { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.brass },
})

// ── Bouton rond accès rapide ──────────────────────────────────────────────────

function QuickBtn({
  icon, svgIcon, label, hasBadge, disabled, onPress,
}: {
  icon?:    string
  svgIcon?: ReactElement
  label:    string
  hasBadge: boolean
  disabled?: boolean
  onPress:  () => void
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!hasBadge) { pulseAnim.setValue(1); return }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.35, duration: 550, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 550, useNativeDriver: true }),
      ]),
    )
    anim.start()
    return () => anim.stop()
  }, [hasBadge, pulseAnim])

  return (
    <TouchableOpacity
      style={[qb.btn, disabled && qb.btnDisabled]}
      onPress={onPress}
      activeOpacity={0.80}
      disabled={disabled}
    >
      {svgIcon ?? <Text style={qb.icon}>{icon}</Text>}
      <Text style={qb.label}>{label}</Text>
      {hasBadge && (
        <Animated.View style={[qb.badge, { transform: [{ scale: pulseAnim }] }]} />
      )}
    </TouchableOpacity>
  )
}

const qb = StyleSheet.create({
  btn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.30)',
    alignItems: 'center', justifyContent: 'center', gap: 1,
  },
  btnDisabled: { opacity: 0.4 },
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
  const { username, gold, avatarType, avatarEmoji, avatarImage, avatarFrame, level, xp } = useProfile()
  const { t, lang, setLang } = useI18n()
  const { user } = useAuth()

  // ── Accès rapide ──────────────────────────────────────────────────────────
  const { pending: streakPending, alreadyClaimed: streakClaimed, claim: claimStreak, streak } = useDailyBonus()
  const { canSpin, spin } = useSpinWheel()
  const { reward: chest, openChest } = useDailyChest()
  const [showStreak,    setShowStreak]    = useState(false)
  const [showSpin,      setShowSpin]      = useState(false)
  const [showChest,     setShowChest]     = useState(false)
  const [showLangModal, setShowLangModal] = useState(false)
  const [lastChestGold, setLastChestGold] = useState<number | null>(null)
  const [toastGold,     setToastGold]     = useState<number | null>(null)
  const toastAnim    = useRef(new Animated.Value(0)).current
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mesure layout pour centrer quickBar sur la zone des boutons d'action
  const [heroH,   setHeroH]   = useState(230)
  const [actionH, setActionH] = useState(200)
  const qbTop = 8 + heroH + 16  // scrollPaddingTop + heroHeight + gap

  const handleOpenChest = async () => {
    if (!chest) return
    const g = chest.gold
    await openChest()
    setLastChestGold(g)
  }

  const showChestToast = (gold: number) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToastGold(gold)
    toastAnim.setValue(0)
    Animated.timing(toastAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start()
    toastTimerRef.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => {
        setToastGold(null)
      })
    }, 3000)
  }

  // ── Animation de fond ────────────────────────────────────────────────────
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

  // ── Action en cours ──────────────────────────────────────────────────────
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

  // ── Reconnexion ──────────────────────────────────────────────────────────
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

      {/* ── Contenu principal ─────────────────────────────────── */}
      <View style={s.column}>

        {/* Modale de reconnexion */}
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

        {/* Modale de choix du jeu */}
        <GameChoiceModal
          visible={action !== null}
          title={modalTitle}
          onChoose={handleChoose}
          onClose={() => setAction(null)}
        />

        {/* Contenu scrollable */}
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

          {/* ── Hero ──────────────────────────────────────────── */}
          <View style={s.hero} onLayout={e => setHeroH(e.nativeEvent.layout.height)}>

            {/* Barre profil : avatar+nom à gauche, globe+gold à droite */}
            {user ? (
              <View style={s.profileBar}>
                <TouchableOpacity style={s.profileLeft} onPress={() => router.push('/profile' as Href)} activeOpacity={0.80}>
                  <AvatarDisplay
                    type={(avatarType ?? 'initial') as 'initial' | 'emoji' | 'image'}
                    initial={username?.[0]?.toUpperCase() ?? '?'}
                    emoji={avatarEmoji ?? ''}
                    image={avatarImage ?? ''}
                    size={40}
                    frame={avatarFrame ?? 'none'}
                    level={level}
                    xp={xp} xpMax={xpRequired(level ?? 1)}
                  />
                  <Text style={s.profileUsername} numberOfLines={1}>{username}</Text>
                </TouchableOpacity>
                <View style={s.profileRight}>
                  <TouchableOpacity style={s.goldPill} onPress={() => router.push('/gold-shop' as Href)} activeOpacity={0.75}>
                    <Text style={s.goldCoin}>🪙</Text>
                    <Text style={s.goldAmount}>{gold}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.globeBtn} onPress={() => setShowLangModal(true)} activeOpacity={0.75}>
                    <Text style={s.globeIcon}>🌐</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={s.guestRow}>
                <Text style={s.helloTxt}>Salut {username || '…'} 👋</Text>
                <TouchableOpacity style={s.globeBtn} onPress={() => setShowLangModal(true)} activeOpacity={0.75}>
                  <Text style={s.globeIcon}>🌐</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Titre */}
            <View style={s.titleRow}>
              <Text style={s.platformTitle}>Dar Lwar9a</Text>
              <Text style={s.platformTM}>TM</Text>
            </View>
            <Text style={s.platformAr}>دار الورقة</Text>
            <View style={s.divider} />

            {/* Règles & Crédits — alignés à droite sous le divider */}
            <View style={s.titleLinksRow}>
              <TouchableOpacity style={s.titleLinkBtn} onPress={onRules}>
                <Text style={s.titleLinkTxt}>{t('rules')}</Text>
              </TouchableOpacity>
              <Text style={s.titleLinkSep}>·</Text>
              <TouchableOpacity style={s.titleLinkBtn} onPress={onCredits}>
                <Text style={s.titleLinkTxt}>{t('credits')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── 3 boutons d'action ──────────────────────────────── */}
          <View style={s.actionSection} onLayout={e => setActionH(e.nativeEvent.layout.height)}>

            <TouchableOpacity style={s.actionBtnOnline} onPress={() => setAction('online')} activeOpacity={0.85}>
              <Text style={s.actionBtnIcon}>⚡</Text>
              <View style={s.actionBtnBody}>
                <Text style={s.actionBtnLblDark}>{t('playOnline')}</Text>
                <Text style={s.actionBtnSubDark}>{t('onlineSub')}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={s.actionBtnFriend} onPress={() => setAction('friend')} activeOpacity={0.85}>
              <Text style={s.actionBtnIcon}>👥</Text>
              <View style={s.actionBtnBody}>
                <Text style={s.actionBtnLbl}>{t('playWithFriend')}</Text>
                <Text style={s.actionBtnSub}>{t('friendSub')}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={s.actionBtnTraining} onPress={() => setAction('training')} activeOpacity={0.75}>
              <Text style={[s.actionBtnIcon, s.trainingIcon]}>🤖</Text>
              <View style={s.actionBtnBody}>
                <Text style={s.actionBtnLblMuted}>{t('training')}</Text>
                <Text style={s.actionBtnSubMuted}>{t('trainingSub')}</Text>
              </View>
            </TouchableOpacity>

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

      {/* ── QuickBar — overlay absolu centré sur la zone d'action ── */}
      {!!user && (
        <View
          style={[s.quickBar, { top: qbTop, height: actionH }]}
          pointerEvents="box-none"
        >
          <QuickBtn
            icon="🔥"
            label="Streak"
            hasBadge={!streakClaimed && streakPending !== null}
            onPress={() => setShowStreak(true)}
          />
          <QuickBtn
            icon="🎰"
            label="Roue"
            hasBadge={canSpin}
            onPress={() => setShowSpin(true)}
          />
          <QuickBtn
            svgIcon={<ChestSVG level={chest?.level ?? 'bronze'} size={28} />}
            label={chest ? 'Coffre' : lastChestGold !== null ? `+${lastChestGold}🪙` : 'Coffre'}
            hasBadge={chest !== null}
            disabled={chest === null}
            onPress={() => { if (chest) setShowChest(true) }}
          />
        </View>
      )}

      {/* ── Modales ──────────────────────────────────────────────── */}
      {showLangModal && (
        <LangModal lang={lang} onSelect={setLang} onClose={() => setShowLangModal(false)} />
      )}
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
        <SpinWheelModal canSpin={canSpin} onSpin={spin} onClose={() => setShowSpin(false)} />
      )}
      {showChest && chest && (
        <DailyChestModal
          level={chest.level}
          gold={chest.gold}
          onOpen={handleOpenChest}
          onClose={() => setShowChest(false)}
          onOpened={showChestToast}
        />
      )}

      {/* Toast coffre : affiché 3 s après fermeture de la modale */}
      {toastGold !== null && (
        <Animated.View
          style={[s.chestToast, {
            opacity: toastAnim,
            transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
          }]}
          pointerEvents="none"
        >
          <Text style={s.chestToastTxt}>🎉 +{toastGold} 🪙</Text>
        </Animated.View>
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

  chestToast: {
    position: 'absolute', bottom: 88, alignSelf: 'center',
    backgroundColor: 'rgba(13,13,26,0.94)',
    borderRadius: 22, paddingVertical: 12, paddingHorizontal: 24,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.45)',
    zIndex: 99,
  },
  chestToastTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: '#C9A227' },

  // QuickBar — absolu dans SafeAreaView, centré sur la zone d'action
  quickBar: {
    position: 'absolute',
    right: 6,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    zIndex: 20,
  },

  // Scrollable
  scroll:        { flex: 1 },
  scrollContent: { gap: 16, paddingBottom: 28, paddingTop: 8 },

  // Hero
  hero:     { alignItems: 'center', paddingTop: 16, paddingBottom: 12, gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  platformTitle: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 38, color: C.bone, letterSpacing: 1.5,
    textShadowColor: 'rgba(201,162,39,0.45)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12,
  },
  platformTM: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.boneOff, letterSpacing: 2, marginBottom: 8 },
  platformAr: {
    fontFamily: 'ReemKufi_700Bold', fontSize: 24, color: C.brass, letterSpacing: 1,
    textShadowColor: 'rgba(201,162,39,0.30)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
  },
  divider: { width: 40, height: 1, backgroundColor: 'rgba(201,162,39,0.25)', marginVertical: 4 },
  helloTxt: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: 'rgba(244,236,216,0.50)' },

  // Règles & crédits sous le titre
  titleLinksRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    alignSelf: 'stretch', gap: 2,
  },
  titleLinkBtn: { paddingVertical: 4, paddingHorizontal: 6 },
  titleLinkTxt: {
    fontFamily: 'Cairo_400Regular', fontSize: 11, color: 'rgba(244,236,216,0.28)',
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  titleLinkSep: { color: 'rgba(244,236,216,0.14)', fontSize: 11 },

  // Barre profil (connecté)
  profileBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    alignSelf: 'stretch', marginBottom: 4,
  },
  profileLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profileRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profileUsername: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.bone, letterSpacing: 0.3, maxWidth: 110,
  },
  goldPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 13,
    backgroundColor: 'rgba(201,162,39,0.12)', borderWidth: 1, borderColor: 'rgba(201,162,39,0.30)',
  },
  goldCoin:   { fontSize: 13 },
  goldAmount: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.brass },
  globeBtn:   { padding: 5 },
  globeIcon:  { fontSize: 19 },

  // Ligne invité
  guestRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    alignSelf: 'stretch', marginBottom: 4,
  },

  // 3 boutons d'action
  actionSection: { gap: 12 },

  actionBtnOnline: {
    flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 16,
    paddingVertical: 20, paddingHorizontal: 22,
    backgroundColor: C.brass,
    shadowColor: C.brass, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.45, shadowRadius: 12, elevation: 8,
  },
  actionBtnFriend: {
    flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 16,
    paddingVertical: 18, paddingHorizontal: 22,
    borderWidth: 1.5, borderColor: C.brass, backgroundColor: 'rgba(201,162,39,0.07)',
  },
  actionBtnTraining: {
    flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 16,
    paddingVertical: 16, paddingHorizontal: 22,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(244,236,216,0.18)',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  actionBtnIcon:     { fontSize: 26 },
  trainingIcon:      { opacity: 0.70 },
  actionBtnBody:     { gap: 2 },
  actionBtnLblDark:  { fontFamily: 'Cairo_600SemiBold', fontSize: 17, color: C.ink, letterSpacing: 0.3 },
  actionBtnSubDark:  { fontFamily: 'Cairo_400Regular', fontSize: 12, color: 'rgba(28,38,34,0.60)' },
  actionBtnLbl:      { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.brass, letterSpacing: 0.3 },
  actionBtnSub:      { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.boneOff },
  actionBtnLblMuted: { fontFamily: 'Cairo_400Regular', fontSize: 15, color: 'rgba(244,236,216,0.45)', letterSpacing: 0.3 },
  actionBtnSubMuted: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: 'rgba(244,236,216,0.28)' },

  // Liens texte (sans règles/crédits)
  textLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 4 },
  linkSep:   { color: 'rgba(244,236,216,0.18)', fontSize: 12 },
  linkBtn:   { paddingVertical: 8, paddingHorizontal: 10 },
  linkTxt:   {
    fontFamily: 'Cairo_400Regular', fontSize: 12, color: 'rgba(244,236,216,0.26)',
    letterSpacing: 1, textTransform: 'uppercase',
  },

  // Pied
  footer:    { alignItems: 'center', paddingTop: 4, gap: 4 },
  footerTxt: { fontSize: 10, color: 'rgba(244,236,216,0.14)', letterSpacing: 1, textTransform: 'uppercase' },
  author:    { fontFamily: 'Cairo_400Regular', fontSize: 11, color: 'rgba(244,236,216,0.28)', letterSpacing: 0.3, textDecorationLine: 'underline' },

  // Modal reconnexion
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(13,13,26,0.90)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  modalCard: {
    width: '100%', maxWidth: 360, backgroundColor: C.night, borderRadius: 16, padding: 22, gap: 10,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)',
  },
  modalTitle:         { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.boneOff, letterSpacing: 1.5, textTransform: 'uppercase' },
  resumeText:         { fontFamily: 'Cairo_400Regular', fontSize: 15, color: C.bone, lineHeight: 22 },
  modalActions:       { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 6 },
  modalCancel:        { paddingVertical: 12, paddingHorizontal: 16 },
  modalCancelTxt:     { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff },
  modalSave:          { backgroundColor: C.brass, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 22 },
  modalSaveTxt:       { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.ink },
  btnDisabledOpacity: { opacity: 0.4 },
})

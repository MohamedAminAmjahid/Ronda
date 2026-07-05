import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, type Href } from 'expo-router'
import { useAuth } from '../firebase/auth'
import { useI18n } from '../i18n/useI18n'
import { useProfile } from '../profile/useProfile'
import { useDailyQuests } from '../quests/useQuests'
import { useDailyBonus } from '../hooks/useDailyBonus'
import { QUESTS, type QuestKey } from '../quests/quests'

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
  green:   '#27AE60',
} as const

const QUEST_META: Record<QuestKey, { icon: string; labelKey: 'questWinGame' | 'questPlayOnline' | 'questSendGift' }> = {
  winGame:    { icon: '🏆', labelKey: 'questWinGame'    },
  playOnline: { icon: '🌐', labelKey: 'questPlayOnline' },
  sendGift:   { icon: '🎁', labelKey: 'questSendGift'   },
}

const QUEST_ACTION: Record<QuestKey, { label: string; href: Href }> = {
  winGame:    { label: 'Jouer',          href: '/play'      as Href },
  playOnline: { label: 'Jouer en ligne', href: '/online'    as Href },
  sendGift:   { label: 'Envoyer',        href: '/gold-shop' as Href },
}

// ── Compte à rebours jusqu'à minuit UTC ─────────────────────────────────────────

function msToMidnightUTC(): number {
  const now  = new Date()
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)
  return next - now.getTime()
}
function fmtHMS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

// ── Bouton « Réclamer » doré pulsant ───────────────────────────────────────────

function ClaimButton({ label, onPress }: { label: string; onPress: () => void }) {
  const pulse = useRef(new Animated.Value(1)).current
  useEffect(() => {
    // Driver JS : sur le web (PWA), une boucle en driver natif s'arrête après un tour.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 620, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 1,    duration: 620, useNativeDriver: false }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])
  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <TouchableOpacity style={s.claimBtn} onPress={onPress} activeOpacity={0.85}>
        <Text style={s.claimBtnTxt}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  )
}

interface Props {
  onBack: () => void
}

export function DailyQuestsScreen({ onBack }: Props) {
  const { t } = useI18n()
  const { user, loading: authLoading } = useAuth()
  const { gold } = useProfile()
  const { quests, claim } = useDailyQuests()
  const {
    pending:        streakPending,
    alreadyClaimed: streakClaimed,
    claim:          claimStreak,
    streak:         loginStreak,
  } = useDailyBonus()

  const [streakDone, setStreakDone] = useState(false)

  // Compte à rebours (rafraîchi chaque seconde) jusqu'au reset 00:00 UTC.
  const [remaining, setRemaining] = useState(msToMidnightUTC())
  useEffect(() => {
    const id = setInterval(() => setRemaining(msToMidnightUTC()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!authLoading && !user) {
    return (
      <SafeAreaView style={[s.root, { justifyContent: 'center' }]}>
        <View style={s.center}>
          <Text style={s.empty}>{t('questsLoginRequired')}</Text>
          <TouchableOpacity style={s.btnPrimary} onPress={onBack}>
            <Text style={s.btnPrimaryTxt}>{t('backShort')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const handleCollectStreak = async () => {
    if (streakDone || streakClaimed) return
    await claimStreak()
    setStreakDone(true)
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>{t('back')}</Text>
          </TouchableOpacity>
          <View style={s.headerRow}>
            <Text style={s.title}>{t('dailyQuests')}</Text>
            <View style={s.goldPill}>
              <Text style={s.goldCoin}>🪙</Text>
              <Text style={s.goldAmount}>{gold}</Text>
            </View>
          </View>
          <Text style={s.resetTxt}>⏳ Réinitialisation dans {fmtHMS(remaining)}</Text>
        </View>

        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>

          {/* ── Connexion journalière (streak) ────────────────── */}
          <View style={s.streakCard}>
            <Text style={s.streakEmoji}>🔥</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.streakTitle}>{t('streakTitle')}</Text>
              <Text style={s.streakDays}>{t('streakDays').replace('{n}', String(loginStreak))}</Text>
            </View>
            {(streakClaimed || streakDone) ? (
              <View style={[s.badge, s.badgeDone]}>
                <Text style={[s.badgeTxt, s.badgeTxtDone]}>✅ Réclamé</Text>
              </View>
            ) : streakPending ? (
              <ClaimButton
                label={`🎁 Réclamer +${streakPending.goldToday} 🪙`}
                onPress={() => { void handleCollectStreak() }}
              />
            ) : null}
          </View>

          {/* ── Quêtes du jour ───────────────────────────────── */}
          {QUESTS.map((q) => {
            const meta      = QUEST_META[q.key]
            const action    = QUEST_ACTION[q.key]
            const completed = quests?.completed[q.key] ?? false
            const claimed   = quests?.claimed[q.key]   ?? false
            return (
              <View key={q.key} style={[s.questRow, (completed || claimed) && s.questRowDone]}>
                <Text style={s.questIcon}>{meta.icon}</Text>
                <View style={s.questBody}>
                  <Text style={s.questLabel}>{t(meta.labelKey)}</Text>
                  <Text style={s.questReward}>+{q.reward} 🪙</Text>
                </View>
                {claimed ? (
                  <View style={[s.badge, s.badgeDone]}>
                    <Text style={[s.badgeTxt, s.badgeTxtDone]}>✅ Réclamé</Text>
                  </View>
                ) : completed ? (
                  <ClaimButton
                    label={`🎁 Réclamer +${q.reward} 🪙`}
                    onPress={() => claim(q.key)}
                  />
                ) : (
                  <TouchableOpacity
                    style={s.actionBtn}
                    onPress={() => router.push(action.href)}
                    activeOpacity={0.80}
                  >
                    <Text style={s.actionBtnTxt}>{action.label}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )
          })}

          <Text style={s.autoHint}>{t('questAutoReward')}</Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.table, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 460, paddingHorizontal: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 28 },

  header:    { paddingTop: 16, paddingBottom: 8, gap: 8 },
  backBtn:   { alignSelf: 'flex-start', paddingVertical: 6 },
  backTxt:   { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:     { fontFamily: 'Cairo_600SemiBold', fontSize: 24, color: C.bone, letterSpacing: 1, textTransform: 'uppercase' },
  resetTxt:  { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.brass, letterSpacing: 0.3 },
  goldPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.25)', borderWidth: 1, borderColor: 'rgba(201,162,39,0.35)',
  },
  goldCoin:   { fontSize: 14 },
  goldAmount: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.brass },

  body: { paddingVertical: 12, gap: 12, paddingBottom: 28 },

  // Streak card
  streakCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.deep, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.22)',
  },
  streakEmoji: { fontSize: 30 },
  streakTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.bone },
  streakDays:  { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.brass, marginTop: 2 },

  // Quest rows
  questRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.15)',
  },
  questRowDone: { borderColor: 'rgba(39,174,96,0.5)', backgroundColor: 'rgba(39,174,96,0.10)' },
  questIcon:    { fontSize: 26 },
  questBody:    { flex: 1, gap: 2 },
  questLabel:   { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.bone },
  questReward:  { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.brass },

  // Badges (réclamé)
  badge:        { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  badgeDone:    { backgroundColor: 'rgba(39,174,96,0.20)', borderWidth: 1, borderColor: 'rgba(39,174,96,0.45)' },
  badgeTxt:     { fontFamily: 'Cairo_600SemiBold', fontSize: 12 },
  badgeTxtDone: { color: C.green },

  // Bouton « Réclamer » (doré, plein)
  claimBtn: {
    backgroundColor: C.brass, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    shadowColor: C.brass, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 8, elevation: 6,
  },
  claimBtnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 12, color: C.ink, letterSpacing: 0.2 },

  // Boutons d'action (non commencé)
  actionBtn: {
    backgroundColor: 'rgba(201,162,39,0.14)',
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.40)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
  },
  actionBtnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 12, color: C.brass },

  autoHint: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.boneOff, textAlign: 'center', marginTop: 4, lineHeight: 18 },

  btnPrimary:    { backgroundColor: C.brass, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  btnPrimaryTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.ink },
  empty:         { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff, textAlign: 'center', lineHeight: 20 },
})

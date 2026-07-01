import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../firebase/auth'
import { useI18n } from '../i18n/useI18n'
import { useProfile } from '../profile/useProfile'
import { useDailyQuests } from '../quests/useQuests'
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
  winGame:    { icon: '🏆', labelKey: 'questWinGame' },
  playOnline: { icon: '🌐', labelKey: 'questPlayOnline' },
  sendGift:   { icon: '🎁', labelKey: 'questSendGift' },
}

interface Props {
  onBack: () => void
}

export function DailyQuestsScreen({ onBack }: Props) {
  const { t } = useI18n()
  const { user, loading: authLoading } = useAuth()
  const { gold } = useProfile()
  const quests = useDailyQuests()

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

  const streak = quests?.streak ?? 0

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>
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
        </View>

        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>

          {/* Streak */}
          <View style={s.streakCard}>
            <Text style={s.streakEmoji}>🔥</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.streakTitle}>{t('streakTitle')}</Text>
              <Text style={s.streakDays}>{t('streakDays').replace('{n}', String(streak))}</Text>
            </View>
            <Text style={s.streakHint}>{t('streakHint')}</Text>
          </View>

          {/* Quêtes */}
          {QUESTS.map((q) => {
            const meta = QUEST_META[q.key]
            const done = quests?.completed[q.key] ?? false
            return (
              <View key={q.key} style={[s.questRow, done && s.questRowDone]}>
                <Text style={s.questIcon}>{meta.icon}</Text>
                <View style={s.questBody}>
                  <Text style={s.questLabel}>{t(meta.labelKey)}</Text>
                  <Text style={s.questReward}>+{q.reward} 🪙</Text>
                </View>
                <View style={[s.badge, done ? s.badgeDone : s.badgePending]}>
                  <Text style={[s.badgeTxt, done ? s.badgeTxtDone : s.badgeTxtPending]}>
                    {done ? t('questCompleted') : t('questPending')}
                  </Text>
                </View>
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

  header:   { paddingTop: 16, paddingBottom: 8, gap: 8 },
  backBtn:  { alignSelf: 'flex-start', paddingVertical: 6 },
  backTxt:  { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:    { fontFamily: 'Cairo_600SemiBold', fontSize: 24, color: C.bone, letterSpacing: 1, textTransform: 'uppercase' },
  goldPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.25)', borderWidth: 1, borderColor: 'rgba(201,162,39,0.35)',
  },
  goldCoin:   { fontSize: 14 },
  goldAmount: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.brass },

  body: { paddingVertical: 12, gap: 12, paddingBottom: 28 },

  streakCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.deep, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.22)',
  },
  streakEmoji: { fontSize: 30 },
  streakTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.bone },
  streakDays:  { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.brass, marginTop: 2 },
  streakHint:  { fontFamily: 'Cairo_400Regular', fontSize: 10, color: C.boneOff, maxWidth: 96, textAlign: 'right' },

  questRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.15)',
  },
  questRowDone: { borderColor: 'rgba(39,174,96,0.5)', backgroundColor: 'rgba(39,174,96,0.10)' },
  questIcon:  { fontSize: 26 },
  questBody:  { flex: 1, gap: 2 },
  questLabel: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.bone },
  questReward: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.brass },

  badge:        { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  badgeDone:    { backgroundColor: 'rgba(39,174,96,0.20)', borderWidth: 1, borderColor: 'rgba(39,174,96,0.45)' },
  badgePending: { backgroundColor: 'rgba(244,236,216,0.08)', borderWidth: 1, borderColor: 'rgba(244,236,216,0.15)' },
  badgeTxt:        { fontFamily: 'Cairo_600SemiBold', fontSize: 12 },
  badgeTxtDone:    { color: C.green },
  badgeTxtPending: { color: C.boneOff },

  autoHint: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.boneOff, textAlign: 'center', marginTop: 4, lineHeight: 18 },

  btnPrimary:    { backgroundColor: C.brass, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  btnPrimaryTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.ink },
  empty:         { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff, textAlign: 'center', lineHeight: 20 },
})

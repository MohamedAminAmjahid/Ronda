import { useEffect, useRef } from 'react'
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Animated, ScrollView,
} from 'react-native'
import { STREAK_REWARDS, type DailyBonusState } from '../hooks/useDailyBonus'
import { useI18n } from '../i18n/useI18n'

const C = {
  bg:      '#0D0D1A',
  brass:   '#C9A227',
  brassDim:'rgba(201,162,39,0.18)',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.45)',
  ink:     '#1C2622',
  muted:   'rgba(244,236,216,0.20)',
} as const

interface Props {
  streak:         number
  pending:        DailyBonusState | null
  alreadyClaimed: boolean
  onClaim:        () => Promise<void>
  onClose:        () => void
}

export function StreakInfoModal({ streak, pending, alreadyClaimed, onClaim, onClose }: Props) {
  const { t } = useI18n()

  const scale   = useRef(new Animated.Value(0.7)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1, friction: 6, tension: 180, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start()
  }, [scale, opacity])

  const goldToday = pending?.goldToday ?? STREAK_REWARDS[(streak - 1) % 7]

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Animated.View style={[s.card, { opacity, transform: [{ scale }] }]}>

          {/* ✕ Fermer */}
          <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={10}>
            <Text style={s.closeTxt}>✕</Text>
          </TouchableOpacity>

          {/* En-tête streak */}
          <View style={s.header}>
            <Text style={s.fire}>🔥</Text>
            <Text style={s.streakNum}>{t('dailyStreakOf').replace('{n}', String(streak))}</Text>
            <Text style={s.title}>{t('dailyBonusTitle')}</Text>
          </View>

          {/* Grille des 7 jours */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.daysRow}
          >
            {STREAK_REWARDS.map((reward, idx) => {
              const day     = idx + 1
              const isPast  = day < streak
              const isToday = day === streak
              const isLast  = day === 7

              return (
                <View
                  key={day}
                  style={[s.dayBox, isPast && s.dayBoxPast, isToday && s.dayBoxToday]}
                >
                  {isLast && !isPast && (
                    <Text style={s.jackpotTag}>{t('dailyJackpot')}</Text>
                  )}
                  <Text style={[s.dayLabel, isToday && s.dayLabelToday]}>
                    {t('dailyDay').replace('{n}', String(day))}
                  </Text>
                  <Text style={s.dayIcon}>
                    {isPast ? '✓' : isLast ? '💎' : '🪙'}
                  </Text>
                  <Text style={[s.dayReward, isToday && s.dayRewardToday, isPast && s.dayRewardPast]}>
                    +{reward}
                  </Text>
                </View>
              )
            })}
          </ScrollView>

          {/* Banner récompense du jour */}
          <View style={s.todayBanner}>
            <Text style={s.todayLabel}>{t('dailyTodayReward')}</Text>
            <Text style={s.todayAmount}>🪙 +{goldToday}</Text>
          </View>

          {/* Bouton claim ou déjà récupéré */}
          {alreadyClaimed ? (
            <View style={[s.claimBtn, s.claimBtnClaimed]}>
              <Text style={s.claimBtnClaimedTxt}>{t('streakAlreadyClaimed')}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={s.claimBtn}
              onPress={async () => { await onClaim(); onClose() }}
              activeOpacity={0.85}
            >
              <Text style={s.claimTxt}>
                {t('streakClaim').replace('{n}', String(goldToday))}
              </Text>
            </TouchableOpacity>
          )}

        </Animated.View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(9,13,26,0.88)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20,
  },
  card: {
    width: '100%', maxWidth: 400, backgroundColor: C.bg, borderRadius: 22,
    padding: 24, gap: 20, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.30)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 12,
  },
  closeBtn: {
    position: 'absolute', top: 14, right: 16,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(244,236,216,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: 'rgba(244,236,216,0.45)' },

  header:    { alignItems: 'center', gap: 4 },
  fire:      { fontSize: 40 },
  streakNum: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.brass, letterSpacing: 1.5, textTransform: 'uppercase' },
  title:     { fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: C.bone },

  daysRow: { gap: 8, paddingHorizontal: 2 },
  dayBox: {
    width: 52, alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 4,
    borderRadius: 12, backgroundColor: C.muted,
    borderWidth: 1, borderColor: 'rgba(244,236,216,0.10)',
  },
  dayBoxPast:  { backgroundColor: 'rgba(201,162,39,0.10)', borderColor: 'rgba(201,162,39,0.20)' },
  dayBoxToday: {
    backgroundColor: C.brassDim, borderColor: C.brass, borderWidth: 2,
    shadowColor: C.brass, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 8, elevation: 6,
  },
  jackpotTag: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 7, color: C.brass,
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: -2,
  },
  dayLabel:       { fontFamily: 'Cairo_400Regular', fontSize: 10, color: C.boneOff },
  dayLabelToday:  { color: C.brass, fontFamily: 'Cairo_600SemiBold' },
  dayIcon:        { fontSize: 18 },
  dayReward:      { fontFamily: 'Cairo_600SemiBold', fontSize: 11, color: C.boneOff },
  dayRewardToday: { color: C.brass, fontSize: 12 },
  dayRewardPast:  { color: 'rgba(201,162,39,0.45)' },

  todayBanner: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', backgroundColor: 'rgba(201,162,39,0.10)',
    borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.22)',
  },
  todayLabel:  { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff },
  todayAmount: { fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: C.brass },

  claimBtn: {
    width: '100%', backgroundColor: C.brass, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: C.brass, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  claimTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 17, color: C.ink, letterSpacing: 0.3 },
  claimBtnClaimed: {
    backgroundColor: 'rgba(201,162,39,0.15)',
    shadowOpacity: 0,
    elevation: 0,
  },
  claimBtnClaimedTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 17, color: C.brass, letterSpacing: 0.3 },
})

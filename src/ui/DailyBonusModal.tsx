import { useEffect, useRef } from 'react'
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Animated, useWindowDimensions,
} from 'react-native'
import { streakReward, type DailyBonusState } from '../hooks/useDailyBonus'
import { useI18n } from '../i18n/useI18n'

const C = {
  bg:      '#0D0D1A',
  deep:    '#09402F',
  brass:   '#C9A227',
  brassDim:'rgba(201,162,39,0.18)',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.45)',
  ink:     '#1C2622',
  muted:   'rgba(244,236,216,0.20)',
} as const

interface Props {
  bonus:   DailyBonusState
  onClaim: () => Promise<void>
}

export function DailyBonusModal({ bonus, onClaim }: Props) {
  const { t } = useI18n()
  const { width } = useWindowDimensions()

  // Animation d'entrée de la monnaie.
  const scale  = useRef(new Animated.Value(0.7)).current
  const opacity= useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1, friction: 6, tension: 180, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start()
  }, [scale, opacity])

  const { streak, goldToday } = bonus

  // Fenêtre glissante de 7 jours centrée sur aujourd'hui (streak-3 → streak+3),
  // bornée à J1 minimum. Affiche le vrai numéro de jour même au-delà de 7.
  const start = Math.max(1, streak - 3)
  const days  = Array.from({ length: 7 }, (_, i) => start + i)

  return (
    <Modal visible transparent animationType="fade">
      <View style={s.backdrop}>
        <Animated.View style={[s.card, { opacity, transform: [{ scale }], maxWidth: Math.min(340, width - 32) }]}>

          {/* En-tête streak */}
          <View style={s.header}>
            <Text style={s.fire}>🔥</Text>
            <Text style={s.streakNum}>{t('dailyStreakOf').replace('{n}', String(streak))}</Text>
            <Text style={s.title}>{t('dailyBonusTitle')}</Text>
          </View>

          {/* Grille des 7 jours (fenêtre centrée sur aujourd'hui), 2 rangées si besoin */}
          <View style={s.daysRow}>
            {days.map((day) => {
              const reward   = streakReward(day)
              const isPast   = day < streak
              const isToday  = day === streak
              const isMaxed  = day >= 7   // palier plafond (750 🪙)

              return (
                <View
                  key={day}
                  style={[
                    s.dayBox,
                    isPast  && s.dayBoxPast,
                    isToday && s.dayBoxToday,
                  ]}
                >
                  {isMaxed && isToday && (
                    <Text style={s.jackpotTag}>{t('dailyJackpot')}</Text>
                  )}
                  <Text style={[s.dayLabel, isToday && s.dayLabelToday]}>
                    {t('dailyDay').replace('{n}', String(day))}
                  </Text>
                  <Text style={s.dayIcon}>
                    {isPast ? '✓' : isMaxed ? '💎' : '🪙'}
                  </Text>
                  <Text style={[s.dayReward, isToday && s.dayRewardToday, isPast && s.dayRewardPast]}>
                    +{reward}
                  </Text>
                </View>
              )
            })}
          </View>

          {/* Récompense du jour */}
          <View style={s.todayBanner}>
            <Text style={s.todayLabel}>{t('dailyTodayReward')}</Text>
            <Text style={s.todayAmount}>🪙 +{goldToday}</Text>
          </View>

          {/* Bouton claim */}
          <TouchableOpacity style={s.claimBtn} onPress={onClaim} activeOpacity={0.85}>
            <Text style={s.claimTxt}>
              {t('dailyClaim').replace('{n}', String(goldToday))}
            </Text>
          </TouchableOpacity>

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
    width: '100%', backgroundColor: C.bg, borderRadius: 22,
    padding: 24, gap: 20, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.30)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 12,
  },

  header:     { alignItems: 'center', gap: 4 },
  fire:       { fontSize: 40 },
  streakNum:  { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.brass, letterSpacing: 1.5, textTransform: 'uppercase' },
  title:      { fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: C.bone },

  // Grille jours : rangée qui s'enroule (4 + 3) sur petit écran
  daysRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'center', gap: 8,
  },
  dayBox: {
    width: 38, alignItems: 'center', gap: 3, paddingVertical: 8, paddingHorizontal: 2,
    borderRadius: 10, backgroundColor: C.muted,
    borderWidth: 1, borderColor: 'rgba(244,236,216,0.10)',
  },
  dayBoxPast: {
    backgroundColor: 'rgba(201,162,39,0.10)',
    borderColor: 'rgba(201,162,39,0.20)',
  },
  dayBoxToday: {
    backgroundColor: C.brassDim,
    borderColor: C.brass,
    borderWidth: 2,
    shadowColor: C.brass, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 8, elevation: 6,
  },
  jackpotTag: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 6, color: C.brass,
    letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: -2,
  },
  dayLabel:       { fontFamily: 'Cairo_400Regular', fontSize: 8.5, color: C.boneOff },
  dayLabelToday:  { color: C.brass, fontFamily: 'Cairo_600SemiBold' },
  dayIcon:        { fontSize: 15 },
  dayReward:      { fontFamily: 'Cairo_600SemiBold', fontSize: 9.5, color: C.boneOff },
  dayRewardToday: { color: C.brass, fontSize: 10.5 },
  dayRewardPast:  { color: 'rgba(201,162,39,0.45)' },

  // Banner récompense du jour
  todayBanner: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', backgroundColor: 'rgba(201,162,39,0.10)',
    borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.22)',
  },
  todayLabel:  { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff },
  todayAmount: { fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: C.brass },

  // Bouton
  claimBtn: {
    width: '100%', backgroundColor: C.brass, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: C.brass, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  claimTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 17, color: C.ink, letterSpacing: 0.3 },
})

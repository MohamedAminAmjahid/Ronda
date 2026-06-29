import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useProfile } from '../profile/useProfile'
import { fetchWeeklyLeaderboard, fetchUserLeague, type WeeklyEntry } from '../online/client'
import { useI18n } from '../i18n/useI18n'

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  clay:    '#B5532A',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
} as const

// Ligues par ordre croissant (doit correspondre au serveur).
const LEAGUES = ['Bronze', 'Argent', 'Or', 'Platine', 'Diamond', 'Master', 'Légende'] as const
const TOP_N = 3 // promotion / relégation

const MEDALS = ['🥇', '🥈', '🥉']

/** Millisecondes jusqu'au prochain lundi 00:00 UTC. */
function msToNextMondayUTC(): number {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = next.getUTCDay() // 0 = dimanche … 6 = samedi
  let add = (8 - day) % 7 // jours jusqu'au prochain lundi
  if (add === 0) add = 7 // déjà lundi → la semaine prochaine
  next.setUTCDate(next.getUTCDate() + add)
  return next.getTime() - now.getTime()
}

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

interface Props {
  onBack: () => void
}

export function LeaderboardScreen({ onBack }: Props) {
  const { username } = useProfile()
  const { t } = useI18n()

  const [userLeague, setUserLeague] = useState<string>('Bronze')
  const [selected, setSelected] = useState<string>('Bronze')
  const [entries, setEntries] = useState<WeeklyEntry[]>([])
  const [myEntries, setMyEntries] = useState<WeeklyEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(msToNextMondayUTC())

  // Compte à rebours jusqu'au reset.
  useEffect(() => {
    const id = setInterval(() => setCountdown(msToNextMondayUTC()), 1000)
    return () => clearInterval(id)
  }, [])

  // Ligue du joueur (et sélection initiale) au montage.
  useEffect(() => {
    if (!username) return
    let cancelled = false
    void (async () => {
      try {
        const league = await fetchUserLeague(username)
        if (cancelled) return
        setUserLeague(league)
        setSelected(league)
        const mine = await fetchWeeklyLeaderboard(league)
        if (!cancelled) setMyEntries(mine)
      } catch {
        if (!cancelled) setUserLeague('Bronze')
      }
    })()
    return () => { cancelled = true }
  }, [username])

  // Classement de la ligue sélectionnée.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const data = await fetchWeeklyLeaderboard(selected)
        if (!cancelled) setEntries(data)
      } catch {
        if (!cancelled) setError(t('leaderboardError'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [selected])

  // Rang du joueur dans sa propre ligue (pour l'encart).
  const myRank = myEntries.findIndex((e) => e.username === username)
  const myTotal = myEntries.length
  const progression = (() => {
    if (myRank < 0) return t('noGamesThisWeek')
    const rank = myRank + 1
    if (rank <= TOP_N && userLeague !== 'Légende') return t('rankPromotion').replace('{rank}', String(rank)).replace('{total}', String(myTotal))
    if (rank > myTotal - TOP_N && userLeague !== 'Bronze') return t('rankRelegation').replace('{rank}', String(rank)).replace('{total}', String(myTotal))
    return t('rankSimple').replace('{rank}', String(rank)).replace('{total}', String(myTotal))
  })()

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>
        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>{t('back')}</Text>
          </TouchableOpacity>
          <View style={s.headerRow}>
            <Text style={s.title}>{t('leaderboard')}</Text>
            <Text style={s.countdown}>⏳ {formatCountdown(countdown)}</Text>
          </View>
        </View>

        {/* Sélecteur de ligue */}
        <View style={s.tabsWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
            {LEAGUES.map((lg) => {
              const active = lg === selected
              const isMine = lg === userLeague
              return (
                <TouchableOpacity
                  key={lg}
                  style={[s.tab, active && s.tabActive, isMine && !active && s.tabMine]}
                  onPress={() => setSelected(lg)}
                >
                  <Text style={[s.tabTxt, (active || isMine) && s.tabTxtHi]}>{lg}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>

        {/* Liste */}
        <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
          {loading ? (
            <ActivityIndicator color={C.brass} style={{ marginTop: 30 }} />
          ) : error ? (
            <Text style={s.empty}>{error}</Text>
          ) : entries.length === 0 ? (
            <Text style={s.empty}>{t('noLeaderboardPlayers')}</Text>
          ) : (
            entries.map((e, i) => {
              const me = e.username === username
              return (
                <View key={e.username} style={[s.row, me && s.rowMe]}>
                  <Text style={s.rank}>{i < 3 ? MEDALS[i] : `${i + 1}`}</Text>
                  <Text style={[s.name, me && s.nameMe]} numberOfLines={1}>
                    {e.username}{me ? ' ' + t('youParens') : ''}
                  </Text>
                  <Text style={s.wagered}>🪙 {e.gold_wagered}</Text>
                </View>
              )
            })
          )}
        </ScrollView>

        {/* Encart « Ta ligue » */}
        <View style={s.myCard}>
          <View style={s.myCardHead}>
            <Text style={s.myCardLabel}>{t('yourLeague')}</Text>
            <View style={s.leagueBadge}>
              <Text style={s.leagueBadgeTxt}>{userLeague}</Text>
            </View>
          </View>
          <Text style={s.myCardProg}>{progression}</Text>
        </View>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.table, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 480, paddingHorizontal: 18 },

  header: { paddingTop: 16, paddingBottom: 8, gap: 8 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6 },
  backTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 24, color: C.bone,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  countdown: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.brass },

  tabsWrap: { paddingVertical: 8 },
  tabs: { gap: 8, paddingHorizontal: 2 },
  tab: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.2)', borderWidth: 1, borderColor: 'rgba(244,236,216,0.12)',
  },
  tabActive: { backgroundColor: C.brass, borderColor: C.brass },
  tabMine: { borderColor: C.brass },
  tabTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.boneOff },
  tabTxtHi: { color: C.ink },

  list: { paddingVertical: 8, gap: 6, paddingBottom: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14,
  },
  rowMe: { borderWidth: 1.5, borderColor: C.brass, backgroundColor: 'rgba(201,162,39,0.12)' },
  rank: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.bone, width: 30, textAlign: 'center' },
  name: { flex: 1, fontFamily: 'Cairo_400Regular', fontSize: 15, color: C.bone },
  nameMe: { fontFamily: 'Cairo_600SemiBold', color: C.brass },
  wagered: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.brass },

  empty: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff, textAlign: 'center', marginTop: 30, lineHeight: 20 },

  myCard: {
    backgroundColor: C.deep, borderRadius: 14, padding: 16, gap: 8, marginVertical: 10,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.3)',
  },
  myCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  myCardLabel: {
    fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.boneOff,
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  leagueBadge: {
    backgroundColor: 'rgba(201,162,39,0.18)', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: C.brass,
  },
  leagueBadgeTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.brass },
  myCardProg: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.bone, lineHeight: 20 },
})

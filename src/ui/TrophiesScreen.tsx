import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../firebase/auth'
import { AvatarDisplay } from './ProfileScreen'
import { PlayerProfileModal } from './PlayerProfileModal'
import {
  getCachedTrophies, isTrophiesStale, refreshTrophies, subscribeTrophies, emptyTrophyEntries,
  type MetricKey, type TrophyEntry, type TrophiesData,
} from '../online/trophiesCache'
import { getUserById } from '../firebase/firestore'
import { useI18n } from '../i18n/useI18n'

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
} as const

const MEDALS = ['🥇', '🥈', '🥉']

type Entry = TrophyEntry

interface CardData {
  entries:      Entry[]        // classés, « moi » inclus s'il y figure
  meOutsideTop: Entry | null   // « moi », uniquement si absent du top (scope global)
}

const EMPTY_DATA: TrophiesData = { global: emptyTrophyEntries(), friends: emptyTrophyEntries(), hasFriends: false }

interface Props {
  onBack: () => void
}

export function TrophiesScreen({ onBack }: Props) {
  const { t } = useI18n()
  const { user } = useAuth()
  const myUid = user?.uid ?? null

  const [scope, setScope] = useState<'global' | 'friends'>('global')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<TrophiesData>(EMPTY_DATA)
  const [seeAll, setSeeAll] = useState<MetricKey | null>(null)
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)

  // ── « Mes tournois » : users/{uid}.trophies[] (écrit uniquement côté
  // serveur par distributePrizes — voir ronda-server/tournamentQueries.ts). ──
  const [tournamentTrophies, setTournamentTrophies] = useState<string[]>([])

  useEffect(() => {
    if (!myUid) { setTournamentTrophies([]); return }
    let cancelled = false
    void getUserById(myUid).then((u) => {
      if (!cancelled && u) setTournamentTrophies(u.trophies)
    })
    return () => { cancelled = true }
  }, [myUid])

  // Affichage instantané depuis le cache (même périmé), puis refresh
  // silencieux en arrière-plan si absent ou dépassé les 10 min de TTL. Le
  // spinner plein écran ne s'affiche que si on n'a RIEN à montrer.
  useEffect(() => {
    let cancelled = false
    const cached = getCachedTrophies(myUid)
    if (cached) {
      setData(cached)
      setLoading(false)
    }
    if (isTrophiesStale(myUid)) {
      if (!cached) setLoading(true)
      void refreshTrophies(myUid).then(() => {
        if (cancelled) return
        const fresh = getCachedTrophies(myUid)
        if (fresh) { setData(fresh); setLoading(false) }
        else if (!cached) setLoading(false) // échec ET rien en cache → écran vide, pas d'erreur bloquante
      })
    }
    return () => { cancelled = true }
  }, [myUid])

  // Un refresh déclenché ailleurs (ex. preload au login) met aussi à jour cet écran.
  useEffect(() => {
    return subscribeTrophies(() => {
      const fresh = getCachedTrophies(myUid)
      if (fresh) setData(fresh)
    })
  }, [myUid])

  const dataFor = (metric: MetricKey): CardData => {
    if (scope === 'friends') return { entries: data.friends[metric], meOutsideTop: null }
    const entries = data.global[metric]
    const inList = myUid ? entries.some((e) => e.uid === myUid) : true
    const meEntry = !inList ? data.friends[metric].find((e) => e.uid === myUid) ?? null : null
    return { entries, meOutsideTop: meEntry }
  }

  const openProfile = (uid: string, username: string) => {
    setSelectedUid(uid)
    setSelectedName(username)
  }

  const METRICS: { key: MetricKey; icon: string; title: string; format: (n: number) => string }[] = [
    { key: 'level',         icon: '⭐', title: t('trophyLevel'),  format: (n) => t('trophyLevelValue').replace('{n}', String(n)) },
    { key: 'gold',          icon: '💰', title: t('trophyGold'),   format: (n) => t('trophyGoldValue').replace('{n}', String(n)) },
    { key: 'gamesWon',      icon: '🎮', title: t('trophyWins'),   format: (n) => t('trophyWinsValue').replace('{n}', String(n)) },
    { key: 'currentStreak', icon: '🔥', title: t('trophyStreak'), format: (n) => t('trophyStreakValue').replace('{n}', String(n)) },
    { key: 'gamesPlayed',   icon: '🃏', title: t('trophyPlayed'), format: (n) => t('trophyPlayedValue').replace('{n}', String(n)) },
    { key: 'winRate',       icon: '🎯', title: t('trophyRate'),   format: (n) => t('trophyRateValue').replace('{n}', String(n)) },
    { key: 'weeklyWagered', icon: '💸', title: t('trophyWeekly'), format: (n) => t('trophyWeeklyValue').replace('{n}', String(n)) },
    { key: 'friendCount',   icon: '🤝', title: t('trophyFriends'), format: (n) => t('trophyFriendsValue').replace('{n}', String(n)) },
  ]

  const noFriends = scope === 'friends' && !data.hasFriends

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>
        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>{t('back')}</Text>
          </TouchableOpacity>
          <Text style={s.title}>🏆 {t('trophies')}</Text>
        </View>

        <View style={s.scopeTabs}>
          <TouchableOpacity
            style={[s.scopeTab, scope === 'global' && s.scopeTabActive]}
            onPress={() => setScope('global')}
          >
            <Text style={[s.scopeTabTxt, scope === 'global' && s.scopeTabTxtActive]}>
              🌍 {t('trophiesGlobal')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.scopeTab, scope === 'friends' && s.scopeTabActive]}
            onPress={() => setScope('friends')}
          >
            <Text style={[s.scopeTabTxt, scope === 'friends' && s.scopeTabTxtActive]}>
              👥 {t('trophiesFriends')}
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <TrophySkeletonGrid count={8} />
        ) : noFriends ? (
          <Text style={s.empty}>{t('trophyNoFriends')}</Text>
        ) : (
          <ScrollView contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
            {METRICS.map((m) => (
              <SummaryCard
                key={m.key}
                icon={m.icon}
                title={m.title}
                data={dataFor(m.key)}
                format={m.format}
                onPress={() => setSeeAll(m.key)}
              />
            ))}

            {/* ── Mes tournois (hebdomadaires) ─────────────────────────── */}
            <View style={s.tournamentSection}>
              <Text style={s.tournamentSectionTitle}>{t('myTournaments')}</Text>
              {tournamentTrophies.length === 0 ? (
                <Text style={s.tournamentEmpty}>{t('noTournamentWinYet')}</Text>
              ) : (
                <View style={s.tournamentBadgeList}>
                  {tournamentTrophies.map((tr) => (
                    <Text key={tr} style={s.tournamentBadge}>🏆 {tr}</Text>
                  ))}
                </View>
              )}
            </View>

            <View style={{ height: 8 }} />
          </ScrollView>
        )}
      </View>

      {seeAll && (() => {
        const metric = METRICS.find((m) => m.key === seeAll)!
        const data = dataFor(seeAll)
        return (
          <SeeAllModal
            title={`${metric.icon} ${metric.title}`}
            data={data}
            format={metric.format}
            myUid={myUid}
            onPressRow={openProfile}
            onClose={() => setSeeAll(null)}
          />
        )
      })()}

      <PlayerProfileModal
        visible={selectedUid !== null}
        uid={selectedUid ?? undefined}
        name={selectedName ?? undefined}
        onClose={() => { setSelectedUid(null); setSelectedName(null) }}
      />
    </SafeAreaView>
  )
}

// ── Card compacte : #1 uniquement, cliquable → ouvre le top 50 ─────────────────

function SummaryCard({
  icon, title, data, format, onPress,
}: {
  icon: string
  title: string
  data: CardData
  format: (n: number) => string
  onPress: () => void
}) {
  const { t } = useI18n()
  const top = data.entries[0]

  return (
    <TouchableOpacity style={s.summaryCard} activeOpacity={0.8} onPress={onPress}>
      <Text style={s.summaryTitle} numberOfLines={1}>{icon} {title}</Text>
      {top ? (
        <View style={s.summaryTopRow}>
          <AvatarDisplay
            type={(top.avatarType || 'initial') as 'initial' | 'emoji' | 'image'}
            initial={top.username[0]?.toUpperCase() ?? '?'}
            emoji={top.avatarEmoji ?? ''}
            image={top.avatarImage ?? ''}
            size={40}
          />
          <View style={{ flex: 1 }}>
            <Text style={s.summaryName} numberOfLines={1}>🥇 {top.username}</Text>
            <Text style={s.summaryValue} numberOfLines={1}>{format(top.value)}</Text>
          </View>
        </View>
      ) : (
        <Text style={s.emptySmall}>{t('trophyEmpty')}</Text>
      )}
      <Text style={s.summaryBadge}>{t('trophyTop50')}</Text>
    </TouchableOpacity>
  )
}

// ── Modale « Voir tout » (top 50) ────────────────────────────────────────────────

function SeeAllModal({
  title, data, format, myUid, onPressRow, onClose,
}: {
  title: string
  data: CardData
  format: (n: number) => string
  myUid: string | null
  onPressRow: (uid: string, username: string) => void
  onClose: () => void
}) {
  const { entries, meOutsideTop } = data
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={s.modalCard}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{title}</Text>
            <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={10}>
              <Text style={s.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.modalList} showsVerticalScrollIndicator={false}>
            {entries.slice(0, 50).map((e, i) => (
              <Row key={e.uid} rank={i + 1} entry={e} value={format(e.value)} me={e.uid === myUid} onPress={onPressRow} />
            ))}
            {meOutsideTop && (
              <Row rank={null} entry={meOutsideTop} value={format(meOutsideTop.value)} me onPress={onPressRow} />
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

// ── Ligne de classement ───────────────────────────────────────────────────────

function Row({
  rank, entry, value, me, onPress,
}: {
  rank: number | null
  entry: Entry
  value: string
  me: boolean
  onPress: (uid: string, username: string) => void
}) {
  const { t } = useI18n()
  return (
    <TouchableOpacity
      style={[s.row, me && s.rowMe]}
      activeOpacity={0.7}
      onPress={() => onPress(entry.uid, entry.username)}
    >
      <Text style={s.rank}>{rank === null ? '—' : rank <= 3 ? MEDALS[rank - 1] : `${rank}`}</Text>
      <AvatarDisplay
        type={(entry.avatarType || 'initial') as 'initial' | 'emoji' | 'image'}
        initial={entry.username[0]?.toUpperCase() ?? '?'}
        emoji={entry.avatarEmoji ?? ''}
        image={entry.avatarImage ?? ''}
        size={32}
      />
      <Text style={[s.name, me && s.nameMe]} numberOfLines={1}>
        {entry.username}{me ? ' ' + t('youParens') : ''}
      </Text>
      <Text style={s.value}>{value}</Text>
    </TouchableOpacity>
  )
}

// ── Grille skeleton (pulse) — affichée uniquement au tout premier chargement,
// jamais préchargé (pas de cache du tout à montrer). ────────────────────────

function TrophySkeletonCard() {
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

  return (
    <Animated.View style={[s.summaryCard, { opacity: pulse }]}>
      <View style={s.skeletonTitle} />
      <View style={s.summaryTopRow}>
        <View style={s.skeletonAvatar} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={s.skeletonLine} />
          <View style={[s.skeletonLine, { width: '50%' }]} />
        </View>
      </View>
      <View style={[s.skeletonLine, { width: 60, alignSelf: 'flex-end' }]} />
    </Animated.View>
  )
}

function TrophySkeletonGrid({ count }: { count: number }) {
  return (
    <ScrollView contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
      {Array.from({ length: count }).map((_, i) => <TrophySkeletonCard key={i} />)}
    </ScrollView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.table, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 480, paddingHorizontal: 18 },

  header: { paddingTop: 16, paddingBottom: 8, gap: 8 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6 },
  backTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  title: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 24, color: C.bone,
    letterSpacing: 1, textTransform: 'uppercase',
  },

  scopeTabs: { flexDirection: 'row', gap: 8, paddingVertical: 10 },
  scopeTab: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.2)', borderWidth: 1, borderColor: 'rgba(244,236,216,0.12)',
  },
  scopeTabActive: { backgroundColor: C.brass, borderColor: C.brass },
  scopeTabTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.boneOff },
  scopeTabTxtActive: { color: C.ink },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    paddingVertical: 4, rowGap: 12, paddingBottom: 24,
  },

  summaryCard: {
    width: '48%', minHeight: 160, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 16,
    padding: 14, borderWidth: 1, borderColor: 'rgba(201,162,39,0.20)', justifyContent: 'space-between',
  },
  summaryTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.bone },
  summaryTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryName: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.bone },
  summaryValue: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.brass, marginTop: 2 },
  summaryBadge: {
    alignSelf: 'flex-end', fontFamily: 'Cairo_600SemiBold', fontSize: 11, color: C.boneOff,
  },

  emptySmall: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff, paddingVertical: 8 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10,
  },
  rowMe: { borderWidth: 1.5, borderColor: C.brass, backgroundColor: 'rgba(201,162,39,0.14)' },
  rank: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.bone, width: 24, textAlign: 'center' },
  name: { flex: 1, fontFamily: 'Cairo_400Regular', fontSize: 13.5, color: C.bone },
  nameMe: { fontFamily: 'Cairo_600SemiBold', color: C.brass },
  value: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.brass },

  empty: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff, textAlign: 'center', marginTop: 40, lineHeight: 20 },

  tournamentSection: {
    width: '100%', backgroundColor: C.deep, borderRadius: 14, padding: 16, gap: 10, marginTop: 4,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.3)',
  },
  tournamentSectionTitle: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.boneOff,
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  tournamentEmpty: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff },
  tournamentBadgeList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tournamentBadge: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 12, color: C.brass,
    backgroundColor: 'rgba(201,162,39,0.14)', borderWidth: 1, borderColor: 'rgba(201,162,39,0.35)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
  },

  skeletonTitle:  { width: '60%', height: 12, borderRadius: 5, backgroundColor: 'rgba(244,236,216,0.16)' },
  skeletonAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(244,236,216,0.16)' },
  skeletonLine:   { height: 10, borderRadius: 5, width: '80%', backgroundColor: 'rgba(244,236,216,0.16)' },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(6,20,15,0.86)', justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: C.table, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 18, paddingTop: 10, paddingBottom: 6, maxHeight: '85%',
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8,
  },
  modalTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.bone },
  closeBtn: {
    position: 'absolute', right: 2, top: 4, width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(244,236,216,0.10)', alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.boneOff },
  modalList: { gap: 6, paddingVertical: 8, paddingBottom: 20 },
})

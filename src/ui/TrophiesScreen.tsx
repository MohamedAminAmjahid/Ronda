import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Modal } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../firebase/auth'
import {
  getTopUsers, getFriends, getUserById, getWeeklyWagered, getWeeklyWageredLeaderboard,
  type UserDoc, type FriendDoc,
} from '../firebase/firestore'
import { AvatarDisplay } from './ProfileScreen'
import { PlayerProfileModal } from './PlayerProfileModal'
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

// Seuil de parties minimum pour apparaître au classement du taux de victoire
// — sinon un joueur à 1 partie jouée et gagnée écraserait tout le monde à 100%.
const MIN_GAMES_FOR_WINRATE = 10
// Taille du bassin de candidats (les plus actifs par gamesPlayed) dans lequel
// le taux de victoire est calculé — PAS un scan exhaustif de tous les
// utilisateurs (impraticable côté client). Un joueur avec ≥10 parties mais
// hors des 200 comptes les plus actifs de toute l'app ne sera pas détecté :
// approximation assumée, pas un vrai top exhaustif.
const WINRATE_POOL_SIZE = 200

type MetricKey =
  | 'level' | 'gold' | 'gamesWon' | 'currentStreak'
  | 'gamesPlayed' | 'winRate' | 'weeklyWagered' | 'friendCount'

interface Entry {
  uid:         string
  username:    string
  avatarType:  string
  avatarEmoji: string
  avatarImage: string
  value:       number
}

interface CardData {
  entries:      Entry[]        // classés, « moi » inclus s'il y figure
  meOutsideTop: Entry | null   // « moi », uniquement si absent du top (scope global)
}

interface StatShape {
  level: number
  gold: number
  gamesWon: number
  gamesPlayed: number
  currentStreak: number
  friendCount: number
}

function toEntry(
  u: { uid: string; username: string; avatarType?: string; avatarEmoji?: string; avatarImage?: string },
  value: number,
): Entry {
  return {
    uid: u.uid, username: u.username,
    avatarType: u.avatarType ?? 'initial', avatarEmoji: u.avatarEmoji ?? '', avatarImage: u.avatarImage ?? '',
    value,
  }
}

/** Construit l'entrée d'une métrique pour un joueur — null si non éligible
 * (uniquement le taux de victoire, sous le seuil de parties). */
function buildEntry(
  u: { uid: string; username: string; avatarType?: string; avatarEmoji?: string; avatarImage?: string },
  metric: MetricKey,
  stats: StatShape,
  weeklyGold: number,
): Entry | null {
  switch (metric) {
    case 'level':         return toEntry(u, stats.level)
    case 'gold':           return toEntry(u, stats.gold)
    case 'gamesWon':       return toEntry(u, stats.gamesWon)
    case 'currentStreak':  return toEntry(u, stats.currentStreak)
    case 'gamesPlayed':    return toEntry(u, stats.gamesPlayed)
    case 'friendCount':    return toEntry(u, stats.friendCount)
    case 'weeklyWagered':  return toEntry(u, weeklyGold)
    case 'winRate':
      if (stats.gamesPlayed < MIN_GAMES_FOR_WINRATE) return null
      return toEntry(u, Math.round((stats.gamesWon / stats.gamesPlayed) * 100))
  }
}

const METRIC_KEYS: MetricKey[] = [
  'level', 'gold', 'gamesWon', 'currentStreak', 'gamesPlayed', 'winRate', 'weeklyWagered', 'friendCount',
]

interface Props {
  onBack: () => void
}

export function TrophiesScreen({ onBack }: Props) {
  const { t } = useI18n()
  const { user } = useAuth()
  const myUid = user?.uid ?? null

  const [scope, setScope] = useState<'global' | 'friends'>('global')
  const [loading, setLoading] = useState(true)
  const emptyEntries = (): Record<MetricKey, Entry[]> => ({
    level: [], gold: [], gamesWon: [], currentStreak: [],
    gamesPlayed: [], winRate: [], weeklyWagered: [], friendCount: [],
  })
  const [globalEntries, setGlobalEntries] = useState<Record<MetricKey, Entry[]>>(emptyEntries)
  const [friendsEntries, setFriendsEntries] = useState<Record<MetricKey, Entry[]>>(emptyEntries)
  const [hasFriends, setHasFriends] = useState(false)
  const [seeAll, setSeeAll] = useState<MetricKey | null>(null)
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const [level, gold, gamesWon, currentStreak, gamesPlayedPool, friendCount, weeklyTop, mine, friends] =
          await Promise.all([
            getTopUsers('level'),
            getTopUsers('gold'),
            getTopUsers('gamesWon'),
            getTopUsers('currentStreak'),
            getTopUsers('gamesPlayed', WINRATE_POOL_SIZE),
            getTopUsers('friendCount'),
            getWeeklyWageredLeaderboard(50),
            myUid ? getUserById(myUid) : Promise.resolve(null),
            myUid ? getFriends(myUid) : Promise.resolve<FriendDoc[]>([]),
          ])
        if (cancelled) return

        const winRateTop = gamesPlayedPool
          .filter((u) => u.gamesPlayed >= MIN_GAMES_FOR_WINRATE)
          .map((u) => toEntry(u, Math.round((u.gamesWon / u.gamesPlayed) * 100)))
          .sort((a, b) => b.value - a.value)
          .slice(0, 50)

        setGlobalEntries({
          level:         level.map((u) => toEntry(u, u.level)),
          gold:          gold.map((u) => toEntry(u, u.gold)),
          gamesWon:      gamesWon.map((u) => toEntry(u, u.gamesWon)),
          currentStreak: currentStreak.map((u) => toEntry(u, u.currentStreak)),
          gamesPlayed:   gamesPlayedPool.slice(0, 50).map((u) => toEntry(u, u.gamesPlayed)),
          friendCount:   friendCount.map((u) => toEntry(u, u.friendCount)),
          winRate:       winRateTop,
          weeklyWagered: weeklyTop.map((w) => toEntry(w, w.gold)),
        })

        // Or misé cette semaine, pour moi + mes amis — requêtes ciblées par
        // doc id déterministe (weekly_scores/{semaine}_{username}_{jeu}), pas
        // de scan : bon marché même avec beaucoup d'amis.
        const names = [...(mine ? [mine.username] : []), ...friends.map((f) => f.username)]
        const weeklyAmounts = await Promise.all(names.map((n) => getWeeklyWagered(n)))
        const weeklyByUsername = new Map(names.map((n, i) => [n, weeklyAmounts[i]]))

        const meStats: StatShape | null = mine ? {
          level: mine.level, gold: mine.gold, gamesWon: mine.gamesWon,
          gamesPlayed: mine.gamesPlayed, currentStreak: mine.currentStreak, friendCount: mine.friendCount,
        } : null

        const friendsOut: Record<MetricKey, Entry[]> = Object.fromEntries(
          METRIC_KEYS.map((metric) => {
            const meEntry = mine && meStats
              ? buildEntry(mine, metric, meStats, weeklyByUsername.get(mine.username) ?? 0)
              : null
            const friendEntries = friends
              .map((f) => buildEntry(f, metric, {
                level: f.level ?? 1, gold: f.gold ?? 0, gamesWon: f.gamesWon ?? 0,
                gamesPlayed: f.gamesPlayed ?? 0, currentStreak: f.currentStreak ?? 0, friendCount: f.friendCount ?? 0,
              }, weeklyByUsername.get(f.username) ?? 0))
              .filter((e): e is Entry => e !== null)
            const list = [...(meEntry ? [meEntry] : []), ...friendEntries]
            list.sort((a, b) => b.value - a.value)
            return [metric, list]
          }),
        ) as Record<MetricKey, Entry[]>

        setFriendsEntries(friendsOut)
        setHasFriends(friends.length > 0)
      } catch {
        // best-effort — l'écran reste utilisable avec des listes vides
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [myUid])

  const dataFor = (metric: MetricKey): CardData => {
    if (scope === 'friends') return { entries: friendsEntries[metric], meOutsideTop: null }
    const entries = globalEntries[metric]
    const inList = myUid ? entries.some((e) => e.uid === myUid) : true
    const meEntry = !inList ? friendsEntries[metric].find((e) => e.uid === myUid) ?? null : null
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

  const noFriends = scope === 'friends' && !hasFriends

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
          <ActivityIndicator color={C.brass} style={{ marginTop: 40 }} />
        ) : noFriends ? (
          <Text style={s.empty}>{t('trophyNoFriends')}</Text>
        ) : (
          <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
            {METRICS.map((m) => (
              <LeaderboardCard
                key={m.key}
                icon={m.icon}
                title={m.title}
                data={dataFor(m.key)}
                format={m.format}
                myUid={myUid}
                onSeeAll={() => setSeeAll(m.key)}
                onPressRow={openProfile}
              />
            ))}
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

// ── Card : top 5 + ligne « moi » + bouton Voir tout ─────────────────────────────

function LeaderboardCard({
  icon, title, data, format, myUid, onSeeAll, onPressRow,
}: {
  icon: string
  title: string
  data: CardData
  format: (n: number) => string
  myUid: string | null
  onSeeAll: () => void
  onPressRow: (uid: string, username: string) => void
}) {
  const { t } = useI18n()
  const { entries, meOutsideTop } = data
  const top5 = entries.slice(0, 5)
  const myIndex = myUid ? entries.findIndex((e) => e.uid === myUid) : -1
  const meInTop5 = myIndex >= 0 && myIndex < 5

  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>{icon} {title}</Text>
        {(entries.length > 5 || meOutsideTop) && (
          <TouchableOpacity onPress={onSeeAll}>
            <Text style={s.seeAll}>{t('trophySeeAll')}</Text>
          </TouchableOpacity>
        )}
      </View>
      {entries.length === 0 ? (
        <Text style={s.emptySmall}>{t('trophyEmpty')}</Text>
      ) : (
        <>
          {top5.map((e, i) => (
            <Row key={e.uid} rank={i + 1} entry={e} value={format(e.value)} me={e.uid === myUid} onPress={onPressRow} />
          ))}
          {!meInTop5 && myIndex >= 0 && (
            <Row rank={myIndex + 1} entry={entries[myIndex]} value={format(entries[myIndex].value)} me onPress={onPressRow} />
          )}
          {meOutsideTop && (
            <Row rank={null} entry={meOutsideTop} value={format(meOutsideTop.value)} me onPress={onPressRow} />
          )}
        </>
      )}
    </View>
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

  list: { paddingVertical: 4, gap: 14, paddingBottom: 24 },

  card: {
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 16, padding: 14, gap: 8,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.20)',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  cardTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.bone },
  seeAll: { fontFamily: 'Cairo_600SemiBold', fontSize: 12, color: C.brass },

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

import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import { useProfile } from '../profile/useProfile'
import { useAuth } from '../firebase/auth'
import { fetchWeeklyLeaderboard, fetchUserLeague, type WeeklyEntry } from '../online/client'
import { getCachedLeaderboard, isStale, refreshLeaderboard, subscribeLeaderboard } from '../online/leaderboardCache'
import { searchUserByUsername } from '../firebase/firestore'
import { PlayerProfileModal } from './PlayerProfileModal'
import { AvatarDisplay } from './ProfileScreen'
import { useI18n } from '../i18n/useI18n'

interface CachedProfile {
  uid:         string
  avatarType:  string
  avatarEmoji: string
  avatarImage: string
}

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
  const { username, avatarType: myAvatarType, avatarEmoji: myAvatarEmoji, avatarImage: myAvatarImage } = useProfile()
  const { user } = useAuth()
  const myUid = user?.uid ?? null
  const { t } = useI18n()

  const [userLeague, setUserLeague] = useState<string>('Bronze')
  const [selected, setSelected] = useState<string>('Bronze')
  const [entries, setEntries] = useState<WeeklyEntry[]>([])
  const [myEntries, setMyEntries] = useState<WeeklyEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(msToNextMondayUTC())
  // Incrémenté à chaque focus de l'écran → force un refetch même si `selected`
  // n'a pas changé (ex. retour sur l'onglet Classement après une partie).
  const [refreshKey, setRefreshKey] = useState(0)

  // Profil cliquable : la table weekly_scores (SQLite) ne connaît que le
  // username, pas l'uid Firebase → résolu à la demande (au tap), pas pour
  // toute la liste au chargement (éviterait N lectures Firestore par focus).
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const [resolvingName, setResolvingName] = useState<string | null>(null)

  // Cache des profils (avatar + uid) par username — persiste tant que l'écran
  // reste monté : un joueur déjà vu (même sur un autre onglet de ligue) n'est
  // jamais rechargé. `null` = recherché mais introuvable (pas de retry).
  const profileCache = useRef<Map<string, CachedProfile | null>>(new Map())
  const [, bumpProfiles] = useState(0)

  useFocusEffect(
    useCallback(() => {
      setRefreshKey(k => k + 1)
    }, []),
  )

  // Compte à rebours jusqu'au reset.
  useEffect(() => {
    const id = setInterval(() => setCountdown(msToNextMondayUTC()), 1000)
    return () => clearInterval(id)
  }, [])

  // Ligue du joueur (et sélection initiale) au montage + à chaque focus.
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
  }, [username, refreshKey])

  // Classement de la ligue sélectionnée — affichage instantané depuis le
  // cache (même périmé), puis refresh silencieux en arrière-plan si le cache
  // est absent ou dépassé les 5 min de TTL. Le spinner plein écran ne
  // s'affiche que si on n'a RIEN à montrer (1re visite jamais préchargée).
  useEffect(() => {
    let cancelled = false
    setError(null)
    const cached = getCachedLeaderboard(selected)
    if (cached) {
      setEntries(cached)
      setLoading(false)
    }

    if (isStale(selected)) {
      if (!cached) setLoading(true)
      void refreshLeaderboard(selected).then(() => {
        // `selected` a pu changer pendant le fetch (l'utilisateur a basculé
        // d'onglet) — ne pas écraser la ligue affichée avec des données
        // périmées pour une AUTRE ligue.
        if (cancelled) return
        const fresh = getCachedLeaderboard(selected)
        if (fresh) {
          console.log('[leaderboard] users chargés:', fresh.length)
          setEntries(fresh)
          setLoading(false)
        } else if (!cached) {
          // Échec ET rien en cache : seul cas où l'utilisateur voit une erreur.
          setError(t('leaderboardError'))
          setLoading(false)
        }
      })
    }
    return () => { cancelled = true }
  }, [selected, refreshKey])

  // Un refresh déclenché ailleurs (ex. preload au login, ou un autre écran
  // qui partage ce cache) doit aussi mettre à jour cet affichage.
  useEffect(() => {
    return subscribeLeaderboard(() => {
      const data = getCachedLeaderboard(selected)
      if (data) setEntries(data)
    })
  }, [selected])

  // Ma propre ligne : utilise directement le profil local (useProfile),
  // jamais une recherche Firestore par username. searchUserByUsername cherche
  // par usernameLower — si mon pseudo a changé depuis que weekly_scores a
  // enregistré mes mises de la semaine (ex. suffixe anti-collision ajouté
  // après coup), l'ancien username qui y est figé ne correspond plus à AUCUN
  // usernameLower actuel et la recherche renvoie null, alors même que
  // l'entrée EST bien la mienne. Le profil local n'a pas ce problème : il
  // reflète toujours mon compte réel, quel que soit le nom sous lequel une
  // mise passée a été enregistrée.
  useEffect(() => {
    if (!username) return
    profileCache.current.set(username, {
      uid: myUid ?? '',
      avatarType: myAvatarType || 'initial',
      avatarEmoji: myAvatarEmoji ?? '',
      avatarImage: myAvatarImage ?? '',
    })
    bumpProfiles((n) => n + 1)
  }, [username, myUid, myAvatarType, myAvatarEmoji, myAvatarImage])

  // Précharge avatar + uid de chaque joueur visible (une seule fois par
  // username, grâce au cache) pour afficher la photo de profil dans la liste.
  // Par lots de 5 (pas tout en même temps) : la liste (rang/pseudo/or misé)
  // s'affiche déjà avant même que cet effet ne démarre — seuls les avatars
  // arrivent progressivement, en cercle gris placeholder entre-temps.
  useEffect(() => {
    let cancelled = false
    const toFetch = entries.filter((e) => e.username !== username && !profileCache.current.has(e.username))
    if (toFetch.length === 0) return
    const BATCH_SIZE = 5
    void (async () => {
      for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
        if (cancelled) return
        const batch = toFetch.slice(i, i + BATCH_SIZE)
        await Promise.all(
          batch.map(async (e) => {
            try {
              const u = await searchUserByUsername(e.username)
              profileCache.current.set(e.username, u
                ? { uid: u.uid, avatarType: u.avatarType ?? 'initial', avatarEmoji: u.avatarEmoji ?? '', avatarImage: u.avatarImage ?? '' }
                : null)
            } catch {
              profileCache.current.set(e.username, null)
            }
          }),
        )
        if (!cancelled) bumpProfiles((n) => n + 1)
      }
    })()
    return () => { cancelled = true }
  }, [entries])

  // Résout l'uid Firebase par username puis ouvre la modale profil (réutilise
  // le cache avatar déjà chargé — pas de 2e lecture Firestore si disponible).
  // Pas de recherche pour soi-même (éviterait un « ajouter ami » vers son propre uid).
  const openProfile = useCallback(async (targetUsername: string) => {
    const cached = profileCache.current.get(targetUsername)
    if (cached !== undefined) {
      setSelectedUid(cached?.uid ?? null)
      setSelectedName(targetUsername)
      return
    }
    setResolvingName(targetUsername)
    try {
      const user = await searchUserByUsername(targetUsername)
      setSelectedUid(user?.uid ?? null)
      setSelectedName(targetUsername)
    } finally {
      setResolvingName(null)
    }
  }, [])

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
          {loading && entries.length === 0 ? (
            <SkeletonRows count={5} />
          ) : error ? (
            <Text style={s.empty}>{error}</Text>
          ) : entries.length === 0 ? (
            <Text style={s.empty}>{t('noLeaderboardPlayers')}</Text>
          ) : (
            entries.map((e, i) => {
              const me = e.username === username
              const resolving = resolvingName === e.username
              const avatar = profileCache.current.get(e.username)
              console.log('[leaderboard] avatar cache pour', e.username, ':', avatar)
              return (
                <TouchableOpacity
                  key={e.username}
                  style={[s.row, me && s.rowMe]}
                  activeOpacity={me ? 1 : 0.7}
                  disabled={me || resolving}
                  onPress={() => { void openProfile(e.username) }}
                >
                  <Text style={s.rank}>{i < 3 ? MEDALS[i] : `${i + 1}`}</Text>
                  {avatar === undefined ? (
                    <View style={s.avatarPlaceholder} />
                  ) : (
                    <AvatarDisplay
                      type={(avatar?.avatarType ?? 'initial') as 'initial' | 'emoji' | 'image'}
                      initial={e.username[0]?.toUpperCase() ?? '?'}
                      emoji={avatar?.avatarEmoji ?? ''}
                      image={avatar?.avatarImage ?? ''}
                      size={36}
                    />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[s.name, me && s.nameMe]} numberOfLines={1}>
                      {e.username}{me ? ' ' + t('youParens') : ''}
                    </Text>
                    <View style={s.gameBadges}>
                      {e.rondaGold > 0 && (
                        <Text style={s.gameBadgeRonda}>🟢 {e.rondaGold}</Text>
                      )}
                      {e.dijoujGold > 0 && (
                        <Text style={s.gameBadgeDijouj}>🔴 {e.dijoujGold}</Text>
                      )}
                    </View>
                  </View>
                  <Text style={s.wagered}>🪙 {e.totalGold}</Text>
                  {!me && (
                    resolving
                      ? <ActivityIndicator color={C.brass} size="small" style={s.chevron} />
                      : <Text style={s.chevron}>›</Text>
                  )}
                </TouchableOpacity>
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

      <PlayerProfileModal
        visible={selectedName !== null}
        uid={selectedUid ?? undefined}
        name={selectedName ?? undefined}
        onClose={() => { setSelectedUid(null); setSelectedName(null) }}
      />
    </SafeAreaView>
  )
}

// ── Lignes skeleton (pulse) — affichées uniquement au tout premier chargement
// d'une ligue jamais préchargée (pas de cache du tout à montrer). ─────────────

function SkeletonRow() {
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
    <Animated.View style={[s.row, { opacity: pulse }]}>
      <View style={s.skeletonAvatar} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={s.skeletonLine} />
        <View style={[s.skeletonLine, { width: '40%' }]} />
      </View>
      <View style={s.skeletonValue} />
    </Animated.View>
  )
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => <SkeletonRow key={i} />)}
    </>
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
  avatarPlaceholder: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(244,236,216,0.16)' },
  name: { fontFamily: 'Cairo_400Regular', fontSize: 15, color: C.bone },
  nameMe: { fontFamily: 'Cairo_600SemiBold', color: C.brass },
  gameBadges: { flexDirection: 'row', gap: 8, marginTop: 1 },
  gameBadgeRonda: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: 'rgba(244,236,216,0.55)' },
  gameBadgeDijouj: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: 'rgba(244,236,216,0.55)' },
  wagered: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.brass },
  chevron: { fontFamily: 'Cairo_600SemiBold', fontSize: 18, color: C.boneOff, marginLeft: 2, width: 14, textAlign: 'center' },

  skeletonAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(244,236,216,0.16)' },
  skeletonLine:   { height: 10, borderRadius: 5, width: '70%', backgroundColor: 'rgba(244,236,216,0.16)' },
  skeletonValue:  { width: 40, height: 14, borderRadius: 5, backgroundColor: 'rgba(244,236,216,0.16)' },

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

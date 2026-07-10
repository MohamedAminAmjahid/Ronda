import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import Head from 'expo-router/head'
import { useLocalSearchParams, router, type Href } from 'expo-router'
import { AvatarDisplay } from '../../ui/ProfileScreen'
import { xpRequired } from '../../profile/profile'
import { searchUserByUsername, type UserDoc } from '../../firebase/firestore'
import { fetchUserLeagueByUsername } from '../../online/client'

const GAME_URL = 'https://ronda-virid.vercel.app'

const C = {
  gradTop: '#0D0D1A' as const,
  gradBot: '#1A0D2E' as const,
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.55)',
  ink:     '#1C2622',
  card:    'rgba(0,0,0,0.28)',
} as const

const LEAGUE_EMOJI: Record<string, string> = {
  Bronze: '🥉', Argent: '🥈', Or: '🥇', Diamant: '💎', Légende: '👑',
}

function winRate(played: number, won: number): number {
  return played > 0 ? Math.round((won / played) * 100) : 0
}

/**
 * Profil public partageable — ronda-virid.vercel.app/profil/[username].
 * Accessible sans être connecté (lecture des données publiques Firestore).
 * Meta OG pour la prévisualisation WhatsApp/Twitter/Google.
 */
export default function PublicProfileRoute() {
  const { username } = useLocalSearchParams<{ username?: string }>()
  const name = username ? decodeURIComponent(username) : ''

  const [profile, setProfile] = useState<UserDoc | null>(null)
  const [league, setLeague] = useState<string>('Bronze')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!name) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    void searchUserByUsername(name)
      .then((u) => {
        if (cancelled) return
        setProfile(u)
        if (u) void fetchUserLeagueByUsername(u.username).then((l) => { if (!cancelled) setLeague(l) })
      })
      .catch(() => { if (!cancelled) setProfile(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [name])

  const statsPublic = profile ? profile.statsPublic !== false : false
  const leagueLabel = `${LEAGUE_EMOJI[league] ?? '🏅'} ${league}`

  // ── Meta OG (prévisualisation liens) ──────────────────────────────────────
  const ogTitle = profile
    ? `${profile.username} — Joueur Ronda · Niveau ${profile.level}`
    : 'Dar Lwar9a TM'
  const ogDesc = profile && statsPublic
    ? `${profile.gamesWon} victoires · Ligue ${league}`
    : 'Jouez à la Ronda et Di Jouj en ligne — jeux de cartes marocains.'
  const ogImage = `${GAME_URL}/icons/icon-512.png`

  return (
    <LinearGradient colors={[C.gradTop, C.gradBot]} style={s.root}>
      <Head>
        <title>{ogTitle}</title>
        <meta name="description" content={ogDesc} />
        <meta property="og:title" content={ogTitle} />
        <meta property="og:description" content={ogDesc} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:type" content="profile" />
        <meta name="twitter:card" content="summary" />
      </Head>

      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>

          {loading ? (
            <ActivityIndicator color={C.brass} size="large" style={{ marginTop: 60 }} />
          ) : !profile ? (
            <View style={s.notFound}>
              <Text style={s.nfTitle}>Profil introuvable</Text>
              <Text style={s.nfSub}>Aucun joueur nommé « {name} ».</Text>
            </View>
          ) : (
            <>
              {/* Identité */}
              <View style={s.identity}>
                <AvatarDisplay
                  type={(profile.avatarType ?? 'initial') as 'initial' | 'emoji' | 'image'}
                  initial={profile.username[0]?.toUpperCase() ?? '?'}
                  emoji={profile.avatarEmoji ?? ''}
                  image={profile.avatarImage ?? ''}
                  size={100}
                  frame={profile.avatarFrame ?? 'none'}
                  level={profile.level}
                  xp={profile.xp} xpMax={xpRequired(profile.level)}
                />
                <Text style={s.name} numberOfLines={1}>{profile.username}</Text>
                <Text style={s.league}>{leagueLabel} · Niveau {profile.level}</Text>
              </View>

              {/* Stats */}
              {statsPublic ? (
                <View style={s.statsRow}>
                  <StatCard title="🃏 RONDA" played={profile.rondaPlayed} won={profile.rondaWon} />
                  <StatCard title="🎴 DI JOUJ" played={profile.dijoujPlayed} won={profile.dijoujWon} />
                </View>
              ) : (
                <View style={s.card}><Text style={s.hiddenTxt}>📊 Statistiques privées</Text></View>
              )}

              {statsPublic && (
                <View style={s.totalCard}>
                  <Text style={s.totalTxt}>🏆 {profile.gamesWon} victoires · {profile.gamesPlayed} parties · {winRate(profile.gamesPlayed, profile.gamesWon)}%</Text>
                </View>
              )}

              {/* CTA téléchargement */}
              <TouchableOpacity style={s.cta} onPress={() => void Linking.openURL(GAME_URL)} activeOpacity={0.85}>
                <Text style={s.ctaTxt}>📱 Télécharger l'app</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.replace('/' as Href)} activeOpacity={0.7}>
                <Text style={s.homeLink}>Ouvrir Dar Lwar9a TM</Text>
              </TouchableOpacity>
            </>
          )}

        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  )
}

function StatCard({ title, played, won }: { title: string; played: number; won: number }) {
  return (
    <View style={s.statCard}>
      <Text style={s.statTitle}>{title}</Text>
      <Text style={s.statValue}>{won}<Text style={s.statUnit}> victoires</Text></Text>
      <Text style={s.statValue}>{played}<Text style={s.statUnit}> parties</Text></Text>
      <Text style={[s.statValue, s.statRate]}>{winRate(played, won)}%</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, alignItems: 'center' },
  body: { width: '100%', maxWidth: 460, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 24, gap: 18 },

  notFound: { alignItems: 'center', gap: 8, marginTop: 60 },
  nfTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: C.bone },
  nfSub:   { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff, textAlign: 'center' },

  identity: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  name:   { fontFamily: 'Cairo_600SemiBold', fontSize: 26, color: C.bone },
  league: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.brass, letterSpacing: 0.3 },

  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1, backgroundColor: C.card, borderRadius: 14, padding: 16, gap: 6,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.18)',
  },
  statTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.bone, marginBottom: 2 },
  statValue: { fontFamily: 'Cairo_600SemiBold', fontSize: 18, color: C.bone },
  statUnit:  { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.boneOff },
  statRate:  { color: C.brass },

  card: { backgroundColor: C.card, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: 'rgba(201,162,39,0.18)' },
  hiddenTxt: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff, textAlign: 'center' },
  totalCard: { backgroundColor: 'rgba(201,162,39,0.10)', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(201,162,39,0.22)' },
  totalTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.bone, textAlign: 'center' },

  cta: {
    backgroundColor: C.brass, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 8,
    shadowColor: C.brass, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  ctaTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 17, color: C.ink },
  homeLink: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff, textAlign: 'center', textDecorationLine: 'underline', marginTop: 4 },
})

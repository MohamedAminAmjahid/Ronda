import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { usePathname, router, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const C = {
  bg:     '#0D0D1A',
  border: 'rgba(201,162,39,0.15)',
  brass:  '#C9A227',
  gray:   'rgba(244,236,216,0.30)',
} as const

const TABS = [
  { icon: '🎮', label: 'Jeux',      href: '/'            },
  { icon: '🏆', label: 'Classement', href: '/leaderboard' },
  { icon: '👥', label: 'Amis',      href: '/friends'     },
  { icon: '👤', label: 'Profil',    href: '/profile'     },
] as const

/** Routes où la barre de navigation doit être masquée (parties en cours, lobbies, etc.). */
const HIDDEN_PREFIXES = [
  '/game', '/online', '/play', '/ronda', '/dijouj',
  '/dijouj-online', '/dijouj-lobby', '/lobby2v2',
  '/auth', '/lang-picker', '/bet', '/join',
  '/rules', '/credits', '/gold-shop',
]

export function BottomNav() {
  const pathname  = usePathname()
  const insets    = useSafeAreaInsets()
  const isHidden  = HIDDEN_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '?'))

  if (isHidden) return null

  return (
    <View
      style={[
        s.bar,
        { paddingBottom: Math.max(insets.bottom, 8) },
      ]}
    >
      {TABS.map(tab => {
        const active = tab.href === '/'
          ? pathname === '/'
          : pathname.startsWith(tab.href)
        return (
          <TouchableOpacity
            key={tab.href}
            style={s.tab}
            onPress={() => router.push(tab.href as Href)}
            activeOpacity={0.7}
          >
            <Text style={s.icon}>{tab.icon}</Text>
            <Text style={[s.label, active && s.labelActive]}>
              {tab.label}
            </Text>
            {active && <View style={s.dot} />}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 10,
    ...Platform.select({
      web: { position: 'sticky' as never, bottom: 0 } as object,
      default: {},
    }),
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  icon:  { fontSize: 20 },
  label: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 10,
    color: C.gray,
    letterSpacing: 0.3,
  },
  labelActive: { color: C.brass, fontFamily: 'Cairo_600SemiBold' },
  dot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: C.brass,
    marginTop: 1,
  },
})

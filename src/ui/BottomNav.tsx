import { useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native'
import { usePathname, router, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../firebase/auth'
import { useNotifBadges } from '../hooks/useNotifBadges'

const C = {
  bg:     '#0D0D1A',
  border: 'rgba(201,162,39,0.20)',
  brass:  '#C9A227',
  muted:  'rgba(244,236,216,0.35)',
} as const

const TABS = [
  { icon: '🎮', label: 'Jeux',       href: '/'            },
  { icon: '🏆', label: 'Classement', href: '/leaderboard' },
  { icon: '👥', label: 'Amis',       href: '/friends'     },
  { icon: '👤', label: 'Profil',     href: '/profile'     },
] as const

const HIDDEN_PREFIXES = [
  '/game', '/online', '/play', '/ronda', '/dijouj',
  '/dijouj-online', '/dijouj-lobby', '/lobby2v2',
  '/auth', '/lang-picker', '/bet', '/join',
  '/rules', '/credits', '/gold-shop', '/chat',
]

function TabItem({
  tab,
  active,
  badge,
}: {
  tab: typeof TABS[number]
  active: boolean
  badge: number
}) {
  const scale = useRef(new Animated.Value(1)).current

  const onPress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.92, duration: 70, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 240, useNativeDriver: true }),
    ]).start()
    router.push(tab.href as Href)
  }

  return (
    <TouchableOpacity style={s.tab} onPress={onPress} activeOpacity={1}>
      <Animated.View style={[s.tabInner, { transform: [{ scale }] }]}>
        {active && <View style={s.activeBar} />}
        <View style={s.iconWrap}>
          <Text style={[s.icon, active && s.iconActive]}>{tab.icon}</Text>
          {badge > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeTxt}>{badge > 9 ? '9+' : badge}</Text>
            </View>
          )}
        </View>
        <Text style={[s.label, active && s.labelActive]}>{tab.label}</Text>
      </Animated.View>
    </TouchableOpacity>
  )
}

export function BottomNav() {
  const pathname  = usePathname()
  const insets    = useSafeAreaInsets()
  const { user }  = useAuth()
  const { total } = useNotifBadges(user?.uid ?? null)

  const isHidden = HIDDEN_PREFIXES.some(
    p => pathname === p || pathname.startsWith(p + '?') || pathname.startsWith(p + '/'),
  )

  if (isHidden) return null

  const bottomPad = Math.max(insets.bottom, 6)

  return (
    <View style={[s.bar, { paddingBottom: bottomPad }]}>
      {TABS.map(tab => {
        const active = tab.href === '/'
          ? pathname === '/'
          : pathname.startsWith(tab.href)
        const badge = tab.href === '/friends' ? total : 0
        return <TabItem key={tab.href} tab={tab} active={active} badge={badge} />
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
    paddingTop: 6,
    ...Platform.select({ web: { position: 'sticky' as never, bottom: 0 } as object, default: {} }),
  },

  tab:      { flex: 1 },
  tabInner: { alignItems: 'center', paddingVertical: 4, gap: 3 },

  activeBar: {
    position: 'absolute',
    top: -6,
    width: 24,
    height: 2,
    borderRadius: 1,
    backgroundColor: C.brass,
  },

  iconWrap: { position: 'relative' },
  icon:     { fontSize: 18, opacity: 0.55 },
  iconActive: { opacity: 1 },

  badge: {
    position: 'absolute',
    top: -4,
    right: -7,
    backgroundColor: '#E53935',
    borderRadius: 7,
    minWidth: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  badgeTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 9, color: '#fff' },

  label:       { fontFamily: 'Cairo_400Regular', fontSize: 10, color: C.muted, letterSpacing: 0.2 },
  labelActive: { color: C.brass, fontFamily: 'Cairo_600SemiBold' },
})

import { useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native'
import { usePathname, router, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import { useAuth } from '../firebase/auth'
import { useNotifBadges } from '../hooks/useNotifBadges'

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
      Animated.timing(scale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 200, useNativeDriver: true }),
    ]).start()
    router.push(tab.href as Href)
  }

  return (
    <TouchableOpacity style={s.tab} onPress={onPress} activeOpacity={1}>
      <Animated.View style={[s.tabInner, { transform: [{ scale }] }]}>
        {active && <View style={s.activeBar} />}
        <View style={s.iconWrap}>
          <Text style={s.icon}>{tab.icon}</Text>
          {badge > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeTxt}>{badge > 9 ? '9+' : badge}</Text>
            </View>
          )}
        </View>
        <Text style={[s.label, active && s.labelActive]}>{tab.label}</Text>
        {active && <View style={s.dot} />}
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

  const content = (
    <View style={s.row}>
      {TABS.map(tab => {
        const active = tab.href === '/'
          ? pathname === '/'
          : pathname.startsWith(tab.href)
        const badge = tab.href === '/friends' ? total : 0
        return <TabItem key={tab.href} tab={tab} active={active} badge={badge} />
      })}
    </View>
  )

  const bottomPad = Math.max(insets.bottom, 8)

  // BlurView sur iOS/Android ; fond semi-transparent sur web
  if (Platform.OS === 'web') {
    return (
      <View style={[s.barWeb, { paddingBottom: bottomPad }]}>
        {content}
      </View>
    )
  }

  return (
    <BlurView
      intensity={60}
      tint="dark"
      style={[s.bar, { paddingBottom: bottomPad }]}
    >
      <View style={s.blurOverlay} />
      {content}
    </BlurView>
  )
}

const s = StyleSheet.create({
  bar: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(201,162,39,0.18)',
    paddingTop: 6,
    overflow: 'hidden',
  },
  barWeb: {
    flexDirection: 'row',
    backgroundColor: 'rgba(13,13,26,0.96)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(201,162,39,0.15)',
    paddingTop: 6,
    ...Platform.select({ web: { position: 'sticky' as never, bottom: 0 } as object, default: {} }),
  },
  blurOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(13,13,26,0.78)',
  },
  row:      { flexDirection: 'row' },
  tab:      { flex: 1 },
  tabInner: { alignItems: 'center', gap: 2, paddingBottom: 2 },

  activeBar: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: C.brass,
    marginBottom: 4,
    shadowColor: C.brass,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },

  iconWrap: { position: 'relative' },
  badge: {
    position: 'absolute',
    top: -5,
    right: -8,
    backgroundColor: '#E53935',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 10, color: '#fff' },

  icon:  { fontSize: 20 },
  label: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 10,
    color: C.gray,
    letterSpacing: 0.3,
  },
  labelActive: { color: C.brass, fontFamily: 'Cairo_600SemiBold' },
  dot: {
    width: 3, height: 3, borderRadius: 2,
    backgroundColor: C.brass, marginTop: 1,
  },
})

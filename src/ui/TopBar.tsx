import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { usePathname, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../firebase/auth'
import { useProfile } from '../profile/useProfile'
import { AvatarDisplay } from './ProfileScreen'

const C = {
  bg:     '#0D0D1A',
  border: 'rgba(201,162,39,0.20)',
  brass:  '#C9A227',
  bone:   '#F4ECD8',
  muted:  'rgba(244,236,216,0.35)',
} as const

// Mêmes préfixes que BottomNav + replay.
const HIDDEN_PREFIXES = [
  '/game', '/online', '/play', '/ronda', '/dijouj',
  '/dijouj-online', '/dijouj-lobby', '/lobby2v2',
  '/auth', '/lang-picker', '/bet', '/join',
  '/rules', '/credits', '/chat', '/replay',
]

export function TopBar() {
  const pathname = usePathname()
  const insets   = useSafeAreaInsets()
  const { user } = useAuth()
  const {
    username, gold, avatarType, avatarEmoji, avatarImage, avatarFrame,
  } = useProfile()

  const isHidden = !user || HIDDEN_PREFIXES.some(
    p => pathname === p || pathname.startsWith(p + '?') || pathname.startsWith(p + '/'),
  )
  if (isHidden) return null

  const initial = username?.[0]?.toUpperCase() ?? '?'

  return (
    <View style={[
      s.bar,
      { paddingTop: Math.max(insets.top, 0) },
      Platform.OS === 'web' && (s.barWeb as object),
    ]}>
      {/* Nom de l'app */}
      <Text style={s.appName}>Dar Lwar9a</Text>

      <View style={s.right}>
        {/* Solde gold → boutique */}
        <TouchableOpacity
          style={s.goldPill}
          onPress={() => router.push('/gold-shop' as never)}
          activeOpacity={0.75}
        >
          <Text style={s.goldCoin}>🪙</Text>
          <Text style={s.goldAmount}>{gold}</Text>
        </TouchableOpacity>

        {/* Avatar + pseudo → profil */}
        <TouchableOpacity
          style={s.userPill}
          onPress={() => router.push('/profile' as never)}
          activeOpacity={0.75}
        >
          <AvatarDisplay
            type={(avatarType ?? 'initial') as 'initial' | 'emoji' | 'image'}
            initial={initial}
            emoji={avatarEmoji ?? ''}
            image={avatarImage ?? ''}
            size={28}
            frame={avatarFrame ?? 'none'}
          />
          <Text style={s.username} numberOfLines={1}>{username}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  bar: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 100,
  },
  barWeb: {
    position: 'sticky' as never,
    top: 0,
  } as object,

  appName: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize:   14,
    color:      C.muted,
    letterSpacing: 0.5,
  },

  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  goldPill: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             4,
    paddingHorizontal: 10,
    paddingVertical:   5,
    borderRadius:    14,
    backgroundColor: 'rgba(201,162,39,0.12)',
    borderWidth:     1,
    borderColor:     'rgba(201,162,39,0.28)',
  },
  goldCoin:   { fontSize: 13 },
  goldAmount: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize:   13,
    color:      C.brass,
  },

  userPill: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    paddingHorizontal: 8,
    paddingVertical:   4,
    borderRadius:  14,
    backgroundColor: 'rgba(244,236,216,0.06)',
    borderWidth:     1,
    borderColor:    'rgba(244,236,216,0.12)',
    maxWidth:       130,
  },
  username: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize:   13,
    color:      C.bone,
    flexShrink: 1,
  },
})

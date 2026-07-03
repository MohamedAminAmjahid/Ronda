import { useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated, Modal } from 'react-native'
import { Svg, Path, Rect } from 'react-native-svg'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
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

function PlayStoreIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M2 4.27L3.4 5.67 13.27 12 3.4 18.33 2 19.73V4.27z" fill="#34A853" />
      <Path d="M2 4.27l11 6.35L17.39 8 5.09 2.04A2 2 0 002 4.27z" fill="#4285F4" />
      <Path d="M2 19.73a2 2 0 003.09 1.23l12.3-6.96L13 11.38 2 17.73v2z" fill="#EA4335" />
      <Path d="M20.45 10.33l-3.06-1.73L13 11.38l4.39 2.78 3.06-1.73a2 2 0 000-2.1z" fill="#FBBC04" />
    </Svg>
  )
}

function AppStoreIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={1} y={1} width={22} height={22} rx={6} fill="#1C9BF0" />
      <Path
        d="M12 4.5L14.5 9.5H18L15 13.5 16 18 12 15.5 8 18 9 13.5 6 9.5H9.5L12 4.5z"
        fill="white"
      />
    </Svg>
  )
}

function MobileTabItem() {
  const [show, setShow] = useState(false)
  const scale = useRef(new Animated.Value(1)).current
  const { canInstall, install } = useInstallPrompt()

  const onPress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.92, duration: 70, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 240, useNativeDriver: true }),
    ]).start()
    setShow(true)
  }

  return (
    <>
      <TouchableOpacity style={s.tab} onPress={onPress} activeOpacity={1}>
        <Animated.View style={[s.tabInner, { transform: [{ scale }] }]}>
          <View style={s.iconWrap}>
            <View style={s.storeIconsRow}>
              <PlayStoreIcon size={12} />
              <AppStoreIcon size={12} />
            </View>
          </View>
          <Text style={s.label}>Appli</Text>
        </Animated.View>
      </TouchableOpacity>

      <Modal visible={show} transparent animationType="fade" onRequestClose={() => setShow(false)}>
        <TouchableOpacity style={s.mobileBackdrop} activeOpacity={1} onPress={() => setShow(false)}>
          <View style={s.mobileCard} onStartShouldSetResponder={() => true}>
            <TouchableOpacity style={s.mobileCloseBtn} onPress={() => setShow(false)} hitSlop={10}>
              <Text style={s.mobileCloseTxt}>✕</Text>
            </TouchableOpacity>
            <Text style={s.mobileTitle}>📱 Télécharge l'app</Text>
            <Text style={s.mobileDesc}>
              L'app mobile est en cours de développement et arrivera bientôt sur le Play Store et l'App Store.
            </Text>
            <View style={s.storeBtnsRow}>
              <View style={[s.storeBtn, s.storeBtnDisabled]}>
                <PlayStoreIcon size={18} />
                <Text style={s.storeBtnTxt}>Play Store{'\n'}Bientôt</Text>
              </View>
              <View style={[s.storeBtn, s.storeBtnDisabled]}>
                <AppStoreIcon size={18} />
                <Text style={s.storeBtnTxt}>App Store{'\n'}Bientôt</Text>
              </View>
            </View>
            <View style={s.pwaBanner}>
              <Text style={s.pwaTxt}>
                💡 En attendant, tu peux installer cette page comme application (PWA) depuis les options de ton navigateur.
              </Text>
            </View>

            {/* Bouton installer PWA */}
            {canInstall ? (
              <TouchableOpacity style={s.installBtn} onPress={install} activeOpacity={0.85}>
                <Text style={s.installBtnTxt}>📲 Installer l'app</Text>
              </TouchableOpacity>
            ) : (
              <View style={[s.installBtn, s.installBtnDisabled]}>
                <Text style={s.installBtnDisabledTxt}>📲 Installer l'app</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
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
      <MobileTabItem />
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

  storeIconsRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },

  // Mobile app modal
  mobileBackdrop: {
    flex: 1, backgroundColor: 'rgba(9,13,26,0.88)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  mobileCard: {
    width: '100%', maxWidth: 360, backgroundColor: C.bg, borderRadius: 20,
    padding: 24, gap: 16,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.30)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 12,
  },
  mobileCloseBtn: {
    position: 'absolute', top: 14, right: 16,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(244,236,216,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  mobileCloseTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: 'rgba(244,236,216,0.45)' },
  mobileTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 20, color: '#F4ECD8', textAlign: 'center', marginTop: 8 },
  mobileDesc: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: 'rgba(244,236,216,0.65)', lineHeight: 20, textAlign: 'center' },
  storeBtnsRow: { flexDirection: 'row', gap: 12 },
  storeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(244,236,216,0.08)', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(244,236,216,0.15)',
  },
  storeBtnDisabled: { opacity: 0.5 },
  storeBtnTxt: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: '#F4ECD8', lineHeight: 17 },
  pwaBanner: {
    backgroundColor: 'rgba(201,162,39,0.10)', borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: 'rgba(201,162,39,0.20)',
  },
  pwaTxt: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: 'rgba(244,236,216,0.70)', lineHeight: 18 },

  installBtn: {
    width: '100%', backgroundColor: '#C9A227', borderRadius: 13,
    paddingVertical: 14, alignItems: 'center',
  },
  installBtnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: '#1C2622' },
  installBtnDisabled: { backgroundColor: 'rgba(244,236,216,0.10)' },
  installBtnDisabledTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: 'rgba(244,236,216,0.30)' },
})

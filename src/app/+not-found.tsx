import { useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Svg, Circle, Polygon } from 'react-native-svg'

const C = {
  table: '#0E5C4A',
  deep:  '#09402F',
  brass: '#C9A227',
  bone:  '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.45)',
} as const

function KhatamLogo() {
  return (
    <Svg width={72} height={72} viewBox="0 0 72 72">
      <Circle cx="36" cy="36" r="34" fill={C.deep} stroke={C.brass} strokeWidth="2" />
      <Polygon
        points={
          '36,10 39.2,23.4 51.8,17.4 45.8,29 60,36 ' +
          '45.8,43 51.8,54.6 39.2,48.6 36,62 32.8,48.6 ' +
          '20.2,54.6 26.2,43 12,36 26.2,29 20.2,17.4 32.8,23.4'
        }
        fill={C.brass}
      />
    </Svg>
  )
}

export default function NotFoundRoute() {
  useEffect(() => {
    const t = setTimeout(() => router.replace('/'), 2000)
    return () => clearTimeout(t)
  }, [])

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.center}>
        <KhatamLogo />
        <Text style={s.title}>RONDA</Text>
        <View style={s.divider} />
        <Text style={s.message}>Page introuvable — retour au menu…</Text>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.table,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    gap: 16,
  },
  title: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 48,
    color: C.bone,
    letterSpacing: 10,
    textTransform: 'uppercase',
  },
  divider: {
    width: 48,
    height: 2,
    backgroundColor: C.brass,
    opacity: 0.5,
    borderRadius: 1,
  },
  message: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 14,
    color: C.boneOff,
    letterSpacing: 0.5,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
})

import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams, type Href } from 'expo-router'
import { roomTypeByCode } from '../online/client'
import { loadProfile } from '../profile/profile'

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  clay:    '#B5532A',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
} as const

/**
 * Point d'entrée d'un lien de partage : /join?code=AB3X7K.
 * Détecte automatiquement le type de room et redirige vers la partie 1v1
 * (/online) ou le lobby 2v2 (/lobby2v2), avec le code pré-rempli.
 */
export default function JoinRoute() {
  const { code: rawCode } = useLocalSearchParams<{ code?: string }>()
  const code = (rawCode ?? '').toUpperCase().trim()
  const [error, setError] = useState<string | null>(null)

  // Pulsation du texte de chargement.
  const pulse = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  // Détection + redirection au montage.
  useEffect(() => {
    if (!code) { setError('Code introuvable'); return }
    let cancelled = false
    void (async () => {
      try {
        const { type } = await roomTypeByCode(code)
        if (cancelled) return
        if (type === 'ronda2v2') {
          const profile = await loadProfile()
          if (cancelled) return
          router.replace(
            `/lobby2v2?code=${encodeURIComponent(code)}&pseudo=${encodeURIComponent(profile.username)}` as Href,
          )
        } else {
          router.replace(`/online?code=${encodeURIComponent(code)}` as Href)
        }
      } catch {
        if (!cancelled) setError('Code introuvable')
      }
    })()
    return () => { cancelled = true }
  }, [code])

  if (error) {
    return (
      <SafeAreaView style={[s.root, { justifyContent: 'center' }]}>
        <View style={s.center}>
          <Text style={s.errorTxt}>{error}</Text>
          <TouchableOpacity style={s.btn} onPress={() => router.replace('/' as Href)}>
            <Text style={s.btnTxt}>Retour au menu</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[s.root, { justifyContent: 'center' }]}>
      <View style={s.center}>
        <Animated.Text style={[s.loadingTxt, { opacity: pulse }]}>
          Connexion à la partie…
        </Animated.Text>
        {!!code && <Text style={s.codeTxt}>{code}</Text>}
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.table, alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 28 },
  loadingTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 20, color: C.bone, textAlign: 'center' },
  codeTxt: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: C.brass,
    letterSpacing: 3, marginTop: 4,
  },
  errorTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 18, color: C.clay, textAlign: 'center' },
  btn: { backgroundColor: C.brass, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  btnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.ink, letterSpacing: 0.4 },
})

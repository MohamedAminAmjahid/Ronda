import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, Animated, Easing } from 'react-native'

interface Props {
  /** Couleur d'accent (anneau, barre, timer). */
  accent: string
  /** Couleur du fond de la barre de progression. */
  track: string
  /** Couleur du texte principal. */
  textColor: string
  /** Libellé affiché (ex. « Recherche d'un adversaire »). */
  label: string
  /** Chrono écoulé formaté (ex. « 0:12 ») — optionnel. */
  timeLabel?: string
  /** Emoji au centre de l'anneau. */
  icon?: string
}

/**
 * Animation de matchmaking : anneau rotatif + titre pulsé + points animés +
 * barre indéterminée + chrono. Volontairement générique — ne mentionne jamais
 * qu'un bot puisse rejoindre : le joueur croit chercher un adversaire humain.
 */
export function Matchmaking({ accent, track, textColor, label, timeLabel, icon = '🎴' }: Props) {
  const spin  = useRef(new Animated.Value(0)).current
  const pulse = useRef(new Animated.Value(0.55)).current
  const fill  = useRef(new Animated.Value(0)).current
  const [dots, setDots] = useState('')

  // Anneau qui tourne
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }),
    )
    loop.start()
    return () => loop.stop()
  }, [spin])

  // Titre : pulse d'opacité
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1,    duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 750, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  // Barre indéterminée : remplissage 0 → 100 % en boucle
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(fill, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(fill, { toValue: 0, duration: 0,    useNativeDriver: false }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [fill])

  // Points « … » animés après le libellé
  useEffect(() => {
    const id = setInterval(() => setDots(d => (d.length >= 3 ? '' : d + '.')), 450)
    return () => clearInterval(id)
  }, [])

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const barW   = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })

  return (
    <View style={st.wrap}>
      <View style={st.ringWrap}>
        <Animated.View
          style={[
            st.ring,
            { borderTopColor: accent, borderRightColor: accent, transform: [{ rotate }] },
          ]}
        />
        <Text style={st.ringIcon}>{icon}</Text>
      </View>

      <Animated.Text style={[st.label, { color: textColor, opacity: pulse }]}>
        {label}{dots}
      </Animated.Text>

      {timeLabel ? <Text style={[st.time, { color: accent }]}>{timeLabel}</Text> : null}

      <View style={[st.track, { backgroundColor: track }]}>
        <Animated.View
          style={[
            st.bar,
            { backgroundColor: accent, width: barW as unknown as Animated.AnimatedInterpolation<string | number> },
          ]}
        />
      </View>
    </View>
  )
}

const RING = 76

const st = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 18 },
  ringWrap: {
    width: RING, height: RING, alignItems: 'center', justifyContent: 'center',
  },
  ring: {
    position: 'absolute', width: RING, height: RING, borderRadius: RING / 2,
    borderWidth: 3, borderColor: 'transparent',
  },
  ringIcon: { fontSize: 30, lineHeight: 36 },
  label: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 18, textAlign: 'center', letterSpacing: 0.3,
  },
  time: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, textAlign: 'center' },
  track: { width: 220, height: 5, borderRadius: 3, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 3 },
})

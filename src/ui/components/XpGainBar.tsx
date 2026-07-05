import { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated } from 'react-native'
import { xpRequired } from '../../profile/profile'

export interface XpGain {
  xpGained: number
  oldXp: number
  oldLevel: number
  newXp: number
  newLevel: number
}

interface Props extends XpGain {
  /** Couleur de remplissage (laiton par défaut). */
  accent?: string
  /** Couleur du texte « +X XP ». */
  textColor?: string
}

/**
 * Affiche « ⭐ +X XP » (apparition en spring) + une barre XP animée qui se remplit
 * de l'ancienne valeur vers la nouvelle. En cas de montée de niveau : la barre va
 * jusqu'à 100 %, repart de 0, puis atteint le nouveau pourcentage, et un message
 * « 🎉 Niveau X atteint ! » s'affiche en vert.
 *
 * Driver JS (useNativeDriver: false) : fiable sur le web (PWA).
 */
export function XpGainBar({
  xpGained, oldXp, oldLevel, newXp, newLevel,
  accent = '#C9A227', textColor = '#C9A227',
}: Props) {
  const leveledUp = newLevel > oldLevel
  const oldPct = Math.max(0, Math.min(1, oldXp / xpRequired(oldLevel)))
  const newPct = Math.max(0, Math.min(1, newXp / xpRequired(newLevel)))

  const scale = useRef(new Animated.Value(0)).current
  const fill  = useRef(new Animated.Value(oldPct)).current

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 140, useNativeDriver: false }).start()

    if (leveledUp) {
      Animated.sequence([
        Animated.timing(fill, { toValue: 1,      duration: 500, useNativeDriver: false }),
        Animated.timing(fill, { toValue: 0,      duration: 0,   useNativeDriver: false }),
        Animated.timing(fill, { toValue: newPct, duration: 500, useNativeDriver: false }),
      ]).start()
    } else {
      Animated.timing(fill, { toValue: newPct, duration: 1000, useNativeDriver: false }).start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })

  return (
    <View style={st.wrap}>
      <Animated.Text style={[st.xpTxt, { color: textColor, transform: [{ scale }] }]}>
        ⭐ +{xpGained} XP
      </Animated.Text>

      <View style={st.track}>
        <Animated.View style={[st.fill, { backgroundColor: accent, width }]} />
      </View>

      {leveledUp && (
        <Text style={st.levelUp}>🎉 Niveau {newLevel} atteint !</Text>
      )}
    </View>
  )
}

const st = StyleSheet.create({
  wrap:  { alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  xpTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 18, letterSpacing: 0.3 },
  track: {
    width: 200, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden',
  },
  fill:  { height: '100%', borderRadius: 4 },
  levelUp: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: '#27AE60', textAlign: 'center',
    textShadowColor: 'rgba(39,174,96,0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
  },
})

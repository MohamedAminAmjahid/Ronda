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

const BONE_OFF = 'rgba(244,236,216,0.55)'

/**
 * Fin de partie : « ⭐ +X XP » (apparition en spring) + une barre de progression
 * bornée par « Niveau X » (gauche) et « Niveau X+1 » (droite), avec le total
 * « newXp / xpMax XP » sous la barre. La barre se remplit de l'ancienne valeur
 * vers la nouvelle ; en cas de montée de niveau elle atteint 100 %, repart de 0
 * jusqu'au nouveau pourcentage, et « Niveau X → Niveau X+1 🎉 » s'affiche en vert.
 *
 * Driver JS (useNativeDriver: false) : fiable sur le web (PWA).
 */
export function XpGainBar({
  xpGained, oldXp, oldLevel, newXp, newLevel,
  accent = '#C9A227', textColor = '#C9A227',
}: Props) {
  const leveledUp = newLevel > oldLevel
  const xpMax  = xpRequired(newLevel)
  const oldPct = Math.max(0, Math.min(1, oldXp / xpRequired(oldLevel)))
  const newPct = Math.max(0, Math.min(1, newXp / xpMax))

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

      {leveledUp && (
        <Text style={st.levelUp}>Niveau {oldLevel} → Niveau {newLevel} 🎉</Text>
      )}

      <View style={st.barBlock}>
        <View style={st.levelRow}>
          <Text style={[st.levelLabel, { color: accent }]}>Niveau {newLevel}</Text>
          <Text style={st.levelLabelNext}>Niveau {newLevel + 1}</Text>
        </View>

        <View style={st.track}>
          <Animated.View style={[st.fill, { backgroundColor: accent, width }]} />
        </View>

        <Text style={st.belowTxt}>{newXp} / {xpMax} XP</Text>
      </View>
    </View>
  )
}

const st = StyleSheet.create({
  wrap: {
    alignItems: 'center', gap: 10, alignSelf: 'stretch',
    backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 16,
    paddingVertical: 16, paddingHorizontal: 18,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.20)',
  },
  xpTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 18, letterSpacing: 0.3 },
  levelUp: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: '#27AE60', textAlign: 'center',
    textShadowColor: 'rgba(39,174,96,0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
  },
  barBlock: { width: 240, gap: 6 },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  levelLabel:     { fontFamily: 'Cairo_600SemiBold', fontSize: 11, letterSpacing: 0.3 },
  levelLabelNext: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: BONE_OFF, letterSpacing: 0.3 },
  track: {
    width: '100%', height: 10, borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden',
  },
  fill:  { height: '100%', borderRadius: 5 },
  belowTxt: {
    fontFamily: 'Cairo_400Regular', fontSize: 11, color: BONE_OFF,
    textAlign: 'center', letterSpacing: 0.3,
  },
})

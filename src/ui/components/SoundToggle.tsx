import { useEffect, useState } from 'react'
import { TouchableOpacity, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { getSoundEnabled, subscribeSound, setSoundEnabled } from '../../hooks/soundPrefs'

/** Bouton 🔊 / 🔇 — bascule la préférence son (musique + effets), persistée. */
export function SoundToggle({ style }: { style?: StyleProp<ViewStyle> }) {
  const [enabled, setEnabled] = useState(getSoundEnabled())
  useEffect(() => subscribeSound(setEnabled), [])
  return (
    <TouchableOpacity
      style={[st.btn, style]}
      onPress={() => { void setSoundEnabled(!enabled) }}
      activeOpacity={0.7}
      hitSlop={8}
      accessibilityLabel={enabled ? 'Couper le son' : 'Activer le son'}
    >
      <Text style={st.icon}>{enabled ? '🔊' : '🔇'}</Text>
    </TouchableOpacity>
  )
}

const st = StyleSheet.create({
  btn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.30)',
  },
  icon: { fontSize: 17, lineHeight: 20 },
})

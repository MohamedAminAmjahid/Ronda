import { useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native'
import { useVoiceChat, type VoiceSignalTransport } from './useVoiceChat'

interface Props {
  /** Transport de signalisation lié à la room Colyseus (send/subscribe). */
  transport: VoiceSignalTransport | null
  /** true tant qu'on est en partie en ligne (sinon le bouton est masqué). */
  active: boolean
  username: string
}

/**
 * Bouton micro push-to-talk (WebRTC). Clic pour activer/couper le micro.
 * Actif → 🔴 rouge pulsant ; inactif → 🎤 gris. Masqué si WebRTC non supporté
 * (natif) ou hors partie.
 */
export function VoiceButton({ transport, active }: Props) {
  const { supported, micOn, error, toggleMic } = useVoiceChat(transport, active)
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!micOn) { pulse.setValue(1); return }
    // Driver JS : boucle fiable sur le web.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.18, duration: 550, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 1,    duration: 550, useNativeDriver: false }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [micOn, pulse])

  if (!supported || !active) return null

  return (
    <View style={s.wrapper} pointerEvents="box-none">
      {error && (
        <View style={s.errBox}>
          <Text style={s.errTxt}>{error}</Text>
        </View>
      )}
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <TouchableOpacity
          style={[s.btn, { backgroundColor: micOn ? '#C0392B' : '#37474F' }]}
          onPress={toggleMic}
          activeOpacity={0.75}
          accessibilityLabel={micOn ? 'Couper le micro' : 'Activer le micro'}
        >
          <Text style={s.icon}>{micOn ? '🔴' : '🎤'}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  )
}

const s = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    alignItems: 'center',
    zIndex: 999,
  },
  errBox: {
    backgroundColor: 'rgba(192,57,43,0.92)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    maxWidth: 220,
  },
  errTxt: { color: '#fff', fontSize: 11, fontFamily: 'Cairo_400Regular', textAlign: 'center' },
  btn: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  icon: { fontSize: 22 },
})

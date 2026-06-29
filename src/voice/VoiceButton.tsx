import { useEffect, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  Platform, GestureResponderEvent,
} from 'react-native'
import { useVoiceChat } from './useVoiceChat'

interface Props {
  roomCode: string | null
  username: string
}

export function VoiceButton({ roomCode, username }: Props) {
  if (Platform.OS !== 'web') return null

  return <VoiceButtonWeb roomCode={roomCode} username={username} />
}

function VoiceButtonWeb({ roomCode, username }: Props) {
  const {
    joinVoice, leaveVoice, toggleMute,
    isMuted, isSpeaking, isConnected, isConnecting,
  } = useVoiceChat()

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-join when roomCode becomes available
  useEffect(() => {
    if (roomCode && !isConnected && !isConnecting) {
      void joinVoice(roomCode, username)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode])

  // Auto-leave on unmount
  useEffect(() => {
    return () => { void leaveVoice() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const icon = isConnecting ? '⏳' : isMuted ? '🔇' : '🎤'
  const bg   = isConnecting ? '#444' : isMuted ? '#B71C1C' : '#1B5E20'

  function onPressIn(_: GestureResponderEvent) {
    longPressTimer.current = setTimeout(() => {
      void leaveVoice()
    }, 600)
  }

  function onPressOut(_: GestureResponderEvent) {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function onPress() {
    if (!isConnected && !isConnecting && roomCode) {
      void joinVoice(roomCode, username)
    } else {
      toggleMute()
    }
  }

  return (
    <View style={s.wrapper} pointerEvents="box-none">
      {isSpeaking && (
        <View style={s.bubble}>
          <Text style={s.bubbleTxt}>{username}</Text>
        </View>
      )}
      <TouchableOpacity
        style={[s.btn, { backgroundColor: bg }]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={0.75}
      >
        <Text style={s.icon}>{icon}</Text>
      </TouchableOpacity>
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
  bubble: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
  },
  bubbleTxt: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'Cairo_400Regular',
  },
  btn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  icon: {
    fontSize: 22,
  },
})

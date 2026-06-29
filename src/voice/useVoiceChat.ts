import { useState, useRef, useEffect, useCallback } from 'react'
import { Platform } from 'react-native'

const APP_ID = '48a082fb88864bd68f94c7fc982116aa'
const IS_WEB = Platform.OS === 'web'
const SPEAKING_THRESHOLD = 30

function hashUsername(username: string): number {
  let h = 0
  for (let i = 0; i < username.length; i++) {
    h = (Math.imul(31, h) + username.charCodeAt(i)) | 0
  }
  return (Math.abs(h) % 2_000_000_000) || 1
}

interface VolumeEntry { uid: number; level: number }

export function useVoiceChat() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientRef    = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localTrackRef = useRef<any>(null)
  const myUidRef     = useRef<number>(0)

  const [isConnected,   setIsConnected]   = useState(false)
  const [isConnecting,  setIsConnecting]  = useState(false)
  const [isMuted,       setIsMuted]       = useState(false)
  const [isSpeaking,    setIsSpeaking]    = useState(false)
  const [speakingUsers, setSpeakingUsers] = useState<number[]>([])

  const leaveVoice = useCallback(async () => {
    if (!IS_WEB) return
    try {
      localTrackRef.current?.close()
      localTrackRef.current = null
      if (clientRef.current) {
        await clientRef.current.leave()
        clientRef.current = null
      }
    } catch {}
    setIsConnected(false)
    setIsConnecting(false)
    setIsMuted(false)
    setIsSpeaking(false)
    setSpeakingUsers([])
  }, [])

  const joinVoice = useCallback(async (roomCode: string, username: string) => {
    if (!IS_WEB) return
    if (clientRef.current) return  // already connected

    setIsConnecting(true)
    try {
      const { default: AgoraRTC } = await import('agora-rtc-sdk-ng')
      AgoraRTC.setLogLevel(3)  // warn only

      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
      clientRef.current = client

      client.enableAudioVolumeIndicator()
      const myUid = hashUsername(username)
      myUidRef.current = myUid

      client.on('volume-indicator', (volumes: VolumeEntry[]) => {
        const speaking = volumes.filter(v => v.level > SPEAKING_THRESHOLD).map(v => v.uid)
        setSpeakingUsers(speaking)
        setIsSpeaking(speaking.includes(myUid))
      })

      // null token = testing mode (no token auth)
      await client.join(APP_ID, roomCode, null, myUid)

      const localTrack = await AgoraRTC.createMicrophoneAudioTrack()
      localTrackRef.current = localTrack
      await client.publish([localTrack])

      setIsConnected(true)
    } catch (e) {
      console.error('[voice] joinVoice error:', e)
      await leaveVoice()
    } finally {
      setIsConnecting(false)
    }
  }, [leaveVoice])

  const toggleMute = useCallback(() => {
    if (!IS_WEB || !localTrackRef.current) return
    const next = !isMuted
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    localTrackRef.current.setEnabled(!next)
    setIsMuted(next)
  }, [isMuted])

  // Cleanup on unmount
  useEffect(() => {
    return () => { void leaveVoice() }
  }, [leaveVoice])

  return {
    joinVoice,
    leaveVoice,
    toggleMute,
    isMuted,
    isSpeaking,
    speakingUsers,
    isConnected,
    isConnecting,
  }
}

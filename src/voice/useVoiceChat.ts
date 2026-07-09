import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'

// Chat vocal 1v1 via WebRTC natif du navigateur. La signalisation (offer/answer/
// ICE) transite par le serveur Colyseus (voice_signal relayé à l'autre joueur).
// Web uniquement : sur natif, RTCPeerConnection n'existe pas → supported=false.

/** Transport de signalisation (fourni par le store online : send/subscribe). */
export interface VoiceSignalTransport {
  send: (data: unknown) => void
  subscribe: (handler: (data: unknown) => void) => () => void
}

interface Signal {
  from?: number
  description?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

const IS_WEB = Platform.OS === 'web'
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

function webrtcSupported(): boolean {
  return (
    IS_WEB &&
    typeof RTCPeerConnection !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  )
}

export function useVoiceChat(transport: VoiceSignalTransport | null, active: boolean) {
  const supported = webrtcSupported()

  const [micOn, setMicOn]         = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const pcRef      = useRef<RTCPeerConnection | null>(null)
  const streamRef  = useRef<MediaStream | null>(null)
  const senderRef  = useRef<RTCRtpSender | null>(null)
  const audioRef   = useRef<HTMLAudioElement | null>(null)
  const myIdRef    = useRef<number>(0)
  const politeRef  = useRef<boolean>(false)
  const makingOffer = useRef(false)
  const ignoreOffer = useRef(false)

  const teardown = useCallback(() => {
    try { pcRef.current?.close() } catch { /* ignore */ }
    pcRef.current = null
    senderRef.current = null
    try { streamRef.current?.getTracks().forEach(tk => tk.stop()) } catch { /* ignore */ }
    streamRef.current = null
    if (audioRef.current) {
      try { audioRef.current.srcObject = null; audioRef.current.remove() } catch { /* ignore */ }
      audioRef.current = null
    }
    makingOffer.current = false
    ignoreOffer.current = false
    setMicOn(false)
    setConnected(false)
  }, [])

  const ensurePc = useCallback((): RTCPeerConnection | null => {
    if (!supported || !transport) return null
    if (pcRef.current) return pcRef.current
    if (!myIdRef.current) myIdRef.current = Math.floor(Math.random() * 1e9) + 1

    const pc = new RTCPeerConnection(RTC_CONFIG)
    pcRef.current = pc

    pc.onicecandidate = (ev) => {
      if (ev.candidate) transport.send({ from: myIdRef.current, candidate: ev.candidate.toJSON() })
    }
    pc.onconnectionstatechange = () => {
      setConnected(pc.connectionState === 'connected')
    }
    pc.ontrack = (ev) => {
      let el = audioRef.current
      if (!el && typeof document !== 'undefined') {
        el = document.createElement('audio')
        el.autoplay = true
        ;(el as unknown as { playsInline: boolean }).playsInline = true
        audioRef.current = el
      }
      if (el) {
        el.srcObject = ev.streams[0] ?? new MediaStream([ev.track])
        void el.play?.().catch(() => { /* autoplay bloqué : reprendra au clic */ })
      }
    }
    pc.onnegotiationneeded = () => {
      void (async () => {
        try {
          makingOffer.current = true
          await pc.setLocalDescription()
          transport.send({ from: myIdRef.current, description: pc.localDescription ?? undefined })
        } catch { /* ignore */ } finally {
          makingOffer.current = false
        }
      })()
    }
    return pc
  }, [supported, transport])

  // ── Réception des signaux (perfect negotiation) ────────────────────────────
  useEffect(() => {
    if (!supported || !transport || !active) return
    const unsub = transport.subscribe((raw) => {
      const data = raw as Signal
      if (!data || (data.from !== undefined && data.from === myIdRef.current)) return
      const pc = ensurePc()
      if (!pc) return
      // Rôle poli : l'id le plus bas est « impoli » (garde son offer en cas de collision).
      if (data.from !== undefined) politeRef.current = myIdRef.current > data.from
      void (async () => {
        try {
          if (data.description) {
            const collision =
              data.description.type === 'offer' &&
              (makingOffer.current || pc.signalingState !== 'stable')
            ignoreOffer.current = !politeRef.current && collision
            if (ignoreOffer.current) return
            await pc.setRemoteDescription(data.description)
            if (data.description.type === 'offer') {
              await pc.setLocalDescription()
              transport.send({ from: myIdRef.current, description: pc.localDescription ?? undefined })
            }
          } else if (data.candidate) {
            try { await pc.addIceCandidate(data.candidate) } catch { /* candidat ignoré */ }
          }
        } catch { /* erreur de signalisation ignorée */ }
      })()
    })
    return unsub
  }, [supported, transport, active, ensurePc])

  // Démontage / sortie de partie → on ferme tout.
  useEffect(() => { if (!active) teardown() }, [active, teardown])
  useEffect(() => () => teardown(), [teardown])

  const enableMic = useCallback(async () => {
    if (!supported) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream
      // Sans transport (repli bot déguisé, pas de vraie Room) : pas de pair à
      // qui envoyer le flux, mais le micro doit tout de même s'activer
      // visuellement (🔴 pulsant) — sinon le bouton trahirait qu'il n'y a
      // personne en face.
      const pc = transport ? ensurePc() : null
      if (pc) {
        const track = stream.getAudioTracks()[0]
        if (track) {
          if (senderRef.current) void senderRef.current.replaceTrack(track)
          else senderRef.current = pc.addTrack(track, stream) // déclenche onnegotiationneeded
        }
      }
      setMicOn(true)
    } catch (e) {
      const name = (e as { name?: string })?.name
      setError(
        name === 'NotAllowedError' || name === 'PermissionDeniedError'
          ? 'Autorise le micro dans ton navigateur'
          : 'Micro indisponible',
      )
    }
  }, [supported, transport, ensurePc])

  const toggleMic = useCallback(() => {
    if (micOn) {
      // Coupe l'envoi sans renégocier : on désactive la piste locale.
      const track = streamRef.current?.getAudioTracks()[0]
      if (track) track.enabled = false
      setMicOn(false)
      return
    }
    const track = streamRef.current?.getAudioTracks()[0]
    if (track) { track.enabled = true; setMicOn(true) } // déjà négocié → simple réactivation
    else void enableMic()
  }, [micOn, enableMic])

  return { supported, micOn, connected, error, toggleMic }
}

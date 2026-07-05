import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'expo-router'
import type { AudioPlayer } from 'expo-audio'
import { getSoundEnabled, subscribeSound } from './soundPrefs'

// Musique de fond en boucle sur les pages de jeu, coupée sur les menus.
// Monté une seule fois (dans _layout) : décide play/pause selon la route et la
// préférence son. expo-audio chargé en lazy require + try/catch → aucun crash
// si le module natif est indisponible (web sans interaction, tests…).

const BGM = require('../../assets/sounds/bgmusic.mp3')
const VOLUME = 0.3
const GAME_PREFIXES = ['/game', '/dijouj', '/online', '/dijouj-online']

function isGameRoute(path: string): boolean {
  return GAME_PREFIXES.some(
    p => path === p || path.startsWith(p + '?') || path.startsWith(p + '/'),
  )
}

/** Contrôleur de musique de fond — à monter une fois au niveau racine. */
export function useBackgroundMusic(): void {
  const pathname = usePathname()
  const playerRef = useRef<AudioPlayer | null>(null)
  const [enabled, setEnabled] = useState(getSoundEnabled())

  useEffect(() => subscribeSound(setEnabled), [])

  useEffect(() => {
    let cancelled = false
    const shouldPlay = enabled && isGameRoute(pathname)

    void (async () => {
      try {
        const Audio = require('expo-audio') as typeof import('expo-audio')
        if (!playerRef.current) {
          await Audio.setAudioModeAsync({ playsInSilentMode: false })
          const p = Audio.createAudioPlayer(BGM)
          p.loop = true
          p.volume = VOLUME
          playerRef.current = p
        }
        if (cancelled) return
        const player = playerRef.current
        if (!player) return
        if (shouldPlay) player.play()
        else player.pause()
      } catch { /* audio indisponible → pas de musique, jeu inchangé */ }
    })()

    return () => { cancelled = true }
  }, [pathname, enabled])

  // Libération au démontage racine.
  useEffect(() => {
    return () => {
      try { playerRef.current?.remove() } catch { /* déjà libéré */ }
      playerRef.current = null
    }
  }, [])
}

import { useCallback } from 'react'
import type { AudioPlayer } from 'expo-audio'
import { getSoundEnabled } from './soundPrefs'

// Effets sonores d'action : pose de carte, victoire, défaite, réception de gold.
// Préchargés à la 1re lecture (lazy), expo-audio en try/catch → jamais de crash.

type SfxName = 'card' | 'win' | 'lose' | 'gold'

const FILES: Record<SfxName, number> = {
  card: require('../../assets/sounds/card.mp3'),
  win:  require('../../assets/sounds/win.mp3'),
  lose: require('../../assets/sounds/lose.mp3'),
  gold: require('../../assets/sounds/gold.mp3'),
}
const VOLUME: Record<SfxName, number> = { card: 0.6, win: 0.85, lose: 0.7, gold: 0.75 }

const players: Partial<Record<SfxName, AudioPlayer>> = {}
let initPromise: Promise<void> | null = null

function initSfx(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      const Audio = require('expo-audio') as typeof import('expo-audio')
      await Audio.setAudioModeAsync({ playsInSilentMode: false })
      for (const name of Object.keys(FILES) as SfxName[]) {
        const p = Audio.createAudioPlayer(FILES[name])
        p.volume = VOLUME[name]
        players[name] = p
      }
    } catch { /* audio indisponible */ }
  })()
  return initPromise
}

function play(name: SfxName): void {
  if (!getSoundEnabled()) return
  void initSfx().then(() => {
    const p = players[name]
    if (!p) return
    try { p.seekTo(0); p.play() } catch { /* ignore */ }
  })
}

export function playCardSound(): void { play('card') }
export function playWinSound():  void { play('win') }
export function playLoseSound(): void { play('lose') }
export function playGoldSound(): void { play('gold') }

/** Hook pratique : renvoie les 4 fonctions de lecture (stables). */
export function useSoundEffects() {
  return {
    playCardSound: useCallback(playCardSound, []),
    playWinSound:  useCallback(playWinSound,  []),
    playLoseSound: useCallback(playLoseSound, []),
    playGoldSound: useCallback(playGoldSound, []),
  }
}

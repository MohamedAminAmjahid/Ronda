import type { AudioPlayer } from 'expo-audio'

// ── Sons du jeu ───────────────────────────────────────────────────────────────
// Tous les sons sont préchargés au démarrage (via initSounds) pour éviter toute
// latence au moment de jouer. Le mode silencieux iOS est respecté
// (playsInSilentMode: false) : si l'utilisateur a coupé le son, on ne force rien.
//
// expo-audio est chargé en *lazy require* dans initSounds (dans un try/catch) :
// si le module natif est indisponible (web, environnement de test…), le jeu reste
// pleinement jouable, simplement sans son — aucun crash au lancement.

export type SoundName =
  | 'card_deal'
  | 'card_place'
  | 'card_capture'
  | 'announce'
  | 'caida'
  | 'mabqach'

// Chemins relatifs (résolus par Metro sans dépendre de l'alias @/).
const FILES: Record<SoundName, number> = {
  card_deal:    require('../../assets/sounds/card_deal.wav'),
  card_place:   require('../../assets/sounds/card_place.wav'),
  card_capture: require('../../assets/sounds/card_capture.wav'),
  announce:     require('../../assets/sounds/announce.wav'),
  caida:        require('../../assets/sounds/caida.wav'),
  mabqach:      require('../../assets/sounds/mabqach.wav'),
}

// Volume par son : distribution plus douce, capture un peu plus forte.
const VOLUME: Record<SoundName, number> = {
  card_deal:    0.35,
  card_place:   0.60,
  card_capture: 0.90,
  announce:     0.70,
  caida:        0.80,
  mabqach:      0.85,
}

const players: Partial<Record<SoundName, AudioPlayer>> = {}
let initPromise: Promise<void> | null = null

// Sourdine (persiste pendant la session, pas de stockage disque nécessaire).
let muted = false
export function setMuted(v: boolean): void { muted = v }
export function isMuted(): boolean { return muted }

/**
 * Précharge tous les sons. Idempotent : appels multiples → un seul chargement.
 * À appeler une fois au démarrage de l'écran de jeu.
 */
export function initSounds(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      const Audio = require('expo-audio') as typeof import('expo-audio')
      await Audio.setAudioModeAsync({ playsInSilentMode: false })
      for (const name of Object.keys(FILES) as SoundName[]) {
        const player = Audio.createAudioPlayer(FILES[name])
        player.volume = VOLUME[name]
        players[name] = player
      }
    } catch {
      // Audio indisponible (module natif absent, web sans interaction…) :
      // le jeu reste pleinement jouable sans son.
    }
  })()
  return initPromise
}

/** Joue un son préchargé depuis le début (sans bloquer le jeu). */
export async function playSound(name: SoundName): Promise<void> {
  if (muted) return
  const player = players[name]
  if (!player) return
  try {
    player.seekTo(0)
    player.play()
  } catch {
    // ignore les erreurs de lecture
  }
}

/** Libère les sons (optionnel — utile pour un démontage complet). */
export async function unloadSounds(): Promise<void> {
  for (const k of Object.keys(players) as SoundName[]) {
    try { players[k]?.remove() } catch { /* déjà libéré */ }
    delete players[k]
  }
  initPromise = null
}

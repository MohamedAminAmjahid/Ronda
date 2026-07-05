import AsyncStorage from '@react-native-async-storage/async-storage'
import { setMuted } from '../ui/sounds'

// Préférence son unique et persistée (musique de fond + effets + sons du jeu).
// Clé AsyncStorage : ronda_sound_enabled ('1' actif, '0' coupé).

const KEY = 'ronda_sound_enabled'

let enabled = true
let loaded = false
const listeners = new Set<(v: boolean) => void>()

function emit(): void {
  // Répercute sur le module de sons du jeu existant (sounds.ts).
  try { setMuted(!enabled) } catch { /* sons indisponibles */ }
  for (const l of listeners) l(enabled)
}

export function getSoundEnabled(): boolean { return enabled }

export function subscribeSound(cb: (v: boolean) => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** Charge la préférence depuis AsyncStorage (idempotent). À appeler au démarrage. */
export async function loadSoundPref(): Promise<void> {
  if (loaded) return
  loaded = true
  try {
    const v = await AsyncStorage.getItem(KEY)
    if (v !== null) enabled = v === '1'
  } catch { /* stockage indisponible */ }
  emit()
}

/** Active/désactive le son et persiste. */
export async function setSoundEnabled(v: boolean): Promise<void> {
  enabled = v
  emit()
  try { await AsyncStorage.setItem(KEY, v ? '1' : '0') } catch { /* ignore */ }
}

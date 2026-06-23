import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Difficulty } from '../ai/bot'

// Difficulté de l'IA pour les parties solo (vs IA). Persistée entre sessions.
// Lue par les hooks solo au moment où le bot décide son coup, donc un simple
// module global suffit (pas besoin de la faire transiter par l'interface des hooks).

const KEY = 'ronda_difficulty'

let current: Difficulty = 'medium'
let loaded = false

export function getDifficulty(): Difficulty {
  return current
}

/** Charge la difficulté persistée (idempotent). */
export async function loadDifficulty(): Promise<Difficulty> {
  if (loaded) return current
  try {
    const v = await AsyncStorage.getItem(KEY)
    if (v === 'easy' || v === 'medium') current = v
  } catch {
    // stockage indisponible — valeur par défaut
  }
  loaded = true
  return current
}

export function setDifficulty(d: Difficulty): void {
  current = d
  loaded = true
  void AsyncStorage.setItem(KEY, d).catch(() => {})
}

export type { Difficulty }

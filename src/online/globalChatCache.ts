import AsyncStorage from '@react-native-async-storage/async-storage'

// Petit store singleton (même forme que profile.ts/messagesCache.ts) pour
// « dernier message mondial vu » — persisté pour survivre à une fermeture de
// l'app, avec pub-sub pour que le badge BottomNav se mette à jour dès que
// GlobalChatSlide marque le chat comme lu, sans attendre un remount.

const STORAGE_KEY = 'ronda_global_chat_last_seen'

let lastSeenAt = 0
let loaded = false
let loadingPromise: Promise<number> | null = null
const listeners = new Set<() => void>()

function notify(): void { for (const cb of listeners) cb() }

export function subscribeGlobalChatSeen(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** Horodatage (ms) du dernier message mondial vu — 0 avant chargement. */
export function getLastSeenGlobalChat(): number {
  return lastSeenAt
}

/** Charge la valeur persistée (idempotent). */
export function loadLastSeenGlobalChat(): Promise<number> {
  if (loaded) return Promise.resolve(lastSeenAt)
  if (loadingPromise) return loadingPromise
  loadingPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      lastSeenAt = raw ? Number(raw) || 0 : 0
    } catch {
      lastSeenAt = 0
    }
    loaded = true
    notify()
    return lastSeenAt
  })()
  return loadingPromise
}

/** Marque le chat mondial comme vu jusqu'à `atMs` (ignoré si plus ancien que
 * la valeur déjà connue — évite qu'un appel tardif fasse reculer le curseur). */
export function markGlobalChatSeen(atMs: number): void {
  if (atMs <= lastSeenAt) return
  lastSeenAt = atMs
  void AsyncStorage.setItem(STORAGE_KEY, String(atMs)).catch(() => {})
  notify()
}

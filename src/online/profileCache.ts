import { getUserById, type UserDoc } from '../firebase/firestore'

// Cache partagé au niveau module (même pattern que leaderboardCache.ts), par
// uid — TTL 5 min : un profil (stats, avatar, niveau) change à un rythme
// comparable au classement hebdo, ni aussi lent que les trophées all-time ni
// aussi rapide qu'une liste d'amis.
const CACHE_TTL_MS = 5 * 60 * 1000

interface CacheEntry {
  data:      UserDoc
  fetchedAt: number
}

const cache = new Map<string, CacheEntry>()
const listeners = new Set<() => void>()

export function subscribeProfile(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

function notify(): void { for (const l of listeners) l() }

/** Retourne le profil en cache, même périmé (affichage optimiste immédiat). */
export function getCachedProfile(uid: string): UserDoc | null {
  return cache.get(uid)?.data ?? null
}

export function isProfileStale(uid: string): boolean {
  const entry = cache.get(uid)
  if (!entry) return true
  return Date.now() - entry.fetchedAt > CACHE_TTL_MS
}

/** Refetch et met à jour le cache — silencieux en cas d'échec ou de profil
 * introuvable (le cache existant, s'il y en a un, reste affiché tel quel). */
export async function refreshProfile(uid: string): Promise<void> {
  try {
    const data = await getUserById(uid)
    if (data) {
      cache.set(uid, { data, fetchedAt: Date.now() })
      notify()
    }
  } catch {
    // silencieux — l'appelant garde ce qu'il avait déjà affiché
  }
}

/** Préchauffe le cache d'un profil en arrière-plan. */
export function preloadProfile(uid: string): void {
  void refreshProfile(uid)
}

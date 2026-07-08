import { fetchWeeklyLeaderboard, type WeeklyEntry } from './client'

// Cache partagé au niveau module — même instance quel que soit le composant
// qui l'utilise, donc un refresh déclenché par un écran profite à tous les
// autres déjà montés (LeaderboardScreen, preload au login, etc.), sans
// dupliquer les appels réseau vers Railway.

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheEntry {
  data:      WeeklyEntry[]
  fetchedAt: number
}

const cache = new Map<string, CacheEntry>()
const listeners = new Set<() => void>()

export function subscribeLeaderboard(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

function notify(): void { for (const l of listeners) l() }

/** Retourne les données en cache, même périmées (affichage optimiste immédiat). */
export function getCachedLeaderboard(league: string): WeeklyEntry[] | null {
  return cache.get(league)?.data ?? null
}

export function isStale(league: string): boolean {
  const entry = cache.get(league)
  if (!entry) return true
  return Date.now() - entry.fetchedAt > CACHE_TTL_MS
}

/** Refetch Railway et met à jour le cache — silencieux en cas d'échec (le
 * cache existant, s'il y en a un, reste affiché tel quel). */
export async function refreshLeaderboard(league: string): Promise<void> {
  try {
    const data = await fetchWeeklyLeaderboard(league)
    cache.set(league, { data, fetchedAt: Date.now() })
    notify()
  } catch {
    // silencieux — l'appelant garde ce qu'il avait déjà affiché
  }
}

/** Préchauffe le cache d'une ligue en arrière-plan (voir sync.ts, au login). */
export function preloadLeaderboard(league: string): void {
  void refreshLeaderboard(league)
}

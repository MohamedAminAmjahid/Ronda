import { getFriends, getPendingRequests, type FriendDoc } from '../firebase/firestore'

// Cache partagé au niveau module (même pattern que leaderboardCache.ts). TTL
// court (2 min) : la liste d'amis peut changer souvent (nouvelle demande,
// ami accepté/supprimé) — contrairement au classement hebdo ou aux trophées
// all-time, ici la fraîcheur compte plus que l'économie de requêtes.
const CACHE_TTL_MS = 2 * 60 * 1000

export interface FriendsData {
  friends:  FriendDoc[]
  requests: FriendDoc[]
}

interface CacheEntry {
  data:      FriendsData
  fetchedAt: number
}

const cache = new Map<string, CacheEntry>()
const listeners = new Set<() => void>()

export function subscribeFriends(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

function notify(): void { for (const l of listeners) l() }

/** Retourne les données en cache, même périmées (affichage optimiste immédiat). */
export function getCachedFriends(uid: string): FriendsData | null {
  return cache.get(uid)?.data ?? null
}

export function isFriendsStale(uid: string): boolean {
  const entry = cache.get(uid)
  if (!entry) return true
  return Date.now() - entry.fetchedAt > CACHE_TTL_MS
}

/**
 * Refetch et met à jour le cache. Utilisée aussi bien pour le refresh
 * silencieux en arrière-plan que pour un refresh FORCÉ après une action de
 * l'utilisateur (accepter/refuser/supprimer un ami, envoyer une demande) —
 * dans ce dernier cas l'appelant doit vouloir des données fraîches
 * immédiatement, peu importe le TTL, donc il appelle directement cette
 * fonction plutôt que de passer par isFriendsStale().
 */
export async function refreshFriends(uid: string): Promise<void> {
  try {
    const [friends, requests] = await Promise.all([getFriends(uid), getPendingRequests(uid)])
    cache.set(uid, { data: { friends, requests }, fetchedAt: Date.now() })
    notify()
  } catch {
    // silencieux — l'appelant garde ce qu'il avait déjà affiché
  }
}

/** Préchauffe le cache d'un utilisateur en arrière-plan (voir sync.ts, au login). */
export function preloadFriends(uid: string): void {
  void refreshFriends(uid)
}

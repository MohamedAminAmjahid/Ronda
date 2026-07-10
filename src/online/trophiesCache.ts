import {
  getTopUsers, getFriends, getUserById, getWeeklyWagered, getWeeklyWageredLeaderboard,
  type FriendDoc,
} from '../firebase/firestore'

// Cache partagé au niveau module (même pattern que leaderboardCache.ts) — les
// 8 classements Trophées sont des données all-time, qui changent lentement :
// TTL plus long (10 min) que le classement hebdo (5 min).
const CACHE_TTL_MS = 10 * 60 * 1000

// Seuil de parties minimum pour apparaître au classement du taux de victoire
// — sinon un joueur à 1 partie jouée et gagnée écraserait tout le monde à 100%.
const MIN_GAMES_FOR_WINRATE = 10
// Taille du bassin de candidats (les plus actifs par gamesPlayed) dans lequel
// le taux de victoire est calculé — PAS un scan exhaustif de tous les
// utilisateurs (impraticable côté client). Un joueur avec ≥10 parties mais
// hors des 200 comptes les plus actifs de toute l'app ne sera pas détecté :
// approximation assumée, pas un vrai top exhaustif.
const WINRATE_POOL_SIZE = 200

// Même approximation pour « Meilleur de ma ville/mon pays » : filtré parmi le
// top 200 (or) plutôt qu'un vrai scan where(city==)+orderBy(gold) — une telle
// requête combinerait égalité sur un champ et tri sur un autre, ce qui exige
// un index composite Firestore ; ce repo ne contient ni firestore.rules ni
// firestore.indexes.json (règles/index gérés hors-dépôt, Console Firebase),
// donc pas de moyen de garantir qu'un tel index existe. Un joueur au-dessus
// du reste de sa ville/pays mais hors du top 200 global ne sera pas détecté.
const GEO_POOL_SIZE = 200

export type MetricKey =
  | 'level' | 'gold' | 'gamesWon' | 'currentStreak'
  | 'gamesPlayed' | 'winRate' | 'weeklyWagered' | 'friendCount'

export interface TrophyEntry {
  uid:         string
  username:    string
  avatarType:  string
  avatarEmoji: string
  avatarImage: string
  value:       number
}

export interface TrophiesData {
  global:     Record<MetricKey, TrophyEntry[]>
  friends:    Record<MetricKey, TrophyEntry[]>
  hasFriends: boolean
  /** Classement (or) filtré à ma ville/mon pays — vide si non renseigné. */
  cityTop:    TrophyEntry[]
  countryTop: TrophyEntry[]
  myCity:     string
  myCountry:  string
}

interface StatShape {
  level: number
  gold: number
  gamesWon: number
  gamesPlayed: number
  currentStreak: number
  friendCount: number
}

const METRIC_KEYS: MetricKey[] = [
  'level', 'gold', 'gamesWon', 'currentStreak', 'gamesPlayed', 'winRate', 'weeklyWagered', 'friendCount',
]

function toEntry(
  u: { uid: string; username: string; avatarType?: string; avatarEmoji?: string; avatarImage?: string },
  value: number,
): TrophyEntry {
  return {
    uid: u.uid, username: u.username,
    avatarType: u.avatarType ?? 'initial', avatarEmoji: u.avatarEmoji ?? '', avatarImage: u.avatarImage ?? '',
    value,
  }
}

/** Construit l'entrée d'une métrique pour un joueur — null si non éligible
 * (uniquement le taux de victoire, sous le seuil de parties). */
function buildEntry(
  u: { uid: string; username: string; avatarType?: string; avatarEmoji?: string; avatarImage?: string },
  metric: MetricKey,
  stats: StatShape,
  weeklyGold: number,
): TrophyEntry | null {
  switch (metric) {
    case 'level':         return toEntry(u, stats.level)
    case 'gold':           return toEntry(u, stats.gold)
    case 'gamesWon':       return toEntry(u, stats.gamesWon)
    case 'currentStreak':  return toEntry(u, stats.currentStreak)
    case 'gamesPlayed':    return toEntry(u, stats.gamesPlayed)
    case 'friendCount':    return toEntry(u, stats.friendCount)
    case 'weeklyWagered':  return toEntry(u, weeklyGold)
    case 'winRate':
      if (stats.gamesPlayed < MIN_GAMES_FOR_WINRATE) return null
      return toEntry(u, Math.round((stats.gamesWon / stats.gamesPlayed) * 100))
  }
}

function emptyEntries(): Record<MetricKey, TrophyEntry[]> {
  return {
    level: [], gold: [], gamesWon: [], currentStreak: [],
    gamesPlayed: [], winRate: [], weeklyWagered: [], friendCount: [],
  }
}

async function fetchTrophiesData(myUid: string | null): Promise<TrophiesData> {
  const [level, gold, gamesWon, currentStreak, gamesPlayedPool, friendCount, geoPool, weeklyTop, mine, friends] =
    await Promise.all([
      getTopUsers('level'),
      getTopUsers('gold'),
      getTopUsers('gamesWon'),
      getTopUsers('currentStreak'),
      getTopUsers('gamesPlayed', WINRATE_POOL_SIZE),
      getTopUsers('friendCount'),
      getTopUsers('gold', GEO_POOL_SIZE),
      getWeeklyWageredLeaderboard(50),
      myUid ? getUserById(myUid) : Promise.resolve(null),
      myUid ? getFriends(myUid) : Promise.resolve<FriendDoc[]>([]),
    ])

  const winRateTop = gamesPlayedPool
    .filter((u) => u.gamesPlayed >= MIN_GAMES_FOR_WINRATE)
    .map((u) => toEntry(u, Math.round((u.gamesWon / u.gamesPlayed) * 100)))
    .sort((a, b) => b.value - a.value)
    .slice(0, 50)

  const global: Record<MetricKey, TrophyEntry[]> = {
    level:         level.map((u) => toEntry(u, u.level)),
    gold:          gold.map((u) => toEntry(u, u.gold)),
    gamesWon:      gamesWon.map((u) => toEntry(u, u.gamesWon)),
    currentStreak: currentStreak.map((u) => toEntry(u, u.currentStreak)),
    gamesPlayed:   gamesPlayedPool.slice(0, 50).map((u) => toEntry(u, u.gamesPlayed)),
    friendCount:   friendCount.map((u) => toEntry(u, u.friendCount)),
    winRate:       winRateTop,
    weeklyWagered: weeklyTop.map((w) => toEntry(w, w.gold)),
  }

  // Or misé cette semaine, pour moi + mes amis — requêtes ciblées par doc id
  // déterministe (weekly_scores/{semaine}_{username}_{jeu}), pas de scan :
  // bon marché même avec beaucoup d'amis.
  const names = [...(mine ? [mine.username] : []), ...friends.map((f) => f.username)]
  const weeklyAmounts = await Promise.all(names.map((n) => getWeeklyWagered(n)))
  const weeklyByUsername = new Map(names.map((n, i) => [n, weeklyAmounts[i]]))

  const meStats: StatShape | null = mine ? {
    level: mine.level, gold: mine.gold, gamesWon: mine.gamesWon,
    gamesPlayed: mine.gamesPlayed, currentStreak: mine.currentStreak, friendCount: mine.friendCount,
  } : null

  const friendsOut = {} as Record<MetricKey, TrophyEntry[]>
  for (const metric of METRIC_KEYS) {
    const meEntry = mine && meStats
      ? buildEntry(mine, metric, meStats, weeklyByUsername.get(mine.username) ?? 0)
      : null
    const friendEntries = friends
      .map((f) => buildEntry(f, metric, {
        level: f.level ?? 1, gold: f.gold ?? 0, gamesWon: f.gamesWon ?? 0,
        gamesPlayed: f.gamesPlayed ?? 0, currentStreak: f.currentStreak ?? 0, friendCount: f.friendCount ?? 0,
      }, weeklyByUsername.get(f.username) ?? 0))
      .filter((e): e is TrophyEntry => e !== null)
    const list = [...(meEntry ? [meEntry] : []), ...friendEntries]
    list.sort((a, b) => b.value - a.value)
    friendsOut[metric] = list
  }

  // Classement géo (or), filtré à ma ville/pays parmi le top 200 global — voir
  // GEO_POOL_SIZE. Déjà trié par gold décroissant (orderBy Firestore), le
  // filtre préserve cet ordre.
  const myCity = mine?.city ?? ''
  const myCountry = mine?.country ?? ''
  const cityTop = myCity
    ? geoPool.filter((u) => u.city === myCity).map((u) => toEntry(u, u.gold))
    : []
  const countryTop = myCountry
    ? geoPool.filter((u) => u.country === myCountry).map((u) => toEntry(u, u.gold))
    : []

  return {
    global, friends: friendsOut, hasFriends: friends.length > 0,
    cityTop, countryTop, myCity, myCountry,
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
  data:      TrophiesData
  fetchedAt: number
}

const cache = new Map<string, CacheEntry>()
const listeners = new Set<() => void>()

function key(myUid: string | null): string { return myUid ?? 'anon' }

export function subscribeTrophies(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

function notify(): void { for (const l of listeners) l() }

/** Retourne les données en cache, même périmées (affichage optimiste immédiat). */
export function getCachedTrophies(myUid: string | null): TrophiesData | null {
  return cache.get(key(myUid))?.data ?? null
}

export function isTrophiesStale(myUid: string | null): boolean {
  const entry = cache.get(key(myUid))
  if (!entry) return true
  return Date.now() - entry.fetchedAt > CACHE_TTL_MS
}

/** Refetch et met à jour le cache — silencieux en cas d'échec (le cache
 * existant, s'il y en a un, reste affiché tel quel). */
export async function refreshTrophies(myUid: string | null): Promise<void> {
  try {
    const data = await fetchTrophiesData(myUid)
    cache.set(key(myUid), { data, fetchedAt: Date.now() })
    notify()
  } catch {
    // silencieux — l'appelant garde ce qu'il avait déjà affiché
  }
}

/** Préchauffe le cache en arrière-plan (voir sync.ts, au login). */
export function preloadTrophies(myUid: string | null): void {
  void refreshTrophies(myUid)
}

export { emptyEntries as emptyTrophyEntries }

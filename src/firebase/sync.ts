import { useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from './auth'
import { createOrUpdateUser, registerPendingReferral, migrateFriendCounts } from './firestore'
import { fetchUserLeague } from '../online/client'
import { preloadLeaderboard } from '../online/leaderboardCache'
import { preloadFriends } from '../online/friendsCache'
import { preloadConversations } from '../online/messagesCache'
import {
  getProfile, loadProfile, setUsername, setGold, setUsernameChanges, setGoldHistoryPublicLocal,
  setStatsPublicLocal, setInvisibleModeLocal, setStatsLocal, setCosmeticsLocal, setXpLevelLocal, setAvatarLocal,
} from '../profile/profile'

const REFERRAL_CODE_KEY = 'ronda_referral_code'
const FRIENDCOUNT_MIGRATED_KEY = 'ronda_friendcount_migrated'

// Anti-rafale : onAuthStateChanged peut réémettre pour le même uid bien après
// que le 1er appel a fini (ex. refresh de token ~1h, ou revalidation réseau),
// donc hors de portée du guard anti-course pendingCreateOrUpdate côté
// firestore.ts (qui ne protège que les appels VRAIMENT concurrents, pas deux
// appels successifs mais rapprochés). Un cooldown court évite de relancer
// createOrUpdateUser (et donc une lecture Firestore + un cycle de sync local)
// pour un événement redondant survenant juste après le précédent.
const RESYNC_COOLDOWN_MS = 10_000
const lastCallTime = new Map<string, number>()

/**
 * Synchronise username, gold et usernameChanges local ↔ Firebase à la connexion :
 *  - 1er login → le document Firebase reprend le profil local (avec résolution de
 *    conflit de username si nécessaire).
 *  - compte existant → on charge les valeurs Firebase dans le store local.
 * Monté une fois au niveau racine (_layout) ; couvre login explicite et session
 * persistée (rechargement web).
 */
export function useFirebaseProfileSync(): void {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    const now = Date.now()
    const last = lastCallTime.get(user.uid) ?? 0
    if (now - last < RESYNC_COOLDOWN_MS) return
    lastCallTime.set(user.uid, now)
    let cancelled = false
    void (async () => {
      try {
        await loadProfile()
        const p = getProfile()
        const {
          username, gold, usernameChanges, goldHistoryPublic, statsPublic, invisibleMode,
          table, ownedTables, cardBack, ownedBacks, avatarFrame, ownedFrames,
          avatarType, avatarEmoji, avatarImage,
          xp, level,
          gamesPlayed, gamesWon, rondaPlayed, rondaWon, dijoujPlayed, dijoujWon,
        } = await createOrUpdateUser(user, {
          username: p.username,
          gold: p.gold,
          gamesPlayed: p.gamesPlayed,
          gamesWon: p.gamesWon,
          rondaPlayed: p.rondaPlayed,
          rondaWon: p.rondaWon,
          dijoujPlayed: p.dijoujPlayed,
          dijoujWon: p.dijoujWon,
          usernameChanges: p.usernameChanges,
          goldHistoryPublic: p.goldHistoryPublic,
          table: p.table,
          ownedTables: p.ownedTables,
          cardBack: p.cardBack,
          ownedBacks: p.ownedBacks,
          avatarFrame: p.avatarFrame,
          ownedFrames: p.ownedFrames,
          avatarType: p.avatarType,
          avatarEmoji: p.avatarEmoji,
          avatarImage: p.avatarImage,
          xp: p.xp,
          level: p.level,
        })
        if (!cancelled) {
          // Firestore fait autorité : on n'écrase le local QUE si la valeur diffère.
          // Ne jamais renvoyer le username local vers Firestore ici.
          if (username && username !== p.username) setUsername(username)
          setGold(gold)
          setUsernameChanges(usernameChanges)
          setGoldHistoryPublicLocal(goldHistoryPublic)
          setStatsPublicLocal(statsPublic)
          setInvisibleModeLocal(invisibleMode)
          setStatsLocal({ gamesPlayed, gamesWon, rondaPlayed, rondaWon, dijoujPlayed, dijoujWon })
          setCosmeticsLocal({ table, ownedTables, cardBack, ownedBacks, avatarFrame, ownedFrames })
          setAvatarLocal(avatarType, avatarEmoji, avatarImage)
          setXpLevelLocal(xp, level)
        }

        // Préchauffe le cache du classement hebdo de la ligue du joueur, en
        // arrière-plan — LeaderboardScreen l'affichera instantanément au lieu
        // d'attendre Railway au premier clic sur l'onglet. Best-effort, ne
        // bloque jamais le reste du login (voir leaderboardCache.ts).
        void fetchUserLeague(username || p.username)
          .then((league) => preloadLeaderboard(league))
          .catch(() => {})

        // Précharge la liste d'amis en arrière-plan — l'écran Amis l'affiche
        // instantanément au lieu d'attendre Firestore à la 1re visite.
        preloadFriends(user.uid)

        // Idem pour la liste des conversations (écran Messages).
        preloadConversations(user.uid)

        // Parrainage : enregistre le filleul « en attente » chez le parrain (le
        // crédit sera appliqué à sa 1re partie). No-op si déjà parrainé.
        try {
          const code = await AsyncStorage.getItem(REFERRAL_CODE_KEY)
          if (code) void registerPendingReferral(code, user.uid, username || getProfile().username)
        } catch { /* stockage indisponible */ }

        // Migration one-time friendCount (voir migrateFriendCounts) : les
        // amitiés acceptées avant l'introduction du champ n'ont jamais
        // incrémenté le compteur. Une seule fois par appareil.
        try {
          const migrated = await AsyncStorage.getItem(FRIENDCOUNT_MIGRATED_KEY)
          if (!migrated) {
            await migrateFriendCounts(user.uid)
            await AsyncStorage.setItem(FRIENDCOUNT_MIGRATED_KEY, '1')
          }
        } catch { /* stockage indisponible ou hors-ligne — retentera au prochain login */ }
      } catch (err) {
        console.warn('[sync] hors-ligne ou règles Firestore :', err)
        // on garde le profil local
      }
    })()
    return () => { cancelled = true }
  }, [user])
}

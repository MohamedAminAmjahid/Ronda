import { useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from './auth'
import { createOrUpdateUser, registerPendingReferral } from './firestore'
import {
  getProfile, loadProfile, setUsername, setGold, setUsernameChanges, setGoldHistoryPublicLocal,
  setStatsPublicLocal, setCosmeticsLocal,
} from '../profile/profile'

const REFERRAL_CODE_KEY = 'ronda_referral_code'

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
    let cancelled = false
    void (async () => {
      try {
        await loadProfile()
        const p = getProfile()
        console.log('[sync] login uid:', user.uid, '| username local:', p.username)
        const {
          username, gold, usernameChanges, goldHistoryPublic, statsPublic,
          table, ownedTables, cardBack, ownedBacks, avatarFrame, ownedFrames,
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
        })
        console.log('[sync] Firebase → username:', username, '| gold:', gold, '| usernameChanges:', usernameChanges)
        if (!cancelled) {
          if (username) setUsername(username)
          setGold(gold)
          setUsernameChanges(usernameChanges)
          setGoldHistoryPublicLocal(goldHistoryPublic)
          setStatsPublicLocal(statsPublic)
          setCosmeticsLocal({ table, ownedTables, cardBack, ownedBacks, avatarFrame, ownedFrames })
        }

        // Parrainage : enregistre le filleul « en attente » chez le parrain (le
        // crédit sera appliqué à sa 1re partie). No-op si déjà parrainé.
        try {
          const code = await AsyncStorage.getItem(REFERRAL_CODE_KEY)
          if (code) void registerPendingReferral(code, user.uid, username || getProfile().username)
        } catch { /* stockage indisponible */ }
      } catch (err) {
        console.warn('[sync] hors-ligne ou règles Firestore :', err)
        // on garde le profil local
      }
    })()
    return () => { cancelled = true }
  }, [user])
}

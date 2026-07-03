import { useEffect, useState } from 'react'
import {
  getProfile,
  loadProfile,
  subscribeProfile,
  setUsername,
  addGold,
  removeGold,
  addXP,
  setAvatarEmoji,
  setAvatarImage,
  clearAvatar,
  giftGold,
  transferGold,
  setGoldHistoryPublic,
  setStatsPublic,
  buyCosmetic,
  equipCosmetic,
  giftCost,
  DAILY_TRANSFER_LIMIT,
  type Profile,
} from './profile'

export type { Profile }

/**
 * Hook React du profil joueur. Déclenche le chargement (idempotent) au montage,
 * et se ré-rend à chaque changement (username / gold).
 */
export function useProfile() {
  const [profile, setProfile] = useState<Profile>(getProfile)

  useEffect(() => {
    const unsub = subscribeProfile(setProfile)
    void loadProfile().then(setProfile)
    return unsub
  }, [])

  return {
    username:       profile.username,
    gold:           profile.gold,
    gamesPlayed:    profile.gamesPlayed,
    gamesWon:       profile.gamesWon,
    usernameChanges: profile.usernameChanges,
    rondaPlayed:    profile.rondaPlayed,
    rondaWon:       profile.rondaWon,
    dijoujPlayed:   profile.dijoujPlayed,
    dijoujWon:      profile.dijoujWon,
    avatarType:     profile.avatarType,
    avatarEmoji:    profile.avatarEmoji,
    avatarImage:    profile.avatarImage,
    dailyTransferSent: profile.dailyTransferSent,
    dailyTransferDate: profile.dailyTransferDate,
    goldHistoryPublic: profile.goldHistoryPublic,
    statsPublic:    profile.statsPublic,
    table:          profile.table,
    ownedTables:    profile.ownedTables,
    cardBack:       profile.cardBack,
    ownedBacks:     profile.ownedBacks,
    avatarFrame:    profile.avatarFrame,
    ownedFrames:    profile.ownedFrames,
    xp:             profile.xp,
    level:          profile.level,
    setUsername,
    addGold,
    removeGold,
    addXP,
    setAvatarEmoji,
    setAvatarImage,
    clearAvatar,
    giftGold,
    transferGold,
    setGoldHistoryPublic,
    setStatsPublic,
    buyCosmetic,
    equipCosmetic,
    giftCost,
    DAILY_TRANSFER_LIMIT,
  }
}

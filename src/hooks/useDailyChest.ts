import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { addGold } from '../profile/profile'

const CHEST_KEY  = 'ronda_chest_date'
const BONUS_KEY  = 'ronda_daily_bonus'   // même clé que useDailyBonus pour lire le streak

export type ChestLevel = 'bronze' | 'silver' | 'gold' | 'diamond'

interface ChestReward {
  level:     ChestLevel
  gold:      number
  minGold:   number
  maxGold:   number
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function levelFromStreak(streak: number): ChestLevel {
  if (streak >= 7)          return 'diamond'
  if (streak >= 5)          return 'gold'
  if (streak >= 3)          return 'silver'
  return 'bronze'
}

const RANGES: Record<ChestLevel, [number, number]> = {
  bronze:  [50,  150],
  silver:  [150, 300],
  gold:    [300, 600],
  diamond: [500, 1000],
}

export function useDailyChest() {
  const [reward, setReward] = useState<ChestReward | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const [chestDate, bonusRaw] = await Promise.all([
          AsyncStorage.getItem(CHEST_KEY),
          AsyncStorage.getItem(BONUS_KEY),
        ])
        if (chestDate === today()) return   // déjà ouvert aujourd'hui

        const stored = bonusRaw ? (JSON.parse(bonusRaw) as { streak?: number }) : null
        const streak = stored?.streak ?? 1
        const level  = levelFromStreak(streak)
        const [min, max] = RANGES[level]
        const gold = Math.floor(Math.random() * (max - min + 1)) + min
        setReward({ level, gold, minGold: min, maxGold: max })
      } catch {
        // sans effet
      }
    })()
  }, [])

  const openChest = async () => {
    if (!reward) return
    addGold(reward.gold)
    await AsyncStorage.setItem(CHEST_KEY, today()).catch(() => {})
    setReward(null)
  }

  return { reward, openChest }
}

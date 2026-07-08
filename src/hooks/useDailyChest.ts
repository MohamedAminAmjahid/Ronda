import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { addGold } from '../profile/profile'

const CHEST_KEY  = 'ronda_chest_date'
const BONUS_KEY  = 'ronda_daily_bonus'   // même clé que useDailyBonus pour lire le streak

export type ChestLevel = 'bronze' | 'silver' | 'gold' | 'diamond'

export interface ChestReward {
  level:   ChestLevel
  minGold: number
  maxGold: number
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

/** Tire un montant aléatoire dans la plage du niveau — appelé au clic sur
 * « Ouvrir », jamais au montage (sinon le montant serait figé pour la journée). */
function randReward(level: ChestLevel): number {
  const [min, max] = RANGES[level]
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// ── Store partagé ─────────────────────────────────────────────────────────────
// _layout.tsx (popup auto), MenuScreen.tsx (bouton rapide) et GoldShopScreen.tsx
// appellent tous useDailyChest() indépendamment. Avec un état local par
// composant, chacun tirerait son propre montant aléatoire pour « le même »
// coffre du jour — celui affiché dépendrait alors de l'écran ouvert en premier.
// Un seul état de module, partagé et chargé une seule fois, élimine ce risque.
let reward: ChestReward | null = null
let loadPromise: Promise<void> | null = null
const listeners = new Set<() => void>()
function emit(): void { for (const l of listeners) l() }

async function load(): Promise<void> {
  try {
    const [chestDate, bonusRaw] = await Promise.all([
      AsyncStorage.getItem(CHEST_KEY),
      AsyncStorage.getItem(BONUS_KEY),
    ])
    if (chestDate === today()) {
      reward = null   // déjà ouvert aujourd'hui
    } else {
      const stored = bonusRaw ? (JSON.parse(bonusRaw) as { streak?: number }) : null
      const streak = stored?.streak ?? 1
      const level  = levelFromStreak(streak)
      const [min, max] = RANGES[level]
      reward = { level, minGold: min, maxGold: max }
    }
  } catch {
    reward = null
  } finally {
    emit()
  }
}

export function useDailyChest() {
  const [, forceRender] = useState(0)

  useEffect(() => {
    if (!loadPromise) loadPromise = load()
    const listener = () => forceRender((n) => n + 1)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  /**
   * Tire le montant MAINTENANT (au clic), le crédite, marque le coffre comme
   * ouvert pour la journée, et renvoie le montant réellement crédité — pour
   * que l'appelant (DailyChestModal) affiche exactement ce qui a été ajouté
   * via addGold(), jamais une valeur différente pré-calculée au montage.
   */
  const openChest = async (): Promise<number> => {
    if (!reward) return 0
    const gold = randReward(reward.level)
    addGold(gold)
    reward = null
    await AsyncStorage.setItem(CHEST_KEY, today()).catch(() => {})
    emit()
    return gold
  }

  return { reward, openChest }
}

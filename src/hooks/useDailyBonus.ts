import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { addGold } from '../profile/profile'

const KEY = 'ronda_daily_bonus'

export const STREAK_REWARDS = [100, 150, 200, 300, 400, 500, 750] as const

/** Récompense d'un jour de streak : paliers 1–7, puis 750 🪙 pour tout jour ≥ 7. */
export function streakReward(streak: number): number {
  return STREAK_REWARDS[Math.min(Math.max(streak, 1) - 1, STREAK_REWARDS.length - 1)]
}

export interface DailyBonusState {
  streak:    number   // ≥ 1 (continue indéfiniment au-delà de 7)
  goldToday: number   // récompense du jour courant
}

interface Stored {
  lastClaim: string   // 'YYYY-MM-DD'
  streak:    number
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function yesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Gère le bonus de connexion journalier avec streak 1–7.
 * Retourne le bonus à réclamer (null si déjà réclamé aujourd'hui)
 * et une fonction `claim()` qui crédite le gold et persiste l'état.
 */
export function useDailyBonus() {
  const [pending, setPending] = useState<DailyBonusState | null>(null)
  const [claimed, setClaimed] = useState(false)
  const [streak, setStreak] = useState(1)
  const [alreadyClaimed, setAlreadyClaimed] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY)
        const stored: Stored | null = raw ? (JSON.parse(raw) as Stored) : null
        const td = today()

        if (stored?.lastClaim === td) {
          setStreak(stored.streak)
          setAlreadyClaimed(true)
          return
        }

        // Le streak monte indéfiniment (J8, J9, …) tant qu'on se connecte chaque
        // jour ; il ne repart à 1 que si un jour est manqué.
        let newStreak = 1
        if (stored?.lastClaim === yesterday()) {
          newStreak = stored.streak + 1
        }

        setStreak(newStreak)
        setPending({ streak: newStreak, goldToday: streakReward(newStreak) })
      } catch {
        // AsyncStorage indisponible — on skip silencieusement
      }
    })()
  }, [])

  const claim = async () => {
    if (!pending) return
    try {
      const stored: Stored = { lastClaim: today(), streak: pending.streak }
      await AsyncStorage.setItem(KEY, JSON.stringify(stored))
      addGold(pending.goldToday)
      setClaimed(true)
      setAlreadyClaimed(true)
      setPending(null)
    } catch {
      // sans effet
    }
  }

  return { pending, claimed, claim, streak, alreadyClaimed }
}

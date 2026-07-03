import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { addGold } from '../profile/profile'

const KEY = 'ronda_spin_date'

export interface SpinPrize {
  label: string
  gold:  number
  prob:  number
  color: string
  emoji: string
}

export const SPIN_PRIZES: SpinPrize[] = [
  { label: '+50',      gold: 50,   prob: 95,   color: '#27AE60', emoji: '🪙' },
  { label: '+100',     gold: 100,  prob: 2,    color: '#2980B9', emoji: '🪙' },
  { label: '+200',     gold: 200,  prob: 1.5,  color: '#8E44AD', emoji: '🪙' },
  { label: '+500',     gold: 500,  prob: 0.8,  color: '#E74C3C', emoji: '🪙' },
  { label: '+1000',    gold: 1000, prob: 0.4,  color: '#D35400', emoji: '💎' },
  { label: '+2500',    gold: 2500, prob: 0.2,  color: '#922B21', emoji: '💎' },
  { label: 'Cosmétic.',gold: 500,  prob: 0.07, color: '#6C3483', emoji: '🎨' },
  { label: 'JACKPOT',  gold: 5000, prob: 0.03, color: '#C9A227', emoji: '⭐' },
]

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Tirage aléatoire pondéré — retourne l'index du prix. */
export function pickPrize(): number {
  const rand = Math.random() * 100
  let cumul = 0
  for (let i = 0; i < SPIN_PRIZES.length; i++) {
    cumul += SPIN_PRIZES[i].prob
    if (rand < cumul) return i
  }
  return 0
}

export function useSpinWheel() {
  const [canSpin, setCanSpin] = useState(false)

  useEffect(() => {
    void AsyncStorage.getItem(KEY).then(v => {
      setCanSpin(v !== today())
    }).catch(() => setCanSpin(true))
  }, [])

  const spin = async (): Promise<number> => {
    const idx = pickPrize()
    const prize = SPIN_PRIZES[idx]
    addGold(prize.gold)
    await AsyncStorage.setItem(KEY, today()).catch(() => {})
    setCanSpin(false)
    return idx
  }

  return { canSpin, spin }
}

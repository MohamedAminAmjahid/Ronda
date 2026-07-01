import type { TranslationKey } from '../i18n/translations'

// Cadres d'avatar premium.

export interface FrameDef {
  id: string
  nameKey: TranslationKey
  price: number
  /** Couleurs de l'anneau : 1 = uni, 2+ = dégradé. */
  ring: string[]
  /** Couleur de la lueur (halo). */
  glow: string
  /** Épaisseur de l'anneau. */
  width: number
  /** Anneau animé (pulsation de la lueur). */
  animated: boolean
}

export const DEFAULT_FRAME = 'none'

export const FRAMES: FrameDef[] = [
  { id: 'none',    nameKey: 'frameNone',    price: 0,    ring: ['#C9A227'],                       glow: 'transparent', width: 2,   animated: false },
  { id: 'gold',    nameKey: 'frameGold',    price: 300,  ring: ['#F5D26B', '#C9A227'],            glow: '#C9A227',     width: 3,   animated: true },
  { id: 'diamond', nameKey: 'frameDiamond', price: 700,  ring: ['#BFEFFF', '#3AA0E0'],            glow: '#7FD8FF',     width: 3,   animated: true },
  { id: 'fire',    nameKey: 'frameFire',    price: 1000, ring: ['#FFB03A', '#FF6B2C', '#C0392B'], glow: '#FF6B2C',     width: 3.5, animated: true },
  { id: 'royal',   nameKey: 'frameRoyal',   price: 2000, ring: ['#F7E39B', '#C9A227', '#7A5A17'], glow: '#C9A227',     width: 4,   animated: true },
]

/** Définition du cadre (repli : none). */
export function frameDef(id: string): FrameDef {
  return FRAMES.find(f => f.id === id) ?? FRAMES[0]
}

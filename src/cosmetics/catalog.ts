import type { TranslationKey } from '../i18n/translations'

// Catalogue des cosmétiques : tapis de jeu (fond) et dos de cartes.

export type CosmeticKind = 'table' | 'back'

export interface TableDef {
  id: string
  nameKey: TranslationKey
  price: number
  /** Dégradé de fond [haut, bas]. */
  colors: [string, string]
}

export interface BackDef {
  id: string
  nameKey: TranslationKey
  price: number
  bg: string
  border: string
  star: string
}

export const DEFAULT_TABLE = 'green'
export const DEFAULT_BACK = 'default'

export const TABLES: TableDef[] = [
  { id: 'green', nameKey: 'tableGreen', price: 0,    colors: ['#0E5C4A', '#09402F'] },
  { id: 'dark',  nameKey: 'tableDark',  price: 400,  colors: ['#1E1E1E', '#0B0B0B'] },
  { id: 'sand',  nameKey: 'tableSand',  price: 600,  colors: ['#C2A878', '#9E8250'] },
  { id: 'blue',  nameKey: 'tableBlue',  price: 900,  colors: ['#16324F', '#0B1E33'] },
  { id: 'red',   nameKey: 'tableRed',   price: 1200, colors: ['#5A1020', '#3A0A14'] },
]

export const BACKS: BackDef[] = [
  { id: 'default', nameKey: 'backDefault', price: 0,   bg: '#09402F', border: '#C9A227', star: '#C9A227' },
  { id: 'noir',    nameKey: 'backNoir',    price: 200, bg: '#1C1C1C', border: '#C9A227', star: '#C9A227' },
  { id: 'sable',   nameKey: 'backSable',   price: 350, bg: '#8B6B3A', border: '#F4ECD8', star: '#F4ECD8' },
  { id: 'azur',    nameKey: 'backAzur',    price: 550, bg: '#16324F', border: '#C9A227', star: '#C9A227' },
  { id: 'rubis',   nameKey: 'backRubis',   price: 750, bg: '#5A1020', border: '#C9A227', star: '#C9A227' },
]

/** Dégradé de fond du tapis équipé (repli : green). */
export function tableColors(id: string): [string, string] {
  return (TABLES.find(t => t.id === id) ?? TABLES[0]).colors
}

/** Design du dos de carte équipé (repli : default). */
export function backDesign(id: string): BackDef {
  return BACKS.find(b => b.id === id) ?? BACKS[0]
}

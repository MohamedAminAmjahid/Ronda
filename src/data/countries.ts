/** Pays proposés au choix dans ProfileScreen (classement géographique). */
export interface CountryOption {
  code: string
  flag: string
  label: string
}

export const COUNTRIES: CountryOption[] = [
  { code: 'MA', flag: '🇲🇦', label: 'Maroc' },
  { code: 'FR', flag: '🇫🇷', label: 'France' },
  { code: 'BE', flag: '🇧🇪', label: 'Belgique' },
  { code: 'NL', flag: '🇳🇱', label: 'Pays-Bas' },
  { code: 'ES', flag: '🇪🇸', label: 'Espagne' },
  { code: 'CA', flag: '🇨🇦', label: 'Canada' },
  { code: 'OTHER', flag: '🌍', label: 'Autres' },
]

/** Libellé + drapeau d'un code pays (chaîne vide si non renseigné/inconnu). */
export function countryLabel(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.label ?? ''
}

export function countryFlag(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.flag ?? '🌍'
}

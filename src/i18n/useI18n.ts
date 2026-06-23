import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { translations, type Lang, type TranslationKey } from './translations'

// Store singleton de langue, persisté via AsyncStorage. Défaut : arabe.
const KEY = 'ronda_lang'
const DEFAULT_LANG: Lang = 'ar'

let current: Lang = DEFAULT_LANG
let storedExplicitly = false // une langue a-t-elle déjà été choisie/persistée ?
let loaded = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

export function getLang(): Lang {
  return current
}

export function isRTL(lang: Lang = current): boolean {
  return lang === 'ar'
}

/** Traduit une clé dans la langue donnée (repli français puis clé brute). */
export function translate(key: TranslationKey, lang: Lang = current): string {
  return translations[lang]?.[key] ?? translations.fr[key] ?? key
}

/** Charge la langue persistée (idempotent). `stored` = false si jamais choisie. */
export async function loadLang(): Promise<{ lang: Lang; stored: boolean }> {
  if (loaded) return { lang: current, stored: storedExplicitly }
  try {
    const v = await AsyncStorage.getItem(KEY)
    if (v === 'ar' || v === 'fr' || v === 'en') {
      current = v
      storedExplicitly = true
    }
  } catch {
    // stockage indisponible — défaut
  }
  loaded = true
  emit()
  return { lang: current, stored: storedExplicitly }
}

export function hasStoredLang(): boolean {
  return storedExplicitly
}

export function setLang(lang: Lang): void {
  current = lang
  storedExplicitly = true
  loaded = true
  void AsyncStorage.setItem(KEY, lang).catch(() => {})
  emit()
}

export function subscribeLang(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Hook React i18n. Retourne { lang, t, setLang, isRTL }. */
export function useI18n() {
  const [lang, setLangState] = useState<Lang>(current)

  useEffect(() => {
    const unsub = subscribeLang(() => setLangState(getLang()))
    void loadLang()
    return unsub
  }, [])

  const t = (key: TranslationKey): string => translate(key, lang)

  return { lang, t, setLang, isRTL: isRTL(lang) }
}

export type { Lang, TranslationKey }

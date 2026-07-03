import { useEffect, useState } from 'react'
import { Platform } from 'react-native'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Retourne canInstall=true quand le navigateur est prêt à installer la PWA. */
export function useInstallPrompt(): { canInstall: boolean; install: () => void } {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const handler = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent) }
    const installed = () => setDeferred(null)
    window.addEventListener('beforeinstallprompt', handler as EventListener)
    window.addEventListener('appinstalled', installed)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler as EventListener)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])

  const install = () => {
    if (!deferred) return
    void deferred.prompt()
    setDeferred(null)
  }

  return { canInstall: deferred !== null, install }
}

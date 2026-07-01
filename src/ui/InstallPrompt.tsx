import { useEffect, useState } from 'react'
import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useI18n } from '../i18n/useI18n'

// Bannière discrète « Installer l'app » (web uniquement), déclenchée par
// l'événement beforeinstallprompt de Chrome/Edge/Android.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const { t } = useI18n()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler as EventListener)
    const installed = () => setDeferred(null)
    window.addEventListener('appinstalled', installed)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler as EventListener)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])

  if (!deferred) return null

  const install = () => {
    void deferred.prompt()
    setDeferred(null)
  }

  return (
    <View style={s.banner} pointerEvents="box-none">
      <View style={s.card}>
        <Text style={s.txt}>📲 {t('installApp')}</Text>
        <View style={s.actions}>
          <TouchableOpacity style={s.btn} onPress={install} activeOpacity={0.85}>
            <Text style={s.btnTxt}>{t('installBtn')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.close} onPress={() => setDeferred(null)} activeOpacity={0.7}>
            <Text style={s.closeTxt}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  banner: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    alignItems: 'center', paddingHorizontal: 12, paddingBottom: 12,
  },
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    width: '100%', maxWidth: 420,
    backgroundColor: '#1A0D2E', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.35)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 10,
  },
  txt: { flex: 1, fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: '#F4ECD8' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { backgroundColor: '#C9A227', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16 },
  btnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: '#1C2622' },
  close: { paddingVertical: 6, paddingHorizontal: 8 },
  closeTxt: { fontFamily: 'Cairo_400Regular', fontSize: 15, color: 'rgba(244,236,216,0.5)' },
})

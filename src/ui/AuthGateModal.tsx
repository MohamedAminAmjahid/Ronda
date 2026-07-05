import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native'
import { signInWithGoogle } from '../firebase/auth'
import { useI18n } from '../i18n/useI18n'

const C = {
  night:   '#1A0D2E',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.60)',
  ink:     '#1C2622',
} as const

/**
 * Modale « connexion requise » : proposée quand un invité tente de jouer en
 * ligne ou avec un ami. Affiche un bouton de connexion Google plutôt qu'un
 * simple retour. Le parent se referme/reprend via le changement d'état d'auth.
 */
export function AuthGateModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)

  const handleSignIn = async () => {
    setLoading(true)
    try {
      await signInWithGoogle()
      // Succès → useAuth met à jour `user`, le parent ferme et reprend l'action.
    } catch {
      // connexion annulée / échouée — la modale reste ouverte
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={10}>
            <Text style={s.closeTxt}>✕</Text>
          </TouchableOpacity>
          <Text style={s.emoji}>🔒</Text>
          <Text style={s.title}>{t('loginToPlayTitle')}</Text>
          <Text style={s.msg}>{t('loginToPlayMsg')}</Text>
          <TouchableOpacity
            style={[s.googleBtn, loading && s.googleBtnDisabled]}
            onPress={() => { void handleSignIn() }}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={C.ink} />
              : <Text style={s.googleTxt}>{t('signInGoogle')}</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(13,13,26,0.88)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  card: {
    width: '100%', maxWidth: 340, backgroundColor: C.night,
    borderRadius: 20, padding: 26, gap: 12, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.30)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 14,
  },
  closeBtn: {
    position: 'absolute', top: 14, right: 14,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(244,236,216,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: 'rgba(244,236,216,0.45)' },
  emoji:    { fontSize: 40, marginTop: 6 },
  title:    { fontFamily: 'Cairo_600SemiBold', fontSize: 19, color: C.bone, textAlign: 'center' },
  msg: {
    fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff,
    textAlign: 'center', lineHeight: 20, marginBottom: 6,
  },
  googleBtn: {
    width: '100%', backgroundColor: C.brass, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 2,
  },
  googleBtnDisabled: { opacity: 0.6 },
  googleTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.ink, letterSpacing: 0.3 },
})

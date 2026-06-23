import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Svg, Circle, Polygon } from 'react-native-svg'
import { signInWithGoogle } from '../firebase/auth'
import { TERMS } from './terms'

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.55)',
} as const

function KhatamLogo() {
  return (
    <Svg width={72} height={72} viewBox="0 0 72 72">
      <Circle cx="36" cy="36" r="34" fill={C.deep} stroke={C.brass} strokeWidth="2" />
      <Polygon
        points={
          '36,10 39.2,23.4 51.8,17.4 45.8,29 60,36 ' +
          '45.8,43 51.8,54.6 39.2,48.6 36,62 32.8,48.6 ' +
          '20.2,54.6 26.2,43 12,36 26.2,29 20.2,17.4 32.8,23.4'
        }
        fill={C.brass}
      />
    </Svg>
  )
}

interface Props {
  onBack: () => void
  /** Appelé après une connexion réussie (redirige vers la destination voulue). */
  onSignedIn: () => void
}

export function AuthScreen({ onBack, onSignedIn }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async () => {
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle()
      onSignedIn()
    } catch {
      setError('Connexion annulée ou impossible. Réessaie.')
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>
        <TouchableOpacity onPress={onBack} style={s.backBtn}>
          <Text style={s.backTxt}>← Menu</Text>
        </TouchableOpacity>

        <View style={s.hero}>
          <KhatamLogo />
          <Text style={s.title}>RONDA</Text>
          <Text style={s.titleSub}>{TERMS.ronda.ar}</Text>
          <Text style={s.tagline}>Joue avec tes amis en ligne</Text>
        </View>

        <View style={s.bottom}>
          {error && <Text style={s.errorTxt}>{error}</Text>}
          <TouchableOpacity style={s.googleBtn} onPress={handleSignIn} disabled={busy} activeOpacity={0.85}>
            {busy ? (
              <ActivityIndicator color={C.ink} />
            ) : (
              <>
                <View style={s.gMark}><Text style={s.gMarkTxt}>G</Text></View>
                <Text style={s.googleTxt}>Se connecter avec Google</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={s.note}>Ta progression locale est conservée.</Text>
        </View>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.table, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 430, paddingHorizontal: 28 },

  backBtn: { alignSelf: 'flex-start', paddingVertical: 12 },
  backTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },

  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  title: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 44, color: C.bone,
    letterSpacing: 8, textTransform: 'uppercase', marginTop: 8,
  },
  titleSub: { fontFamily: 'ReemKufi_700Bold', fontSize: 22, color: C.brass, letterSpacing: 2 },
  tagline: {
    fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff,
    letterSpacing: 0.5, marginTop: 8, textAlign: 'center',
  },

  bottom: { paddingBottom: 40, gap: 14 },
  errorTxt: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: '#E74C3C', textAlign: 'center' },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: C.bone, borderRadius: 12, paddingVertical: 16,
    shadowColor: C.ink, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  gMark: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#4285F4',
  },
  gMarkTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: '#4285F4' },
  googleTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.ink, letterSpacing: 0.3 },
  note: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff, textAlign: 'center' },
})

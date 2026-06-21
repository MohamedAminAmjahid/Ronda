import { useEffect, useRef, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Share } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Clipboard from 'expo-clipboard'
import { GameScreen } from './GameScreen'
import { useOnlineGame } from '../online/useOnlineGame'

const GAME_URL = 'https://ronda-virid.vercel.app'

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  clay:    '#B5532A',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
} as const

const PSEUDO_KEY = 'ronda_pseudo'
const sanitize = (s: string) => s.replace(/\s/g, '').slice(0, 16)

interface Props {
  onBack: () => void
}

export function OnlineScreen({ onBack }: Props) {
  const game = useOnlineGame()
  const { connectionStatus, roomCode, opponentDisconnected, error } = game

  const [pseudo, setPseudo] = useState('')
  const [step, setStep] = useState<'pseudo' | 'choice'>('pseudo')
  const [codeInput, setCodeInput] = useState('')

  // Pré-remplissage du pseudo depuis AsyncStorage.
  useEffect(() => {
    AsyncStorage.getItem(PSEUDO_KEY).then((v) => { if (v) setPseudo(sanitize(v)) })
  }, [])

  // Nettoyage : quitter la room si l'écran est démonté en cours de connexion.
  useEffect(() => {
    return () => { game.newGame() } // newGame() = leave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const confirmPseudo = () => {
    if (pseudo.length < 2) return
    void AsyncStorage.setItem(PSEUDO_KEY, pseudo)
    setStep('choice')
  }

  // ── Partie en cours → GameScreen (mode online) ─────────────────────────────
  if (connectionStatus === 'playing') {
    return (
      <View style={{ flex: 1 }}>
        <GameScreen
          onBack={() => { game.newGame(); onBack() }}
          useGame={useOnlineGame}
          opponentName={game.opponentName ?? undefined}
        />
        {opponentDisconnected && (
          <View style={s.discOverlay} pointerEvents="none">
            <Text style={s.discTitle}>Adversaire déconnecté</Text>
            <Text style={s.discSub}>En attente de reconnexion…</Text>
          </View>
        )}
      </View>
    )
  }

  // ── En attente (connexion / adversaire) ────────────────────────────────────
  if (connectionStatus === 'connecting' || connectionStatus === 'waiting') {
    return <WaitingScreen code={roomCode} onCancel={() => game.newGame()} />
  }

  // ── Étapes pseudo / choix (idle ou déconnecté) ─────────────────────────────
  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>
        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>← Menu</Text>
          </TouchableOpacity>
          <Text style={s.title}>Jouer en ligne</Text>
        </View>

        {error && (
          <View style={s.errorBox}>
            <Text style={s.errorTxt}>{error}</Text>
          </View>
        )}

        {step === 'pseudo' ? (
          <View style={s.body}>
            <Text style={s.label}>Ton pseudo</Text>
            <TextInput
              style={s.input}
              value={pseudo}
              onChangeText={(t) => setPseudo(sanitize(t))}
              placeholder="Pseudo"
              placeholderTextColor={C.boneOff}
              maxLength={16}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={s.hint}>Sans espace, 16 caractères max.</Text>
            <TouchableOpacity
              style={[s.btnPrimary, pseudo.length < 2 && s.btnDisabled]}
              disabled={pseudo.length < 2}
              onPress={confirmPseudo}
            >
              <Text style={s.btnPrimaryTxt}>Continuer</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.body}>
            <Text style={s.helloTxt}>Salut {pseudo} 👋</Text>

            <Text style={s.label}>Adversaire aléatoire</Text>
            <TouchableOpacity style={s.btnPrimary} onPress={() => game.connectQuick(pseudo)}>
              <Text style={s.btnPrimaryTxt}>Partie rapide</Text>
            </TouchableOpacity>

            <View style={s.divider} />

            <Text style={s.label}>Avec un ami</Text>
            <TouchableOpacity style={s.btnSecondary} onPress={() => game.connectCreate(pseudo)}>
              <Text style={s.btnSecondaryTxt}>Créer une partie (recevoir un code)</Text>
            </TouchableOpacity>

            <Text style={s.label}>Rejoindre avec un code</Text>
            <View style={s.joinRow}>
              <TextInput
                style={[s.input, s.codeInput]}
                value={codeInput}
                onChangeText={(t) => setCodeInput(t.toUpperCase().replace(/\s/g, ''))}
                placeholder="RONDA-XXXX"
                placeholderTextColor={C.boneOff}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[s.btnJoin, codeInput.length < 6 && s.btnDisabled]}
                disabled={codeInput.length < 6}
                onPress={() => game.connectByCode(pseudo, codeInput)}
              >
                <Text style={s.btnJoinTxt}>OK</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={s.changePseudo} onPress={() => setStep('pseudo')}>
              <Text style={s.changePseudoTxt}>Changer de pseudo</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}

// ── Écran d'attente avec pulsation ──────────────────────────────────────────────

function WaitingScreen({ code, onCancel }: { code: string | null; onCancel: () => void }) {
  const pulse = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [])

  const [copied, setCopied] = useState(false)

  const shareCode = async () => {
    if (!code) return
    try {
      await Share.share({
        message: `Rejoins ma partie de Ronda ! 🎴\nCode : ${code}\nLien : ${GAME_URL}`,
      })
    } catch {
      // partage annulé / indisponible — sans effet
    }
  }

  const copyCode = async () => {
    if (!code) return
    try {
      await Clipboard.setStringAsync(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard indisponible — sans effet
    }
  }

  return (
    <SafeAreaView style={[s.root, { justifyContent: 'center' }]}>
      <View style={[s.column, { alignItems: 'center', gap: 18 }]}>
        <Animated.Text style={[s.waitTxt, { opacity: pulse }]}>
          En attente d'un adversaire…
        </Animated.Text>

        {code ? (
          <>
            <View style={s.codeBox}>
              <Text style={s.codeLabel}>Code à partager</Text>
              <Text style={s.codeValue}>{code}</Text>
            </View>
            <View style={s.shareRow}>
              <TouchableOpacity style={s.btnShare} onPress={shareCode}>
                <Text style={s.btnShareTxt}>Partager</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnCopy} onPress={copyCode}>
                <Text style={s.btnCopyTxt}>{copied ? 'Copié ✓' : 'Copier le code'}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          // Partie rapide (sans code) : on attend juste un adversaire.
          <Text style={s.codeLabel}>Recherche d'un adversaire…</Text>
        )}

        <TouchableOpacity style={s.btnCancel} onPress={onCancel}>
          <Text style={s.btnCancelTxt}>Annuler</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.table, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 430, paddingHorizontal: 24 },
  header: { paddingTop: 16, paddingBottom: 24, alignItems: 'center', gap: 6 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6, marginBottom: 4 },
  backTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  title: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 26, color: C.bone,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  body: { gap: 14 },
  label: {
    fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff,
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  hint: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff, marginTop: -8 },
  helloTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 18, color: C.bone, marginBottom: 4 },
  input: {
    backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 10, paddingHorizontal: 16,
    paddingVertical: 14, fontFamily: 'Cairo_400Regular', fontSize: 16, color: C.bone,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)',
  },
  btnPrimary: {
    backgroundColor: C.brass, borderRadius: 12, paddingVertical: 16, alignItems: 'center',
  },
  btnPrimaryTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.ink, letterSpacing: 0.4 },
  btnSecondary: {
    borderRadius: 12, paddingVertical: 16, alignItems: 'center',
    borderWidth: 1.5, borderColor: C.brass,
  },
  btnSecondaryTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.brass, letterSpacing: 0.4 },
  btnDisabled: { opacity: 0.4 },
  divider: {
    height: 1, backgroundColor: 'rgba(244,236,216,0.12)', marginVertical: 6,
  },
  joinRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  codeInput: { flex: 1, letterSpacing: 2 },
  btnJoin: {
    backgroundColor: C.brass, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 14,
  },
  btnJoinTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.ink },
  changePseudo: { alignSelf: 'center', paddingVertical: 10 },
  changePseudoTxt: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.boneOff, textDecorationLine: 'underline' },

  errorBox: {
    backgroundColor: 'rgba(181,83,42,0.18)', borderRadius: 10, padding: 12, marginBottom: 14,
    borderLeftWidth: 3, borderLeftColor: C.clay,
  },
  errorTxt: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.bone },

  waitTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 18, color: C.bone, textAlign: 'center' },
  codeBox: {
    backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 14, paddingVertical: 18, paddingHorizontal: 28,
    alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(201,162,39,0.3)',
  },
  codeLabel: {
    fontFamily: 'Cairo_400Regular', fontSize: 10, color: C.boneOff,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  codeValue: { fontFamily: 'Cairo_600SemiBold', fontSize: 34, color: C.brass, letterSpacing: 4 },
  shareRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  btnShare: {
    backgroundColor: C.brass, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 22,
  },
  btnShareTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.ink, letterSpacing: 0.3 },
  btnCopy: {
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18,
    borderWidth: 1.5, borderColor: C.brass,
  },
  btnCopyTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.brass, letterSpacing: 0.3 },
  btnCancel: { paddingVertical: 10, paddingHorizontal: 20 },
  btnCancelTxt: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff },

  discOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(9,64,47,0.88)', gap: 8,
  },
  discTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: C.bone },
  discSub: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff },
})

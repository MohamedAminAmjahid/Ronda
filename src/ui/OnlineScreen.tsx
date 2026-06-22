import { useEffect, useRef, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Share } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, type Href } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { GameScreen } from './GameScreen'
import { useOnlineGame } from '../online/useOnlineGame'
import { useProfile } from '../profile/useProfile'
import { roomTypeByCode } from '../online/client'

const GAME_URL = 'https://ronda-virid.vercel.app'

/** Navigue vers le lobby 2v2 (création si pas de code, sinon jonction par code). */
function goLobby2v2(pseudo: string, code?: string): void {
  const q = code
    ? `?pseudo=${encodeURIComponent(pseudo)}&code=${encodeURIComponent(code)}`
    : `?pseudo=${encodeURIComponent(pseudo)}`
  router.push(`/lobby2v2${q}` as Href)
}

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  clay:    '#B5532A',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
} as const

interface Props {
  onBack: () => void
  /** 'friend' : n'affiche que « Créer une partie » + « Rejoindre avec un code ». */
  mode?: 'quick' | 'friend'
}

export function OnlineScreen({ onBack, mode = 'quick' }: Props) {
  const game = useOnlineGame()
  const { connectionStatus, roomCode, opponentDisconnected, error } = game
  const { username } = useProfile()

  const [codeInput, setCodeInput] = useState('')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const resolvedRef = useRef<string | null>(null) // dernier code résolu (évite doublons)

  // Nettoyage : quitter la room si l'écran est démonté en cours de connexion.
  useEffect(() => {
    return () => { game.newGame() } // newGame() = leave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Détection auto du type de room dès que le code est complet (RONDA-XXXX = 10 car.).
  useEffect(() => {
    if (codeInput.length !== 10) {
      setLookupError(null)
      resolvedRef.current = null
      return
    }
    if (resolvedRef.current === codeInput) return
    resolvedRef.current = codeInput
    setJoining(true)
    setLookupError(null)
    roomTypeByCode(codeInput)
      .then(({ type }) => {
        if (type === 'ronda2v2') goLobby2v2(username, codeInput)
        else game.connectByCode(username, codeInput)
      })
      .catch(() => {
        setJoining(false)
        setLookupError('Code de partie introuvable.')
        resolvedRef.current = null
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeInput, username])

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
          <Text style={s.title}>{mode === 'friend' ? 'Jouer avec un ami' : 'Jouer en ligne'}</Text>
        </View>

        {error && (
          <View style={s.errorBox}>
            <Text style={s.errorTxt}>{error}</Text>
          </View>
        )}

        <View style={s.body}>
          <Text style={s.helloTxt}>Salut {username} 👋</Text>

          {mode !== 'friend' && (
            <>
              <Text style={s.label}>Adversaire aléatoire</Text>
              <TouchableOpacity style={s.btnPrimary} onPress={() => game.connectQuick(username)}>
                <Text style={s.btnPrimaryTxt}>Partie rapide</Text>
              </TouchableOpacity>
              <View style={s.divider} />
            </>
          )}

          <Text style={s.label}>Avec un ami</Text>
          <TouchableOpacity style={s.btnSecondary} onPress={() => game.connectCreate(username)}>
            <Text style={s.btnSecondaryTxt}>Créer une partie 1v1</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnSecondary} onPress={() => goLobby2v2(username)}>
            <Text style={s.btnSecondaryTxt}>2 contre 2 (lobby)</Text>
          </TouchableOpacity>

          <Text style={s.label}>Rejoindre avec un code</Text>
          <TextInput
            style={s.input}
            value={codeInput}
            onChangeText={(t) => setCodeInput(t.toUpperCase().replace(/\s/g, '').slice(0, 10))}
            placeholder="RONDA-XXXX"
            placeholderTextColor={C.boneOff}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!joining}
          />
          {joining ? (
            <Text style={s.hint}>Connexion à la partie…</Text>
          ) : lookupError ? (
            <Text style={s.lookupErr}>{lookupError}</Text>
          ) : (
            <Text style={s.hint}>Le type de partie est détecté automatiquement.</Text>
          )}
        </View>
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
  divider: {
    height: 1, backgroundColor: 'rgba(244,236,216,0.12)', marginVertical: 6,
  },
  lookupErr: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.clay, marginTop: -8 },

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

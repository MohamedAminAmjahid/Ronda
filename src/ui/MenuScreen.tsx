import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Linking, Modal, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Svg, Circle, Polygon } from 'react-native-svg'
import { router, type Href } from 'expo-router'
import { TERMS } from './terms'
import { useProfile } from '../profile/useProfile'
import { loadActiveRoom, clearActiveRoom, type ActiveRoom } from '../profile/profile'
import { reconnect as reconnect1v1 } from '../online/store'
import { reconnectLobby } from '../online/lobby2v2'

const LINKEDIN_URL = 'https://www.linkedin.com/in/amjahid-mohamed-amin'

// ── Tokens ────────────────────────────────────────────────────────────────────

const C = {
  table:    '#0E5C4A',
  deep:     '#09402F',
  brass:    '#C9A227',
  bone:     '#F4ECD8',
  ink:      '#1C2622',
  boneOff:  'rgba(244,236,216,0.45)',
  disabled: 'rgba(244,236,216,0.12)',
  disabledTxt: 'rgba(244,236,216,0.3)',
} as const

// ── Logo khatam ───────────────────────────────────────────────────────────────

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

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onPlay:       () => void
  onPlayOnline: () => void
  onPlayFriend: () => void
  onRules:      () => void
  onCredits:    () => void
}

// ── Écran ─────────────────────────────────────────────────────────────────────

export function MenuScreen({ onPlay, onPlayOnline, onPlayFriend, onRules, onCredits }: Props) {
  const { username, gold, setUsername } = useProfile()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const openEditor = () => { setDraft(username); setEditing(true) }
  const saveUsername = () => {
    const clean = draft.trim()
    if (clean.length >= 2) setUsername(clean)
    setEditing(false)
  }

  // ── Reconnexion à une partie en cours ──────────────────────────────────────
  const [resumeRoom, setResumeRoom] = useState<ActiveRoom | null>(null)
  const [resuming, setResuming] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)

  useEffect(() => {
    void loadActiveRoom().then((r) => { if (r) setResumeRoom(r) })
  }, [])

  const onResume = async () => {
    if (!resumeRoom || resuming) return
    setResuming(true)
    setResumeError(null)
    try {
      if (resumeRoom.roomType === 'ronda2v2') {
        await reconnectLobby(resumeRoom.reconnectionToken)
        setResumeRoom(null)
        router.push('/lobby2v2?reconnect=1' as Href)
      } else {
        await reconnect1v1(resumeRoom.reconnectionToken)
        setResumeRoom(null)
        router.push('/online' as Href)
      }
    } catch {
      clearActiveRoom()
      setResumeError('Reconnexion impossible — la partie a peut-être expiré.')
    } finally {
      setResuming(false)
    }
  }

  const onForfeit = () => {
    clearActiveRoom()
    setResumeRoom(null)
    setResumeError(null)
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>

        {/* ── Barre de profil ──────────────────────────────────── */}
        <View style={s.profileBar}>
          <TouchableOpacity style={s.profileNameWrap} onPress={openEditor} activeOpacity={0.7}>
            <Text style={s.profileName} numberOfLines={1}>{username || '…'}</Text>
            <Text style={s.profileEdit}>✎</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.goldPill}
            onPress={() => router.push('/gold-shop' as Href)}
            activeOpacity={0.7}
            accessibilityLabel="Ouvrir la boutique d'or"
          >
            <Text style={s.goldCoin}>🪙</Text>
            <Text style={s.goldAmount}>{gold}</Text>
            <Text style={s.goldPlus}>+</Text>
          </TouchableOpacity>
        </View>

        {/* ── Modale d'édition du pseudo ───────────────────────── */}
        <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
          <View style={s.modalBackdrop}>
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>Ton pseudo</Text>
              <TextInput
                style={s.modalInput}
                value={draft}
                onChangeText={(t) => setDraft(t.slice(0, 16))}
                placeholder="Pseudo"
                placeholderTextColor={C.boneOff}
                maxLength={16}
                autoFocus
                autoCorrect={false}
              />
              <Text style={s.modalHint}>16 caractères max.</Text>
              <View style={s.modalActions}>
                <TouchableOpacity style={s.modalCancel} onPress={() => setEditing(false)}>
                  <Text style={s.modalCancelTxt}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.modalSave, draft.trim().length < 2 && s.btnDisabledOpacity]}
                  disabled={draft.trim().length < 2}
                  onPress={saveUsername}
                >
                  <Text style={s.modalSaveTxt}>Sauvegarder</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── Modale de reconnexion ────────────────────────────── */}
        <Modal visible={resumeRoom !== null} transparent animationType="fade" onRequestClose={onForfeit}>
          <View style={s.modalBackdrop}>
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>Partie en cours</Text>
              {resumeError ? (
                <>
                  <Text style={s.resumeText}>{resumeError}</Text>
                  <View style={s.modalActions}>
                    <TouchableOpacity style={s.modalSave} onPress={onForfeit}>
                      <Text style={s.modalSaveTxt}>OK</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={s.resumeText}>
                    Tu as une partie en cours{resumeRoom?.code ? ` (code : ${resumeRoom.code})` : ''}. Veux-tu reprendre ?
                  </Text>
                  <View style={s.modalActions}>
                    <TouchableOpacity style={s.modalCancel} onPress={onForfeit} disabled={resuming}>
                      <Text style={s.modalCancelTxt}>Abandonner</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.modalSave, resuming && s.btnDisabledOpacity]}
                      onPress={onResume}
                      disabled={resuming}
                    >
                      <Text style={s.modalSaveTxt}>{resuming ? 'Connexion…' : 'Reprendre'}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>

        {/* ── Identité ─────────────────────────────────────────── */}
        <View style={s.hero}>
          <KhatamLogo />
          <View style={s.titleBlock}>
            <Text style={s.title}>RONDA</Text>
            <Text style={s.titleSub}>{TERMS.ronda.ar}</Text>
          </View>
          <View style={s.divider} />
          <Text style={s.tagline}>Jeu de cartes marocain</Text>
        </View>

        {/* ── Actions ──────────────────────────────────────────── */}
        <View style={s.actions}>

          {/* Jouer (vs IA) — ouvre le choix 1v1 / 2v2 */}
          <TouchableOpacity style={s.btnPrimary} onPress={onPlay}>
            <Text style={s.btnPrimaryTxt}>Jouer</Text>
          </TouchableOpacity>

          {/* Jouer en ligne — partie rapide (matchmaking) */}
          <TouchableOpacity style={s.btnSecondary} onPress={onPlayOnline}>
            <Text style={s.btnSecondaryTxt}>Jouer en ligne</Text>
          </TouchableOpacity>

          {/* Jouer avec un ami — créer / rejoindre par code */}
          <TouchableOpacity style={s.btnSecondary} onPress={onPlayFriend}>
            <Text style={s.btnSecondaryTxt}>Jouer avec un ami</Text>
          </TouchableOpacity>

          {/* Règles + Crédits — liens discrets */}
          <View style={s.textLinks}>
            <TouchableOpacity style={s.btnCredits} onPress={onRules}>
              <Text style={s.btnCreditsTxt}>Règles</Text>
            </TouchableOpacity>
            <Text style={s.linkSep}>·</Text>
            <TouchableOpacity style={s.btnCredits} onPress={onCredits}>
              <Text style={s.btnCreditsTxt}>Crédits</Text>
            </TouchableOpacity>
          </View>

        </View>

        {/* ── Pied de page ─────────────────────────────────────── */}
        <View style={s.footer}>
          <Text style={s.footerTxt}>v1.0 — solo</Text>
          <TouchableOpacity onPress={() => Linking.openURL(LINKEDIN_URL)}>
            <Text style={s.author}>Made by Amjahid Mohamed Amin</Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.table,
    alignItems: 'center',
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: 430,
    paddingHorizontal: 28,
  },

  // Barre de profil
  profileBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 4,
  },
  profileNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  profileName: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 15,
    color: C.bone,
    letterSpacing: 0.3,
  },
  profileEdit: {
    fontSize: 12,
    color: C.boneOff,
  },
  goldPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.35)',
  },
  goldCoin: { fontSize: 14 },
  goldAmount: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.brass },
  goldPlus: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.ink, marginLeft: 2,
    backgroundColor: C.brass, width: 18, height: 18, borderRadius: 9,
    textAlign: 'center', lineHeight: 18, overflow: 'hidden',
  },

  // Modale d'édition du pseudo
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(9,64,47,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: C.deep,
    borderRadius: 16,
    padding: 22,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.3)',
  },
  modalTitle: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 13,
    color: C.boneOff,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  modalInput: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontFamily: 'Cairo_400Regular',
    fontSize: 16,
    color: C.bone,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.25)',
  },
  modalHint: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff },
  resumeText: { fontFamily: 'Cairo_400Regular', fontSize: 15, color: C.bone, lineHeight: 22 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  modalCancel: { paddingVertical: 12, paddingHorizontal: 16 },
  modalCancelTxt: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff },
  modalSave: {
    backgroundColor: C.brass,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  modalSaveTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.ink },
  btnDisabledOpacity: { opacity: 0.4 },

  // Identité
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 20,
  },
  titleBlock: {
    alignItems: 'center',
    gap: 4,
  },
  title: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 48,
    color: C.bone,
    letterSpacing: 10,
    textTransform: 'uppercase',
  },
  titleSub: {
    fontFamily: 'ReemKufi_700Bold',
    fontSize: 24,
    color: C.brass,
    letterSpacing: 2,
  },
  divider: {
    width: 48,
    height: 2,
    backgroundColor: C.brass,
    opacity: 0.5,
    borderRadius: 1,
  },
  tagline: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 13,
    color: C.boneOff,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // Boutons
  actions: {
    gap: 14,
    paddingBottom: 32,
  },
  btnPrimary: {
    backgroundColor: C.brass,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: C.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  btnPrimaryTxt: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 16,
    color: C.ink,
    letterSpacing: 0.4,
  },
  btnSecondary: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.brass,
  },
  btnSecondaryTxt: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 16,
    color: C.brass,
    letterSpacing: 0.4,
  },
  btnDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.disabled,
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 10,
  },
  btnDisabledIcon: {
    fontSize: 14,
  },
  btnDisabledTxt: {
    fontFamily: 'Cairo_400Regular',
    flex: 1,
    fontSize: 15,
    color: C.disabledTxt,
  },
  btnDisabledBadge: {
    fontSize: 10,
    color: C.disabledTxt,
    borderWidth: 1,
    borderColor: C.disabledTxt,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  textLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  linkSep: {
    color: 'rgba(244,236,216,0.25)',
    fontSize: 12,
  },
  btnCredits: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  btnCreditsTxt: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 12,
    color: 'rgba(244,236,216,0.3)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Pied
  footer: {
    alignItems: 'center',
    paddingBottom: 12,
    gap: 6,
  },
  footerTxt: {
    fontSize: 10,
    color: 'rgba(244,236,216,0.2)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  author: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 12,
    color: 'rgba(244,236,216,0.45)',
    letterSpacing: 0.3,
    textDecorationLine: 'underline',
  },
})

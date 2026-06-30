import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import {
  sendGameInvite, subscribeInviteById, updateInviteRoomCode, declineGameInvite,
  type FriendDoc,
} from '../firebase/firestore'
import { useAuth } from '../firebase/auth'
import { useProfile } from '../profile/useProfile'
import { removeGold } from '../profile/profile'
import { connectFriendHost, getSnapshot as getRondaSnap } from '../online/store'
import { connectDiJoujFriendHost, getSnapshot as getDjSnap } from '../online/storeDiJouj'

const C = {
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
  red:     '#C0392B',
} as const

type Phase = 'setup' | 'sending' | 'waiting' | 'creating' | 'declined' | 'error'

interface Props {
  visible: boolean
  friend:  FriendDoc | null
  onClose: () => void
}

/**
 * Modale d'invitation d'un ami à jouer (Ronda / Di Jouj, avec mise optionnelle).
 * Gère l'envoi de l'invitation, l'attente de réponse, la création de la room
 * Colyseus puis la navigation vers l'écran de jeu. Réutilisée dans la liste
 * d'amis et l'écran de profil d'un ami.
 */
export function InviteToPlayModal({ visible, friend, onClose }: Props) {
  const { user } = useAuth()
  const { username, gold } = useProfile()

  const [game,  setGame]  = useState<'ronda' | 'dijouj'>('dijouj')
  const [bet,   setBet]   = useState(0)
  const [phase, setPhase] = useState<Phase>('setup')
  const [error, setError] = useState('')
  const [pendingInvite, setPendingInvite] = useState<{ id: string; game: 'ronda' | 'dijouj'; bet: number } | null>(null)

  const usernameRef = useRef(username)
  usernameRef.current = username

  // Réinitialise à chaque ouverture.
  useEffect(() => {
    if (visible) {
      setGame('dijouj'); setBet(0); setPhase('setup'); setError(''); setPendingInvite(null)
    }
  }, [visible])

  function handleClose() {
    if (pendingInvite && phase === 'waiting') {
      void declineGameInvite(pendingInvite.id).catch(() => {})
    }
    setPhase('setup')
    setPendingInvite(null)
    onClose()
  }

  async function waitForRoomCode(getSnap: () => { roomCode: string | null }, timeoutMs = 10000): Promise<string> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const code = getSnap().roomCode
      if (code) return code
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    throw new Error('timeout waiting for room code')
  }

  async function doSendInvite() {
    if (!user || !friend) return
    if (bet > gold) { setError('Or insuffisant'); setPhase('error'); return }
    setPhase('sending')
    try {
      const id = await sendGameInvite(user.uid, username || 'Joueur', friend.uid, game, bet)
      setPendingInvite({ id, game, bet })
      setPhase('waiting')
    } catch (e) {
      if (e instanceof Error && e.message === 'already_invited') {
        setError(`Tu as déjà invité ${friend.username}, en attente de sa réponse.`)
      } else {
        setError("Erreur lors de l'envoi de l'invitation")
      }
      setPhase('error')
    }
  }

  // Écoute la réponse de l'ami une fois l'invitation envoyée.
  useEffect(() => {
    if (!pendingInvite || phase !== 'waiting') return
    const { id, game: g, bet: b } = pendingInvite
    const unsub = subscribeInviteById(id, async (inv) => {
      if (!inv) return
      if (inv.status === 'declined') {
        setPhase('declined')
      } else if (inv.status === 'accepted') {
        setPhase('creating')
        try {
          let roomCode: string | null = null
          const pseudo = usernameRef.current || 'Joueur'
          if (g === 'dijouj') {
            await connectDiJoujFriendHost(pseudo, b)
            roomCode = await waitForRoomCode(() => getDjSnap())
          } else {
            await connectFriendHost(pseudo, b)
            roomCode = await waitForRoomCode(() => getRondaSnap())
          }
          if (!roomCode) throw new Error('no room code')
          if (b > 0) removeGold(b)
          await updateInviteRoomCode(id, roomCode)
          setPhase('setup')
          setPendingInvite(null)
          onClose()
          router.push((g === 'dijouj' ? '/dijouj-online' : '/online') as never)
        } catch (e) {
          console.error('[invite] erreur création room:', e)
          setError('Impossible de créer la partie. Vérifiez votre connexion.')
          setPhase('error')
        }
      }
    })
    return unsub
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInvite, phase])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={s.overlay}>
        <View style={s.box}>

          {phase === 'setup' && (
            <>
              <Text style={s.title}>Inviter {friend?.username}</Text>

              <Text style={s.label}>Jeu</Text>
              <View style={s.gameRow}>
                {(['dijouj', 'ronda'] as const).map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[s.gameBtn, game === g && s.gameBtnActive]}
                    onPress={() => setGame(g)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.gameBtnTxt, game === g && s.gameBtnTxtActive]}>
                      {g === 'dijouj' ? '🎴 Di Jouj' : '🃏 Ronda'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>Mise (solde : {gold} 🪙)</Text>
              <View style={s.betRow}>
                {[0, 10, 25, 50, 100].map((b) => (
                  <TouchableOpacity
                    key={b}
                    style={[s.betChip, bet === b && s.betChipActive, b > gold && s.betChipDis]}
                    onPress={() => b <= gold && setBet(b)}
                    disabled={b > gold}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.betChipTxt, bet === b && s.betChipTxtActive, b > gold && s.betChipTxtDis]}>
                      {b === 0 ? 'Libre' : `${b} 🪙`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={s.actions}>
                <TouchableOpacity style={s.cancelBtn} onPress={handleClose} activeOpacity={0.8}>
                  <Text style={s.cancelTxt}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.sendBtn} onPress={doSendInvite} activeOpacity={0.85}>
                  <Text style={s.sendTxt}>Envoyer</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {phase === 'sending' && (
            <>
              <ActivityIndicator color={C.brass} size="large" />
              <Text style={s.statusTxt}>Envoi de l'invitation...</Text>
            </>
          )}

          {phase === 'waiting' && (
            <>
              <Text style={s.emoji}>⏳</Text>
              <Text style={s.statusTxt}>En attente de {friend?.username}...</Text>
              <TouchableOpacity style={s.cancelBtn} onPress={handleClose} activeOpacity={0.8}>
                <Text style={s.cancelTxt}>Annuler</Text>
              </TouchableOpacity>
            </>
          )}

          {phase === 'creating' && (
            <>
              <ActivityIndicator color={C.brass} size="large" />
              <Text style={s.statusTxt}>Création de la partie...</Text>
            </>
          )}

          {phase === 'declined' && (
            <>
              <Text style={s.emoji}>😔</Text>
              <Text style={s.statusTxt}>{friend?.username} a refusé l'invitation</Text>
              <TouchableOpacity
                style={s.sendBtn}
                onPress={() => { setPhase('setup'); setPendingInvite(null) }}
                activeOpacity={0.85}
              >
                <Text style={s.sendTxt}>Réessayer</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={handleClose} activeOpacity={0.8}>
                <Text style={s.cancelTxt}>Fermer</Text>
              </TouchableOpacity>
            </>
          )}

          {phase === 'error' && (
            <>
              <Text style={s.emoji}>⚠️</Text>
              <Text style={s.errTxt}>{error}</Text>
              <TouchableOpacity style={s.cancelBtn} onPress={handleClose} activeOpacity={0.8}>
                <Text style={s.cancelTxt}>Fermer</Text>
              </TouchableOpacity>
            </>
          )}

        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center' },
  box: {
    backgroundColor: '#1A2E25', borderRadius: 22, paddingVertical: 32, paddingHorizontal: 28,
    width: 320, alignItems: 'center', gap: 14,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.22)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 20,
  },
  title: { fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 18, letterSpacing: 0.4, textAlign: 'center' },
  label: {
    fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 12,
    letterSpacing: 1.5, textTransform: 'uppercase', alignSelf: 'flex-start',
  },
  gameRow: { flexDirection: 'row', gap: 10, width: '100%' },
  gameBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)', borderWidth: 1.5, borderColor: 'rgba(244,236,216,0.15)',
  },
  gameBtnActive: { borderColor: C.brass, backgroundColor: 'rgba(201,162,39,0.15)' },
  gameBtnTxt: { fontFamily: 'Cairo_600SemiBold', color: C.boneOff, fontSize: 14 },
  gameBtnTxtActive: { color: C.brass },

  betRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' },
  betChip: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.22)', borderWidth: 1, borderColor: 'rgba(244,236,216,0.18)',
  },
  betChipActive: { backgroundColor: C.brass, borderColor: C.brass },
  betChipDis:    { opacity: 0.35 },
  betChipTxt:    { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 13 },
  betChipTxtActive: { color: C.ink },
  betChipTxtDis:    { color: C.boneOff },

  actions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(244,236,216,0.25)',
  },
  cancelTxt: { fontFamily: 'Cairo_600SemiBold', color: C.boneOff, fontSize: 14 },
  sendBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    backgroundColor: C.brass,
    shadowColor: C.brass, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  sendTxt: { fontFamily: 'Cairo_600SemiBold', color: C.ink, fontSize: 14 },

  emoji:     { fontSize: 40, lineHeight: 48 },
  statusTxt: { fontFamily: 'Cairo_400Regular', color: C.bone, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errTxt:    { fontFamily: 'Cairo_400Regular', color: C.red, fontSize: 14, textAlign: 'center', lineHeight: 20 },
})

import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '../firebase/auth'
import { useProfile } from '../profile/useProfile'
import { removeGold } from '../profile/profile'
import {
  subscribeIncomingInvites, subscribeInviteById,
  acceptGameInvite, declineGameInvite,
  type GameInviteDoc,
} from '../firebase/firestore'
import { connectFriendGuest } from '../online/store'
import { connectDiJoujFriendGuest } from '../online/storeDiJouj'

const C = {
  bg:    '#0D0D1A',
  box:   '#1A1A35',
  brass: '#C9A227',
  bone:  '#F4ECD8',
  off:   'rgba(244,236,216,0.50)',
  red:   '#C0392B',
  green: '#27AE60',
} as const

type Phase = 'idle' | 'shown' | 'accepting' | 'waiting_room' | 'error'

export function IncomingInviteModal() {
  const { user } = useAuth()
  const { gold, username } = useProfile()

  const [invite, setInvite] = useState<GameInviteDoc | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Refs to avoid stale closures inside onSnapshot callbacks
  const phaseRef    = useRef<Phase>('idle')
  const activeIdRef = useRef<string | null>(null)

  phaseRef.current = phase

  // ── Écoute les invitations entrant ────────────────────────────────────────────
  useEffect(() => {
    if (!user) { setInvite(null); setPhase('idle'); return }
    return subscribeIncomingInvites(user.uid, (invites) => {
      // Nouvelle invitation → montrer si inactif
      if (invites.length > 0 && phaseRef.current === 'idle') {
        const first = invites[0]
        setInvite(first)
        setPhase('shown')
        activeIdRef.current = first.id
      }
      // L'invitation active a disparu (annulée par l'expéditeur)
      if (activeIdRef.current && phaseRef.current === 'shown') {
        if (!invites.find((i) => i.id === activeIdRef.current)) {
          setInvite(null)
          setPhase('idle')
          activeIdRef.current = null
        }
      }
    })
  }, [user])

  // ── Refuser ────────────────────────────────────────────────────────────────────
  const onDecline = async () => {
    if (!invite) return
    await declineGameInvite(invite.id).catch(() => {})
    setInvite(null)
    setPhase('idle')
    activeIdRef.current = null
  }

  // ── Accepter ───────────────────────────────────────────────────────────────────
  const onAccept = () => {
    if (!invite) return
    if (invite.betAmount > gold) {
      setErrorMsg(`Or insuffisant (${gold} 🪙 disponible)`)
      setPhase('error')
      return
    }

    const savedInvite = invite
    setPhase('accepting')

    acceptGameInvite(savedInvite.id)
      .then(() => {
        setPhase('waiting_room')

        // Attendre que l'hôte crée la room et écrive le code
        let timeoutId: ReturnType<typeof setTimeout>
        let unsub: () => void

        unsub = subscribeInviteById(savedInvite.id, async (updated) => {
          if (!updated) return
          if (updated.status === 'room_ready' && updated.roomCode) {
            unsub()
            clearTimeout(timeoutId)
            if (savedInvite.betAmount > 0) removeGold(savedInvite.betAmount)
            try {
              if (savedInvite.game === 'dijouj') {
                await connectDiJoujFriendGuest(username || 'Joueur', updated.roomCode, savedInvite.betAmount)
                router.push('/dijouj-online' as never)
              } else {
                await connectFriendGuest(username || 'Joueur', updated.roomCode, savedInvite.betAmount)
                router.push('/online' as never)
              }
              setInvite(null)
              setPhase('idle')
              activeIdRef.current = null
            } catch {
              setErrorMsg('Impossible de rejoindre la partie')
              setPhase('error')
            }
          }
        })

        // Timeout 2 minutes si l'hôte ne crée pas la room
        timeoutId = setTimeout(() => {
          unsub()
          if (phaseRef.current === 'waiting_room') {
            setErrorMsg("L'hôte n'a pas pu créer la partie")
            setPhase('error')
          }
        }, 120_000)
      })
      .catch(() => {
        setErrorMsg("Erreur lors de l'acceptation")
        setPhase('error')
      })
  }

  const onClose = () => {
    setInvite(null)
    setPhase('idle')
    setErrorMsg('')
    activeIdRef.current = null
  }

  if (!invite && phase === 'idle') return null

  return (
    <Modal visible transparent animationType="fade">
      <View style={s.overlay}>
        <View style={s.box}>

          {phase === 'shown' && invite && (
            <>
              <Text style={s.emoji}>🎮</Text>
              <Text style={s.fromName}>{invite.fromName}</Text>
              <Text style={s.sub}>t'invite à jouer</Text>
              <View style={s.gameTag}>
                <Text style={s.gameTxt}>
                  {invite.game === 'dijouj' ? '🎴 Di Jouj' : '🃏 Ronda'}
                </Text>
              </View>
              {invite.betAmount > 0 ? (
                <Text style={s.bet}>Mise · {invite.betAmount} 🪙</Text>
              ) : (
                <Text style={s.bet}>Sans mise</Text>
              )}
              {invite.betAmount > gold && (
                <Text style={s.insufficient}>Or insuffisant ({gold} 🪙 disponible)</Text>
              )}
              <View style={s.actions}>
                <TouchableOpacity style={s.declineBtn} onPress={onDecline} activeOpacity={0.8}>
                  <Text style={s.declineTxt}>Refuser</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.acceptBtn, invite.betAmount > gold && s.acceptBtnDis]}
                  onPress={onAccept}
                  disabled={invite.betAmount > gold}
                  activeOpacity={0.85}
                >
                  <Text style={s.acceptTxt}>Accepter</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {(phase === 'accepting' || phase === 'waiting_room') && (
            <>
              <ActivityIndicator color={C.brass} size="large" style={{ marginBottom: 16 }} />
              <Text style={s.waitTxt}>
                {phase === 'accepting' ? 'Acceptation...' : 'En attente de la partie...'}
              </Text>
            </>
          )}

          {phase === 'error' && (
            <>
              <Text style={s.errTxt}>{errorMsg}</Text>
              <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.85}>
                <Text style={s.closeTxt}>Fermer</Text>
              </TouchableOpacity>
            </>
          )}

        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    backgroundColor: C.box,
    borderRadius: 22,
    paddingVertical: 36,
    paddingHorizontal: 32,
    width: 300,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  emoji:    { fontSize: 44, lineHeight: 52, marginBottom: 4 },
  fromName: { fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 20, letterSpacing: 0.3, textAlign: 'center' },
  sub:      { fontFamily: 'Cairo_400Regular', color: C.off, fontSize: 14 },
  gameTag: {
    backgroundColor: 'rgba(201,162,39,0.12)',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.30)',
  },
  gameTxt:      { fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 15, letterSpacing: 0.5 },
  bet:          { fontFamily: 'Cairo_400Regular', color: C.bone, fontSize: 14 },
  insufficient: { fontFamily: 'Cairo_400Regular', color: C.red, fontSize: 13 },
  actions: {
    flexDirection: 'row', gap: 12, marginTop: 8,
  },
  declineBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
    backgroundColor: 'rgba(192,57,43,0.15)',
    borderWidth: 1, borderColor: 'rgba(192,57,43,0.40)',
  },
  declineTxt: { fontFamily: 'Cairo_600SemiBold', color: C.red, fontSize: 14 },
  acceptBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
    backgroundColor: C.green,
    shadowColor: C.green, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.45, shadowRadius: 8, elevation: 6,
  },
  acceptBtnDis: { backgroundColor: 'rgba(39,174,96,0.30)', shadowOpacity: 0 },
  acceptTxt: { fontFamily: 'Cairo_600SemiBold', color: '#fff', fontSize: 14 },
  waitTxt:   { fontFamily: 'Cairo_400Regular', color: C.off, fontSize: 14, textAlign: 'center' },
  errTxt:    { fontFamily: 'Cairo_400Regular', color: C.red, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  closeBtn: {
    marginTop: 8, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12,
    backgroundColor: 'rgba(244,236,216,0.10)',
  },
  closeTxt: { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 14 },
})

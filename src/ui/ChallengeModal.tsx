import { useEffect, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native'
import { useAuth } from '../firebase/auth'
import { useProfile } from '../profile/useProfile'
import { sendChallenge } from '../firebase/firestore'
import { useI18n } from '../i18n/useI18n'

const C = {
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
  red:     '#C0392B',
} as const

const STAKES = [50, 100, 200, 500]

type Phase = 'setup' | 'sending' | 'sent' | 'error'

interface Props {
  visible: boolean
  friend: { uid: string; username: string } | null
  onClose: () => void
}

/**
 * Modale « ⚔️ Défier » (PlayerProfileContent.tsx) — choix du jeu, de la mise
 * (paliers fixes 50/100/200/500, pas de mise libre contrairement à
 * InviteToPlayModal : un défi est toujours misé) et d'un message optionnel.
 * Contrairement à InviteToPlayModal, n'attend pas la réponse dans la modale :
 * un défi peut être accepté jusqu'à 24h plus tard (voir sendChallenge), la
 * réponse est traitée ailleurs (FriendsScreen « Défis en attente »).
 */
export function ChallengeModal({ visible, friend, onClose }: Props) {
  const { user } = useAuth()
  const { username, gold } = useProfile()
  const { t } = useI18n()

  const [game, setGame] = useState<'ronda' | 'dijouj'>('ronda')
  const [stake, setStake] = useState(STAKES[0])
  const [message, setMessage] = useState('')
  const [phase, setPhase] = useState<Phase>('setup')
  const [error, setError] = useState('')

  useEffect(() => {
    if (visible) {
      setGame('ronda'); setStake(STAKES[0]); setMessage(''); setPhase('setup'); setError('')
    }
  }, [visible])

  const handleClose = () => {
    setPhase('setup')
    onClose()
  }

  const doSend = async () => {
    if (!user || !friend) return
    if (stake > gold) { setError(t('challengeInsufficientGold')); setPhase('error'); return }
    setPhase('sending')
    try {
      await sendChallenge(user.uid, username || 'Joueur', friend.uid, friend.username, game, stake, message)
      setPhase('sent')
    } catch {
      setError(t('challengeSendError'))
      setPhase('error')
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={s.overlay}>
        <View style={s.box}>

          {phase === 'setup' && (
            <>
              <Text style={s.title}>⚔️ {t('challengeTitle').replace('{name}', friend?.username ?? '')}</Text>

              <Text style={s.label}>{t('challengeGameLabel')}</Text>
              <View style={s.gameRow}>
                {(['ronda', 'dijouj'] as const).map((g) => (
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

              <Text style={s.label}>{t('challengeStakeLabel').replace('{n}', String(gold))}</Text>
              <View style={s.stakeRow}>
                {STAKES.map((b) => (
                  <TouchableOpacity
                    key={b}
                    style={[s.stakeChip, stake === b && s.stakeChipActive, b > gold && s.stakeChipDis]}
                    onPress={() => b <= gold && setStake(b)}
                    disabled={b > gold}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.stakeChipTxt, stake === b && s.stakeChipTxtActive, b > gold && s.stakeChipTxtDis]}>
                      {b} 🪙
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>{t('challengeMessageLabel')}</Text>
              <TextInput
                style={s.messageInput}
                value={message}
                onChangeText={(v) => setMessage(v.slice(0, 200))}
                placeholder={t('challengeMessagePlaceholder')}
                placeholderTextColor={C.boneOff}
                multiline
                maxLength={200}
              />

              <View style={s.actions}>
                <TouchableOpacity style={s.cancelBtn} onPress={handleClose} activeOpacity={0.8}>
                  <Text style={s.cancelTxt}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.sendBtn, stake > gold && s.sendBtnDis]}
                  onPress={() => { void doSend() }}
                  disabled={stake > gold}
                  activeOpacity={0.85}
                >
                  <Text style={s.sendTxt}>⚔️ {t('challengeSendBtn')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {phase === 'sending' && (
            <>
              <ActivityIndicator color={C.brass} size="large" />
              <Text style={s.statusTxt}>{t('challengeSending')}</Text>
            </>
          )}

          {phase === 'sent' && (
            <>
              <Text style={s.emoji}>⚔️</Text>
              <Text style={s.statusTxt}>{t('challengeSent').replace('{name}', friend?.username ?? '')}</Text>
              <TouchableOpacity style={s.sendBtn} onPress={handleClose} activeOpacity={0.85}>
                <Text style={s.sendTxt}>{t('close')}</Text>
              </TouchableOpacity>
            </>
          )}

          {phase === 'error' && (
            <>
              <Text style={s.emoji}>⚠️</Text>
              <Text style={s.errTxt}>{error}</Text>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setPhase('setup')} activeOpacity={0.8}>
                <Text style={s.cancelTxt}>{t('close')}</Text>
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

  stakeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' },
  stakeChip: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.22)', borderWidth: 1, borderColor: 'rgba(244,236,216,0.18)',
  },
  stakeChipActive: { backgroundColor: C.brass, borderColor: C.brass },
  stakeChipDis:    { opacity: 0.35 },
  stakeChipTxt:    { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 13 },
  stakeChipTxtActive: { color: C.ink },
  stakeChipTxtDis:    { color: C.boneOff },

  messageInput: {
    width: '100%', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.bone,
    borderWidth: 1, borderColor: 'rgba(244,236,216,0.15)', minHeight: 44, maxHeight: 80,
  },

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
  sendBtnDis: { opacity: 0.4 },
  sendTxt: { fontFamily: 'Cairo_600SemiBold', color: C.ink, fontSize: 14 },

  emoji:     { fontSize: 40, lineHeight: 48 },
  statusTxt: { fontFamily: 'Cairo_400Regular', color: C.bone, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errTxt:    { fontFamily: 'Cairo_400Regular', color: C.red, fontSize: 14, textAlign: 'center', lineHeight: 20 },
})

import { useState, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, Share, ActivityIndicator, ScrollView, Modal, FlatList,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { useI18n } from '../i18n/useI18n'
import { useProfile } from '../profile/useProfile'
import { useAuth } from '../firebase/auth'
import { useLobbyDiJouj } from '../online/useLobbyDiJouj'
import { getFriends, sendGameInvite, type FriendDoc } from '../firebase/firestore'

const MAX_PLAYERS = 4

const C = {
  gradTop: '#1A0008' as const,
  gradBot: '#2D0A1E' as const,
  surface: '#3D1030',
  acc:     '#8B1A4A',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.50)',
  ghost:   'rgba(244,236,216,0.12)',
  red:     '#C0392B',
  green:   '#27AE60',
} as const

export function DiJoujLobbyScreen() {
  const { t }        = useI18n()
  const { username } = useProfile()
  const { user }     = useAuth()
  const {
    phase, code, slots, isAdmin, adminPseudo, error,
    connect, joinByCode: joinLobbyByCode, startGame, leave,
  } = useLobbyDiJouj()

  const [joinCode, setJoinCode] = useState('')

  // ── Invite friend modal ──────────────────────────────────────────────────────
  const [showFriendModal, setShowFriendModal] = useState(false)
  const [friends,         setFriends]         = useState<FriendDoc[]>([])
  const [loadingFriends,  setLoadingFriends]  = useState(false)
  const [invitingUid,     setInvitingUid]     = useState<string | null>(null)
  const [invitedUids,     setInvitedUids]     = useState<Set<string>>(new Set())

  const openFriendModal = useCallback(async () => {
    if (!user) return
    setShowFriendModal(true)
    setLoadingFriends(true)
    try {
      const list = await getFriends(user.uid)
      setFriends(list)
    } catch {}
    setLoadingFriends(false)
  }, [user])

  const doInviteFriend = useCallback(async (friend: FriendDoc) => {
    if (!user || !code || invitingUid) return
    setInvitingUid(friend.uid)
    try {
      await sendGameInvite(user.uid, username || 'Joueur', friend.uid, 'dijouj', 0, code)
      setInvitedUids(prev => new Set([...prev, friend.uid]))
    } catch {}
    setInvitingUid(null)
  }, [user, code, username, invitingUid])

  const handleCreate = useCallback(() => {
    connect(username || 'Joueur')
  }, [connect, username])

  const handleJoin = useCallback(() => {
    const c = joinCode.trim().toUpperCase()
    if (c.length < 4) return
    joinLobbyByCode(username || 'Joueur', c)
  }, [joinLobbyByCode, username, joinCode])

  const handleShare = useCallback(async () => {
    if (!code) return
    try {
      await Share.share({ message: `Rejoins ma partie Di Jouj ! Code : ${code}` })
    } catch {}
  }, [code])

  const [confirmQuit, setConfirmQuit] = useState(false)

  const handleLeave = useCallback(() => {
    leave()
    router.back()
  }, [leave])

  const handleQuitGame = useCallback(() => {
    setConfirmQuit(false)
    leave()        // leaveLobby() → calls storeDiJouj.leave() when phase==='playing'
    router.back()
  }, [leave])

  // ── Phase playing : l'écran de jeu est sur /dijouj-online ─────────────────

  if (phase === 'playing') {
    return (
      <LinearGradient colors={[C.gradTop, C.gradBot]} style={s.root}>
        <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => router.push('/dijouj-online' as never)} activeOpacity={0.7} style={s.backBtn}>
              <Text style={s.backTxt}>← Jeu</Text>
            </TouchableOpacity>
            <Text style={s.title}>DI JOUJ</Text>
            <View style={s.headerSpacer} />
          </View>
          <View style={s.center}>
            <Text style={[s.sectionLabel, { fontSize: 15, marginBottom: 32 }]}>Partie en cours…</Text>
            <TouchableOpacity
              style={s.mainBtn}
              onPress={() => router.push('/dijouj-online' as never)}
              activeOpacity={0.8}
            >
              <Text style={s.mainBtnTxt}>↩ Retourner au jeu</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.mainBtn, { backgroundColor: 'rgba(192,57,43,0.20)', borderWidth: 1, borderColor: 'rgba(192,57,43,0.45)', marginTop: 14 }]}
              onPress={() => setConfirmQuit(true)}
              activeOpacity={0.8}
            >
              <Text style={[s.mainBtnTxt, { color: C.red }]}>Quitter la partie</Text>
            </TouchableOpacity>
          </View>

          {/* ── Modale confirmation forfait ─────────────────────────────────── */}
          <Modal visible={confirmQuit} transparent animationType="fade" onRequestClose={() => setConfirmQuit(false)}>
            <View style={s.quitBackdrop}>
              <View style={s.quitCard}>
                <Text style={s.quitTitle}>Quitter la partie ?</Text>
                <Text style={s.quitSub}>Tes adversaires gagneront automatiquement.</Text>
                <View style={s.quitActions}>
                  <TouchableOpacity style={s.stayBtn} onPress={() => setConfirmQuit(false)}>
                    <Text style={s.stayTxt}>Rester</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.leaveBtn} onPress={handleQuitGame}>
                    <Text style={s.leaveTxt}>Quitter</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </SafeAreaView>
      </LinearGradient>
    )
  }

  // ── Idle / Error ──────────────────────────────────────────────────────────

  if (phase === 'idle' || phase === 'error') {
    return (
      <LinearGradient colors={[C.gradTop, C.gradBot]} style={s.root}>
        <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={s.backBtn}>
              <Text style={s.backTxt}>{t('back')}</Text>
            </TouchableOpacity>
            <Text style={s.title}>DI JOUJ — LOBBY</Text>
            <View style={s.headerSpacer} />
          </View>

          <View style={s.center}>
            <Text style={s.sectionLabel}>{t('playWithFriend')}</Text>

            {phase === 'error' && error && (
              <Text style={s.errorTxt}>{error}</Text>
            )}

            <TouchableOpacity style={s.mainBtn} onPress={handleCreate} activeOpacity={0.8}>
              <Text style={s.mainBtnTxt}>{t('createGame')}</Text>
            </TouchableOpacity>

            <View style={s.dividerRow}>
              <View style={s.divider} />
              <Text style={s.dividerTxt}>ou</Text>
              <View style={s.divider} />
            </View>

            <View style={s.joinRow}>
              <TextInput
                style={s.codeInput}
                placeholder={t('codePlaceholder')}
                placeholderTextColor={C.boneOff}
                value={joinCode}
                onChangeText={v => setJoinCode(v.toUpperCase())}
                autoCapitalize="characters"
                maxLength={6}
              />
              <TouchableOpacity
                style={[s.joinBtn, joinCode.length < 4 && s.joinBtnDim]}
                onPress={handleJoin}
                activeOpacity={0.8}
                disabled={joinCode.length < 4}
              >
                <Text style={s.joinBtnTxt}>{t('joinWithCode')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>
    )
  }

  // ── Connecting ────────────────────────────────────────────────────────────

  if (phase === 'connecting') {
    return (
      <LinearGradient colors={[C.gradTop, C.gradBot]} style={s.root}>
        <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
          <View style={s.header}>
            <TouchableOpacity onPress={handleLeave} activeOpacity={0.7} style={s.backBtn}>
              <Text style={s.backTxt}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={s.title}>DI JOUJ — LOBBY</Text>
            <View style={s.headerSpacer} />
          </View>
          <View style={s.center}>
            <ActivityIndicator color={C.brass} size="large" />
          </View>
        </SafeAreaView>
      </LinearGradient>
    )
  }

  // ── Waiting (lobby actif) ─────────────────────────────────────────────────

  const humanSlots   = slots.filter(s => !s.isBot && s.connected)
  const connectedCnt = humanSlots.length
  const canLaunch    = connectedCnt >= 2
  const isFull       = connectedCnt >= MAX_PLAYERS

  let statusMsg: string
  if (isFull)        statusMsg = `${MAX_PLAYERS} joueurs max atteint`
  else if (canLaunch) statusMsg = `${connectedCnt} joueurs connectés — tu peux lancer !`
  else               statusMsg = 'En attente d\'au moins 2 joueurs...'

  return (
    <LinearGradient colors={[C.gradTop, C.gradBot]} style={s.root}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>

        <View style={s.header}>
          <TouchableOpacity onPress={handleLeave} activeOpacity={0.7} style={s.backBtn}>
            <Text style={s.backTxt}>{t('cancel')}</Text>
          </TouchableOpacity>
          <Text style={s.title}>DI JOUJ — LOBBY</Text>
          <View style={s.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Code de la room ──────────────────────────────────────────── */}
          <View style={s.codeBox}>
            <Text style={s.codeLabel}>Code de la partie</Text>
            <Text style={s.codeValue}>{code ?? '------'}</Text>
            <TouchableOpacity onPress={handleShare} activeOpacity={0.7} style={s.shareBtn}>
              <Text style={s.shareTxt}>⬆ {t('share')}</Text>
            </TouchableOpacity>
          </View>

          {/* ── Liste des joueurs (max 4 slots) ──────────────────────────── */}
          <View style={s.slotsList}>
            {Array.from({ length: MAX_PLAYERS }).map((_, i) => {
              const slot = humanSlots[i]
              if (slot) {
                return (
                  <View key={slot.sessionId} style={s.slotRow}>
                    <Text style={[s.slotIcon, { color: C.green }]}>✓</Text>
                    <Text style={s.slotName}>{slot.pseudo}</Text>
                    {slot.isAdmin && (
                      <View style={s.adminBadge}>
                        <Text style={s.adminBadgeTxt}>{t('djAdmin')}</Text>
                      </View>
                    )}
                  </View>
                )
              }
              return (
                <View key={`empty-${i}`} style={[s.slotRow, s.slotRowEmpty]}>
                  <Text style={[s.slotIcon, { color: C.boneOff }]}>⏳</Text>
                  <Text style={s.slotNameEmpty}>En attente d'un joueur...</Text>
                  {code && (
                    <TouchableOpacity style={s.inviteSlotBtn} onPress={openFriendModal} activeOpacity={0.8}>
                      <Text style={s.inviteSlotTxt}>+ Inviter</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            })}
          </View>

          {/* ── Message de statut ─────────────────────────────────────────── */}
          <View style={[s.statusBox, canLaunch && s.statusBoxActive]}>
            <Text style={[s.statusTxt, canLaunch && s.statusTxtActive]}>{statusMsg}</Text>
          </View>

          {/* ── Bouton lancer (admin) / message attente (non-admin) ──────── */}
          {isAdmin ? (
            <TouchableOpacity
              style={[s.launchBtn, !canLaunch && s.launchBtnDim]}
              onPress={startGame}
              activeOpacity={0.8}
              disabled={!canLaunch}
            >
              <Text style={s.launchBtnTxt}>{t('djLaunch')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.waitingRow}>
              <ActivityIndicator color={C.brass} size="small" />
              <Text style={s.waitingTxt}>
                En attente que {adminPseudo || 'l\'hôte'} lance la partie...
              </Text>
            </View>
          )}
        </ScrollView>

        {/* ── Modale amis ──────────────────────────────────────────────────── */}
        <Modal visible={showFriendModal} transparent animationType="fade" onRequestClose={() => setShowFriendModal(false)}>
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>Inviter un ami</Text>
              {loadingFriends ? (
                <ActivityIndicator color={C.brass} style={{ marginVertical: 24 }} />
              ) : friends.length === 0 ? (
                <Text style={s.modalEmpty}>Aucun ami pour l'instant</Text>
              ) : (
                <FlatList
                  data={friends}
                  keyExtractor={f => f.uid}
                  style={{ maxHeight: 300, width: '100%' }}
                  renderItem={({ item }) => {
                    const invited = invitedUids.has(item.uid)
                    return (
                      <View style={s.friendRow}>
                        <Text style={s.friendName}>{item.username}</Text>
                        <TouchableOpacity
                          style={[s.friendInviteBtn, invited && s.friendInviteDone]}
                          onPress={() => doInviteFriend(item)}
                          disabled={invited || invitingUid === item.uid}
                          activeOpacity={0.8}
                        >
                          {invitingUid === item.uid
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <Text style={s.friendInviteTxt}>{invited ? '✓ Envoyé' : 'Inviter'}</Text>
                          }
                        </TouchableOpacity>
                      </View>
                    )
                  }}
                />
              )}
              <TouchableOpacity style={s.modalCloseBtn} onPress={() => { setShowFriendModal(false); setInvitedUids(new Set()) }} activeOpacity={0.8}>
                <Text style={s.modalCloseTxt}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </LinearGradient>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
  },
  backBtn:      { paddingRight: 12, paddingVertical: 6 },
  backTxt:      { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  title: {
    flex: 1, textAlign: 'center',
    fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 16, letterSpacing: 3,
  },
  headerSpacer: { width: 60 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

  sectionLabel: {
    fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 20, textAlign: 'center', marginBottom: 24,
  },
  errorTxt: {
    fontFamily: 'Cairo_400Regular', color: C.red, fontSize: 14, textAlign: 'center', marginBottom: 16,
  },

  mainBtn: {
    width: '100%', paddingVertical: 16, paddingHorizontal: 24,
    borderRadius: 14, alignItems: 'center', backgroundColor: C.acc,
  },
  mainBtnTxt: { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 16, letterSpacing: 0.4 },

  dividerRow: {
    flexDirection: 'row', alignItems: 'center', width: '100%', marginVertical: 20, gap: 10,
  },
  divider:    { flex: 1, height: 1, backgroundColor: C.ghost },
  dividerTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },

  joinRow: { flexDirection: 'row', gap: 10, width: '100%', alignItems: 'center' },
  codeInput: {
    flex: 1, height: 48, backgroundColor: C.surface, borderRadius: 10,
    paddingHorizontal: 14, fontFamily: 'Cairo_400Regular', color: C.bone,
    fontSize: 18, letterSpacing: 4, textAlign: 'center',
    borderWidth: 1, borderColor: C.ghost,
  },
  joinBtn:    { paddingVertical: 14, paddingHorizontal: 16, backgroundColor: C.acc, borderRadius: 10 },
  joinBtnDim: { opacity: 0.45 },
  joinBtnTxt: { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 13 },

  // ── Lobby actif ──────────────────────────────────────────────────────────
  scrollContent: { padding: 20, gap: 20 },

  codeBox: {
    backgroundColor: C.surface, borderRadius: 16, paddingVertical: 24, paddingHorizontal: 24,
    alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)',
  },
  codeLabel: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 12, letterSpacing: 0.5 },
  codeValue: {
    fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 36, letterSpacing: 10,
    textShadowColor: 'rgba(201,162,39,0.4)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
  },
  shareBtn: { paddingVertical: 8, paddingHorizontal: 22, backgroundColor: C.acc, borderRadius: 10 },
  shareTxt: { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 13 },

  slotsList: { gap: 10 },
  slotRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16,
    borderWidth: 1, borderColor: C.ghost,
  },
  slotRowEmpty: { opacity: 0.55 },
  slotIcon:     { fontSize: 16, width: 20, textAlign: 'center' },
  slotName: {
    flex: 1, fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 15,
  },
  slotNameEmpty: {
    flex: 1, fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 14, fontStyle: 'italic',
  },
  adminBadge: {
    paddingVertical: 2, paddingHorizontal: 8, backgroundColor: C.brass, borderRadius: 6,
  },
  adminBadgeTxt: { fontFamily: 'Cairo_400Regular', color: '#1A0008', fontSize: 11 },

  statusBox: {
    backgroundColor: C.ghost, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16,
    alignItems: 'center', borderWidth: 1, borderColor: 'transparent',
  },
  statusBoxActive: { backgroundColor: 'rgba(39,174,96,0.12)', borderColor: 'rgba(39,174,96,0.3)' },
  statusTxt:       { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13, textAlign: 'center' },
  statusTxtActive: { color: '#27AE60', fontFamily: 'Cairo_600SemiBold' },

  launchBtn: {
    backgroundColor: C.brass, borderRadius: 14,
    paddingVertical: 18, alignItems: 'center',
    shadowColor: C.brass, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
  launchBtnDim: { opacity: 0.38, shadowOpacity: 0 },
  launchBtnTxt: { fontFamily: 'Cairo_600SemiBold', color: '#1A0008', fontSize: 17, letterSpacing: 0.5 },

  waitingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 12,
  },
  waitingTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13, flexShrink: 1 },

  inviteSlotBtn: {
    paddingVertical: 5, paddingHorizontal: 10,
    backgroundColor: C.acc, borderRadius: 8,
  },
  inviteSlotTxt: { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 12 },

  // ── Modale quitter ───────────────────────────────────────────────────────
  quitBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28,
  },
  quitCard: {
    width: '100%', maxWidth: 340, backgroundColor: '#3D1030', borderRadius: 18, padding: 24, gap: 10,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)',
  },
  quitTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 17, color: C.bone, textAlign: 'center' },
  quitSub:   { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff, textAlign: 'center', lineHeight: 18 },
  quitActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  stayBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.35)',
  },
  stayTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.boneOff },
  leaveBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    backgroundColor: 'rgba(192,57,43,0.20)', borderWidth: 1, borderColor: 'rgba(192,57,43,0.45)',
  },
  leaveTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.red },

  // ── Modal amis ────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalBox: {
    backgroundColor: '#1A0A14', borderRadius: 20,
    paddingVertical: 28, paddingHorizontal: 24,
    width: 300, alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)',
  },
  modalTitle: {
    fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 17, letterSpacing: 0.3,
  },
  modalEmpty: {
    fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 14,
    marginVertical: 16, textAlign: 'center',
  },
  friendRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.ghost,
    gap: 10,
  },
  friendName: { flex: 1, fontFamily: 'Cairo_400Regular', color: C.bone, fontSize: 14 },
  friendInviteBtn: {
    paddingVertical: 6, paddingHorizontal: 14,
    backgroundColor: C.acc, borderRadius: 8, minWidth: 72, alignItems: 'center',
  },
  friendInviteDone: { backgroundColor: C.green },
  friendInviteTxt: { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 12 },
  modalCloseBtn: {
    marginTop: 4, paddingVertical: 11, paddingHorizontal: 32,
    borderRadius: 10, backgroundColor: C.ghost,
  },
  modalCloseTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 14 },
})

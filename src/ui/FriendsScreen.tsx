import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { AvatarDisplay } from './ProfileScreen'
import { useAuth } from '../firebase/auth'
import {
  searchUserByUsername, sendFriendRequest, acceptFriendRequest, declineFriendRequest,
  getFriends, getPendingRequests, subscribePendingCount, subscribeFriendUnreadCounts,
  sendGameInvite, subscribeInviteById, updateInviteRoomCode, declineGameInvite,
  removeFriend,
  type FriendDoc, type UserDoc,
} from '../firebase/firestore'
import { useI18n } from '../i18n/useI18n'
import { useProfile } from '../profile/useProfile'
import { removeGold } from '../profile/profile'
import { connectFriendHost, getSnapshot as getRondaSnap } from '../online/store'
import { connectDiJoujFriendHost, getSnapshot as getDjSnap } from '../online/storeDiJouj'

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  clay:    '#B5532A',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
  red:     '#C0392B',
  green:   '#27AE60',
} as const

type Tab = 'friends' | 'requests' | 'add'

interface Props {
  onBack: () => void
}

export function FriendsScreen({ onBack }: Props) {
  const { user, loading: authLoading } = useAuth()
  const { t } = useI18n()
  const { username, gold } = useProfile()
  const [tab, setTab] = useState<Tab>('friends')

  const [friends, setFriends] = useState<FriendDoc[]>([])
  const [requests, setRequests] = useState<FriendDoc[]>([])
  const [loading, setLoading] = useState(false)

  // Badges temps réel
  const [pendingCount, setPendingCount] = useState(0)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})

  const refresh = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const [f, r] = await Promise.all([getFriends(user.uid), getPendingRequests(user.uid)])
      setFriends(f)
      setRequests(r)
    } catch {
      // règles Firestore / hors-ligne
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { void refresh() }, [refresh])

  // Abonnements temps réel pour badges
  useEffect(() => {
    if (!user) return
    const u1 = subscribePendingCount(user.uid, setPendingCount)
    const u2 = subscribeFriendUnreadCounts(user.uid, setUnreadCounts)
    return () => { u1(); u2() }
  }, [user])

  // ── Recherche / ajout ────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [result, setResult] = useState<UserDoc | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const [addMsg, setAddMsg] = useState<string | null>(null)

  const doSearch = async () => {
    if (!search.trim()) return
    setSearching(true)
    setResult(null)
    setAddMsg(null)
    try {
      const u = await searchUserByUsername(search)
      if (!u) setAddMsg(t('noPlayerFound'))
      else setResult(u)
    } catch {
      setAddMsg(t('searchFailed'))
    } finally {
      setSearching(false)
    }
  }

  const add = async (target: UserDoc) => {
    if (!user) return
    if (target.uid === user.uid) { setAddMsg(t('thatIsYou')); return }
    try {
      await sendFriendRequest(user.uid, target.uid)
      setAddMsg(t('requestSent').replace('{name}', target.username))
      setResult(null)
      setSearch('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg === 'already_sent') setAddMsg(t('alreadySent'))
      else setAddMsg(t('sendFailed'))
    }
  }

  const accept = async (fromUid: string) => {
    if (!user) return
    await acceptFriendRequest(user.uid, fromUid).catch(() => {})
    void refresh()
  }
  const decline = async (fromUid: string) => {
    if (!user) return
    await declineFriendRequest(user.uid, fromUid).catch(() => {})
    void refresh()
  }

  // ── Suppression d'ami ─────────────────────────────────────────────────────────
  const [removeTarget, setRemoveTarget] = useState<FriendDoc | null>(null)
  const [removing, setRemoving]         = useState(false)

  const doRemoveFriend = async () => {
    if (!user || !removeTarget) return
    setRemoving(true)
    await removeFriend(user.uid, removeTarget.uid).catch(() => {})
    setRemoving(false)
    setRemoveTarget(null)
    void refresh()
  }

  // ── Modale d'invitation de partie ────────────────────────────────────────────
  const [showInviteModal, setShowInviteModal]   = useState(false)
  const [inviteFriend,    setInviteFriend]      = useState<FriendDoc | null>(null)
  const [inviteGame,      setInviteGame]        = useState<'ronda' | 'dijouj'>('dijouj')
  const [inviteBet,       setInviteBet]         = useState(0)
  const [invitePhase,     setInvitePhase]       = useState<'setup' | 'sending' | 'waiting' | 'creating' | 'declined' | 'error'>('setup')
  const [inviteError,     setInviteError]       = useState('')
  const [pendingInvite,   setPendingInvite]     = useState<{ id: string; game: 'ronda' | 'dijouj'; bet: number } | null>(null)

  const usernameRef = useRef(username)
  usernameRef.current = username

  function openInviteModal(friend: FriendDoc) {
    setInviteFriend(friend)
    setInviteGame('dijouj')
    setInviteBet(0)
    setInvitePhase('setup')
    setInviteError('')
    setPendingInvite(null)
    setShowInviteModal(true)
  }

  function closeInviteModal() {
    if (pendingInvite && invitePhase === 'waiting') {
      void declineGameInvite(pendingInvite.id).catch(() => {})
    }
    setShowInviteModal(false)
    setInvitePhase('setup')
    setPendingInvite(null)
  }

  async function doSendInvite() {
    if (!user || !inviteFriend) return
    if (inviteBet > gold) { setInviteError('Or insuffisant'); setInvitePhase('error'); return }
    setInvitePhase('sending')
    try {
      const id = await sendGameInvite(user.uid, username || 'Joueur', inviteFriend.uid, inviteGame, inviteBet)
      setPendingInvite({ id, game: inviteGame, bet: inviteBet })
      setInvitePhase('waiting')
    } catch {
      setInviteError("Erreur lors de l'envoi de l'invitation")
      setInvitePhase('error')
    }
  }

  // Écoute la réponse de l'ami une fois l'invitation envoyée
  useEffect(() => {
    if (!pendingInvite || invitePhase !== 'waiting') return
    const { id, game, bet } = pendingInvite
    const unsub = subscribeInviteById(id, async (inv) => {
      if (!inv) return
      if (inv.status === 'declined') {
        setInvitePhase('declined')
      } else if (inv.status === 'accepted') {
        setInvitePhase('creating')
        try {
          let roomCode: string | null = null
          const pseudo = usernameRef.current || 'Joueur'
          if (game === 'dijouj') {
            await connectDiJoujFriendHost(pseudo, bet)
            roomCode = getDjSnap().roomCode
          } else {
            await connectFriendHost(pseudo, bet)
            roomCode = getRondaSnap().roomCode
          }
          if (!roomCode) throw new Error('no room code')
          if (bet > 0) removeGold(bet)
          await updateInviteRoomCode(id, roomCode)
          setShowInviteModal(false)
          setInvitePhase('setup')
          setPendingInvite(null)
          router.push((game === 'dijouj' ? '/dijouj-online' : '/online') as never)
        } catch {
          setInviteError('Impossible de créer la partie. Vérifiez votre connexion.')
          setInvitePhase('error')
        }
      }
    })
    return unsub
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInvite, invitePhase])

  // ── Rendu ─────────────────────────────────────────────────────────────────────

  if (!authLoading && !user) {
    return (
      <SafeAreaView style={[s.root, { justifyContent: 'center' }]}>
        <View style={s.center}>
          <Text style={s.empty}>{t('friendsLoginRequired')}</Text>
          <TouchableOpacity style={s.btnPrimary} onPress={onBack}>
            <Text style={s.btnPrimaryTxt}>{t('backShort')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const TABS: { key: Tab; label: string; badge: number }[] = [
    { key: 'friends',  label: t('friendsTab'),  badge: 0 },
    { key: 'requests', label: t('requestsTab'), badge: pendingCount },
    { key: 'add',      label: t('addTab'),       badge: 0 },
  ]

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>
        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>{t('back')}</Text>
          </TouchableOpacity>
          <Text style={s.title}>{t('friendsTab')}</Text>
        </View>

        <View style={s.tabs}>
          {TABS.map((tb) => (
            <TouchableOpacity
              key={tb.key}
              style={[s.tab, tab === tb.key && s.tabActive]}
              onPress={() => setTab(tb.key)}
            >
              <View style={s.tabInner}>
                <Text style={[s.tabTxt, tab === tb.key && s.tabTxtActive]}>{tb.label}</Text>
                {tb.badge > 0 && (
                  <View style={s.tabBadge}>
                    <Text style={s.tabBadgeTxt}>{tb.badge > 9 ? '9+' : tb.badge}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {loading && tab !== 'add' && <ActivityIndicator color={C.brass} style={{ marginTop: 24 }} />}

          {tab === 'friends' && !loading && (
            friends.length === 0
              ? <Text style={s.empty}>{t('noFriends')}</Text>
              : friends.map((f) => {
                const unread = unreadCounts[f.uid] ?? 0
                const initial = f.username?.[0]?.toUpperCase() ?? '?'
                return (
                  <View key={f.uid} style={s.row}>
                    <AvatarDisplay
                      type={(f.avatarType ?? 'initial') as 'initial' | 'emoji' | 'image'}
                      initial={initial}
                      emoji={f.avatarEmoji ?? ''}
                      image={f.avatarImage ?? ''}
                      size={40}
                    />
                    <Text style={s.rowName} numberOfLines={1}>{f.username}</Text>
                    <View style={s.rowActions}>
                      {/* Bouton Message avec badge non-lus */}
                      <TouchableOpacity
                        style={s.btnMsg}
                        onPress={() => router.push(`/chat?friendUid=${f.uid}&name=${encodeURIComponent(f.username)}` as never)}
                      >
                        <Text style={s.btnMsgTxt}>{t('messageBtn')}</Text>
                        {unread > 0 && (
                          <View style={s.msgBadge}>
                            <Text style={s.msgBadgeTxt}>{unread > 9 ? '9+' : unread}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity style={s.btnSmall} onPress={() => openInviteModal(f)}>
                        <Text style={s.btnSmallTxt}>🎮 {t('inviteToPlay')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.btnRemove} onPress={() => setRemoveTarget(f)}>
                        <Text style={s.btnRemoveTxt}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )
              })
          )}

          {tab === 'requests' && !loading && (
            requests.length === 0
              ? <Text style={s.empty}>{t('noRequests')}</Text>
              : requests.map((r) => {
                const initial = r.username?.[0]?.toUpperCase() ?? '?'
                return (
                  <View key={r.uid} style={s.row}>
                    <AvatarDisplay
                      type={(r.avatarType ?? 'initial') as 'initial' | 'emoji' | 'image'}
                      initial={initial}
                      emoji={r.avatarEmoji ?? ''}
                      image={r.avatarImage ?? ''}
                      size={40}
                    />
                    <Text style={s.rowName} numberOfLines={1}>{r.username}</Text>
                    <View style={s.rowActions}>
                      <TouchableOpacity style={s.btnAccept} onPress={() => accept(r.uid)}>
                        <Text style={s.btnAcceptTxt}>{t('acceptBtn')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.btnDecline} onPress={() => decline(r.uid)}>
                        <Text style={s.btnDeclineTxt}>{t('declineBtn')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )
              })
          )}

          {tab === 'add' && (
            <>
              <Text style={s.label}>{t('searchByUsername')}</Text>
              <View style={s.searchRow}>
                <TextInput
                  style={[s.input, searchFocused && s.inputFocused]}
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t('exactUsername')}
                  placeholderTextColor={C.boneOff}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onSubmitEditing={doSearch}
                  returnKeyType="search"
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                />
                <TouchableOpacity style={s.btnSearch} onPress={doSearch} disabled={searching}>
                  <Text style={s.btnSearchTxt}>{searching ? '…' : t('searchBtn')}</Text>
                </TouchableOpacity>
              </View>

              {result && (
                <View style={s.row}>
                  <AvatarDisplay
                    type={(result.avatarType ?? 'initial') as 'initial' | 'emoji' | 'image'}
                    initial={result.username?.[0]?.toUpperCase() ?? '?'}
                    emoji={result.avatarEmoji ?? ''}
                    image={result.avatarImage ?? ''}
                    size={40}
                  />
                  <Text style={s.rowName} numberOfLines={1}>{result.username}</Text>
                  <TouchableOpacity style={s.btnSmall} onPress={() => add(result)}>
                    <Text style={s.btnSmallTxt}>{t('addBtn')}</Text>
                  </TouchableOpacity>
                </View>
              )}
              {addMsg && <Text style={s.addMsg}>{addMsg}</Text>}
            </>
          )}
        </ScrollView>
      </View>

      {/* ── Modale suppression d'ami ──────────────────────────────────────────── */}
      <Modal visible={removeTarget !== null} transparent animationType="fade" onRequestClose={() => setRemoveTarget(null)}>
        <View style={s.modalOverlay}>
          <View style={s.confirmBox}>
            <Text style={s.confirmTitle}>{t('removeFriend')}</Text>
            <Text style={s.confirmSub}>
              {t('removeConfirm').replace('{name}', removeTarget?.username ?? '')}
            </Text>
            <View style={s.confirmActions}>
              <TouchableOpacity
                style={s.confirmCancelBtn}
                onPress={() => setRemoveTarget(null)}
                disabled={removing}
                activeOpacity={0.8}
              >
                <Text style={s.confirmCancelTxt}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmDeleteBtn, removing && { opacity: 0.5 }]}
                onPress={doRemoveFriend}
                disabled={removing}
                activeOpacity={0.85}
              >
                <Text style={s.confirmDeleteTxt}>{removing ? '...' : t('removeFriend')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modale d'invitation de partie ─────────────────────────────────────── */}
      <Modal visible={showInviteModal} transparent animationType="fade" onRequestClose={closeInviteModal}>
        <View style={s.modalOverlay}>
          <View style={s.inviteBox}>

            {/* ── Sélection jeu + mise ── */}
            {(invitePhase === 'setup') && (
              <>
                <Text style={s.inviteTitle}>Inviter {inviteFriend?.username}</Text>

                <Text style={s.inviteLabel}>Jeu</Text>
                <View style={s.gameRow}>
                  {(['dijouj', 'ronda'] as const).map((g) => (
                    <TouchableOpacity
                      key={g}
                      style={[s.gameBtn, inviteGame === g && s.gameBtnActive]}
                      onPress={() => setInviteGame(g)}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.gameBtnTxt, inviteGame === g && s.gameBtnTxtActive]}>
                        {g === 'dijouj' ? '🎴 Di Jouj' : '🃏 Ronda'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.inviteLabel}>Mise (solde : {gold} 🪙)</Text>
                <View style={s.betRow}>
                  {[0, 10, 25, 50, 100].map((b) => (
                    <TouchableOpacity
                      key={b}
                      style={[s.betChip, inviteBet === b && s.betChipActive, b > gold && s.betChipDis]}
                      onPress={() => b <= gold && setInviteBet(b)}
                      disabled={b > gold}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.betChipTxt, inviteBet === b && s.betChipTxtActive, b > gold && s.betChipTxtDis]}>
                        {b === 0 ? 'Libre' : `${b} 🪙`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={s.inviteActions}>
                  <TouchableOpacity style={s.inviteCancelBtn} onPress={closeInviteModal} activeOpacity={0.8}>
                    <Text style={s.inviteCancelTxt}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.inviteSendBtn} onPress={doSendInvite} activeOpacity={0.85}>
                    <Text style={s.inviteSendTxt}>Envoyer</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* ── Envoi en cours ── */}
            {invitePhase === 'sending' && (
              <>
                <ActivityIndicator color={C.brass} size="large" />
                <Text style={s.inviteStatusTxt}>Envoi de l'invitation...</Text>
              </>
            )}

            {/* ── En attente de réponse ── */}
            {invitePhase === 'waiting' && (
              <>
                <Text style={s.inviteEmoji}>⏳</Text>
                <Text style={s.inviteStatusTxt}>En attente de {inviteFriend?.username}...</Text>
                <TouchableOpacity style={s.inviteCancelBtn} onPress={closeInviteModal} activeOpacity={0.8}>
                  <Text style={s.inviteCancelTxt}>Annuler</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Création de la room ── */}
            {invitePhase === 'creating' && (
              <>
                <ActivityIndicator color={C.brass} size="large" />
                <Text style={s.inviteStatusTxt}>Création de la partie...</Text>
              </>
            )}

            {/* ── Invitation refusée ── */}
            {invitePhase === 'declined' && (
              <>
                <Text style={s.inviteEmoji}>😔</Text>
                <Text style={s.inviteStatusTxt}>{inviteFriend?.username} a refusé l'invitation</Text>
                <TouchableOpacity
                  style={s.inviteSendBtn}
                  onPress={() => { setInvitePhase('setup'); setPendingInvite(null) }}
                  activeOpacity={0.85}
                >
                  <Text style={s.inviteSendTxt}>Réessayer</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.inviteCancelBtn} onPress={closeInviteModal} activeOpacity={0.8}>
                  <Text style={s.inviteCancelTxt}>Fermer</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Erreur ── */}
            {invitePhase === 'error' && (
              <>
                <Text style={s.inviteEmoji}>⚠️</Text>
                <Text style={s.inviteErrTxt}>{inviteError}</Text>
                <TouchableOpacity
                  style={s.inviteCancelBtn}
                  onPress={() => { setShowInviteModal(false); setInvitePhase('setup'); setPendingInvite(null) }}
                  activeOpacity={0.8}
                >
                  <Text style={s.inviteCancelTxt}>Fermer</Text>
                </TouchableOpacity>
              </>
            )}

          </View>
        </View>
      </Modal>

    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.table, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 460, paddingHorizontal: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 28 },

  header: { paddingTop: 16, paddingBottom: 8, alignItems: 'center', gap: 6 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6 },
  backTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  title: { fontFamily: 'Cairo_600SemiBold', fontSize: 24, color: C.bone, letterSpacing: 1, textTransform: 'uppercase' },

  tabs: { flexDirection: 'row', gap: 8, paddingVertical: 10 },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.2)', borderWidth: 1, borderColor: 'rgba(244,236,216,0.12)',
  },
  tabActive: { backgroundColor: C.brass, borderColor: C.brass },
  tabTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.boneOff },
  tabTxtActive: { color: C.ink },

  body: { paddingVertical: 8, gap: 8, paddingBottom: 24 },
  empty: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff, textAlign: 'center', marginTop: 24, lineHeight: 20 },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14,
  },
  rowName: { flex: 1, fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.bone },
  rowActions: { flexDirection: 'row', gap: 8 },

  btnSmall: { backgroundColor: C.brass, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 14 },
  btnSmallTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.ink },
  btnAccept: { backgroundColor: C.brass, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 14 },
  btnAcceptTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.ink },
  btnDecline: { borderRadius: 9, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1.5, borderColor: C.clay },
  btnDeclineTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.clay },

  label: {
    fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff,
    letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 6, marginBottom: 4,
  },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: 'Cairo_400Regular', fontSize: 15, color: C.bone,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)',
  },
  inputFocused: {
    borderColor: C.brass,
    shadowColor: C.brass, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 6, elevation: 4,
  },
  btnSearch: { backgroundColor: C.brass, borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' },
  btnSearchTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.ink },
  addMsg: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.bone, marginTop: 10, textAlign: 'center' },

  btnPrimary: { backgroundColor: C.brass, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  btnPrimaryTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.ink },

  // Tabs avec badge
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabBadge: {
    backgroundColor: '#E53935',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 10, color: '#fff' },

  // Bouton Message + badge non-lus
  btnMsg: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(201,162,39,0.18)',
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.35)',
    gap: 5,
  },
  btnMsgTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.brass },
  msgBadge: {
    backgroundColor: '#E53935',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  msgBadgeTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 10, color: '#fff' },

  // Bouton supprimer ami
  btnRemove: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(192,57,43,0.15)',
    borderWidth: 1, borderColor: 'rgba(192,57,43,0.35)',
  },
  btnRemoveTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 12, color: C.red, lineHeight: 16 },

  // ── Modale confirmation suppression ────────────────────────────────────────
  confirmBox: {
    backgroundColor: '#1A2E25',
    borderRadius: 18,
    paddingVertical: 28,
    paddingHorizontal: 28,
    width: 300,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.30)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 16,
  },
  confirmTitle: { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 17, letterSpacing: 0.3 },
  confirmSub:   { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  confirmActions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 },
  confirmCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(244,236,216,0.22)',
  },
  confirmCancelTxt: { fontFamily: 'Cairo_600SemiBold', color: C.boneOff, fontSize: 14 },
  confirmDeleteBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    backgroundColor: C.red,
    shadowColor: C.red, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 6,
  },
  confirmDeleteTxt: { fontFamily: 'Cairo_600SemiBold', color: '#fff', fontSize: 14 },

  // ── Modale invitation de partie ─────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center',
  },
  inviteBox: {
    backgroundColor: '#1A2E25',
    borderRadius: 22,
    paddingVertical: 32,
    paddingHorizontal: 28,
    width: 320,
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.22)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  inviteTitle: {
    fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 18, letterSpacing: 0.4, textAlign: 'center',
  },
  inviteLabel: {
    fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 12,
    letterSpacing: 1.5, textTransform: 'uppercase', alignSelf: 'flex-start',
  },
  gameRow:      { flexDirection: 'row', gap: 10, width: '100%' },
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

  inviteActions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 },
  inviteCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(244,236,216,0.25)',
  },
  inviteCancelTxt: { fontFamily: 'Cairo_600SemiBold', color: C.boneOff, fontSize: 14 },
  inviteSendBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    backgroundColor: C.brass,
    shadowColor: C.brass, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  inviteSendTxt: { fontFamily: 'Cairo_600SemiBold', color: C.ink, fontSize: 14 },

  inviteEmoji:    { fontSize: 40, lineHeight: 48 },
  inviteStatusTxt: {
    fontFamily: 'Cairo_400Regular', color: C.bone, fontSize: 14, textAlign: 'center', lineHeight: 20,
  },
  inviteErrTxt: {
    fontFamily: 'Cairo_400Regular', color: C.red, fontSize: 14, textAlign: 'center', lineHeight: 20,
  },
})

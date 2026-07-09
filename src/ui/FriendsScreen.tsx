import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Animated, Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { AvatarDisplay } from './ProfileScreen'
import { xpRequired } from '../profile/profile'
import { useAuth } from '../firebase/auth'
import {
  searchUserByUsername, sendFriendRequest, acceptFriendRequest, declineFriendRequest,
  subscribePendingCount, subscribeFriendUnreadCounts,
  subscribeOnlineStatuses, removeFriend,
  type FriendDoc, type UserDoc, type PresenceInfo,
} from '../firebase/firestore'
import { getCachedFriends, isFriendsStale, refreshFriends, subscribeFriends } from '../online/friendsCache'
import { useI18n } from '../i18n/useI18n'
import { InviteToPlayModal } from './InviteToPlayModal'
import { PresenceDot, presenceLabel } from './PresenceDot'

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
  const [tab, setTab] = useState<Tab>('friends')

  // Libellés du statut « en jeu » (users/{uid}.gameStatus) — affichés à la
  // place du statut de présence générique quand l'ami est en train de faire
  // quelque chose de plus précis qu'« en ligne ».
  const STATUS_LABEL: Record<string, string> = {
    matchmaking:    t('gameStatusMatchmaking'),
    playing_online: t('gameStatusPlayingOnline'),
    playing_bot:    t('gameStatusPlayingBot'),
    playing_friend: t('gameStatusPlayingFriend'),
  }

  const [friends, setFriends] = useState<FriendDoc[]>([])
  const [requests, setRequests] = useState<FriendDoc[]>([])
  const [loading, setLoading] = useState(false)

  // Badges temps réel
  const [pendingCount, setPendingCount] = useState(0)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})

  // Présence en ligne (un seul abonnement groupé pour tous les amis).
  const [presence, setPresence] = useState<Record<string, PresenceInfo>>({})
  useEffect(() => {
    const uids = friends.map((f) => f.uid)
    if (uids.length === 0) { setPresence({}); return }
    const unsub = subscribeOnlineStatuses(uids, setPresence)
    return unsub
  }, [friends])

  // Refresh FORCÉ (bypass le TTL) — utilisé après une action de l'utilisateur
  // (accepter/refuser/supprimer un ami, envoyer une demande) : on veut des
  // données fraîches immédiatement, peu importe si le cache vient d'être
  // rempli il y a 10 secondes.
  const refresh = useCallback(async () => {
    if (!user) return
    await refreshFriends(user.uid)
    const data = getCachedFriends(user.uid)
    if (data) { setFriends(data.friends); setRequests(data.requests) }
  }, [user])

  // Affichage instantané depuis le cache (même périmé), puis refresh
  // silencieux en arrière-plan si absent ou dépassé les 2 min de TTL.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    const cached = getCachedFriends(user.uid)
    if (cached) {
      setFriends(cached.friends)
      setRequests(cached.requests)
    }
    if (isFriendsStale(user.uid)) {
      if (!cached) setLoading(true)
      void refreshFriends(user.uid).then(() => {
        if (cancelled) return
        const fresh = getCachedFriends(user.uid)
        if (fresh) { setFriends(fresh.friends); setRequests(fresh.requests) }
        setLoading(false)
      })
    }
    return () => { cancelled = true }
  }, [user])

  // Un refresh déclenché ailleurs (ex. preload au login) met aussi à jour cet écran.
  useEffect(() => {
    if (!user) return
    return subscribeFriends(() => {
      const data = getCachedFriends(user.uid)
      if (data) { setFriends(data.friends); setRequests(data.requests) }
    })
  }, [user])

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

  // ── Modale d'invitation de partie (extraite dans InviteToPlayModal) ───────────
  const [inviteFriend, setInviteFriend] = useState<FriendDoc | null>(null)

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
          {loading && tab !== 'add' && <FriendSkeletonRows count={5} />}

          {tab === 'friends' && !loading && (
            friends.length === 0
              ? (
                <View style={s.onboardingWrap}>
                  <Text style={s.onboardingIcon}>👥</Text>
                  <Text style={s.onboardingTitle}>{t('noFriends')}</Text>
                  <Text style={s.onboardingHint}>{t('noFriendsHint')}</Text>
                </View>
              )
              : friends.map((f) => {
                const unread = unreadCounts[f.uid] ?? 0
                const initial = f.username?.[0]?.toUpperCase() ?? '?'
                const info = presence[f.uid]
                const label = presenceLabel(info, t)
                const online = info?.isOnline === true
                const gameStatusText = info?.gameStatus ? STATUS_LABEL[info.gameStatus] : undefined
                return (
                  <View key={f.uid} style={s.row}>
                    <TouchableOpacity
                      style={s.rowMain}
                      onPress={() => router.push(`/friend-profile?uid=${f.uid}&name=${encodeURIComponent(f.username)}` as never)}
                      activeOpacity={0.7}
                    >
                      <View style={s.avatarWrap}>
                        <AvatarDisplay
                          type={(f.avatarType ?? 'initial') as 'initial' | 'emoji' | 'image'}
                          initial={initial}
                          emoji={f.avatarEmoji ?? ''}
                          image={f.avatarImage ?? ''}
                          size={40}
                          level={f.level}
                          xp={f.xp} xpMax={xpRequired(f.level ?? 1)}
                        />
                        <PresenceDot info={info} ring={C.table} />
                      </View>
                      <View style={s.nameCol}>
                        <Text style={s.rowName} numberOfLines={1}>{f.username}</Text>
                        {gameStatusText ? (
                          <Text style={s.gameStatusTxt} numberOfLines={1}>{gameStatusText}</Text>
                        ) : label ? (
                          <Text style={[s.statusTxt, online && s.statusOnline]} numberOfLines={1}>{label}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
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
                      <TouchableOpacity style={s.btnSmall} onPress={() => setInviteFriend(f)}>
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
                      level={r.level}
                      xp={r.xp} xpMax={xpRequired(r.level ?? 1)}
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
                    level={result.level}
                    xp={result.xp} xpMax={xpRequired(result.level)}
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
      <InviteToPlayModal
        visible={inviteFriend !== null}
        friend={inviteFriend}
        onClose={() => setInviteFriend(null)}
      />

    </SafeAreaView>
  )
}

// ── Lignes skeleton (pulse) — affichées uniquement au tout premier chargement,
// jamais préchargé (pas de cache du tout à montrer). ────────────────────────

function FriendSkeletonRow() {
  const pulse = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1,   duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 650, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  return (
    <Animated.View style={[s.row, { opacity: pulse }]}>
      <View style={s.skeletonAvatar} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={s.skeletonLine} />
        <View style={[s.skeletonLine, { width: '35%' }]} />
      </View>
    </Animated.View>
  )
}

function FriendSkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => <FriendSkeletonRow key={i} />)}
    </>
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

  onboardingWrap: { alignItems: 'center', marginTop: 48, gap: 10 },
  onboardingIcon:  { fontSize: 48, lineHeight: 56 },
  onboardingTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 17, color: C.bone, textAlign: 'center' },
  onboardingHint:  { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff, textAlign: 'center', lineHeight: 20 },

  skeletonAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(244,236,216,0.16)' },
  skeletonLine:   { height: 10, borderRadius: 5, width: '60%', backgroundColor: 'rgba(244,236,216,0.16)' },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarWrap: { position: 'relative' },
  nameCol: { flex: 1, gap: 1 },
  rowName: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.bone },
  statusTxt: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff },
  statusOnline: { color: C.green },
  gameStatusTxt: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.brass, fontStyle: 'italic' },
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

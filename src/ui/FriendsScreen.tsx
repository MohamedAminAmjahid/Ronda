import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Share,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { AvatarDisplay } from './ProfileScreen'
import { useAuth } from '../firebase/auth'
import {
  searchUserByUsername, sendFriendRequest, acceptFriendRequest, declineFriendRequest,
  getFriends, getPendingRequests, subscribePendingCount, subscribeFriendUnreadCounts,
  type FriendDoc, type UserDoc,
} from '../firebase/firestore'
import { useI18n } from '../i18n/useI18n'

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  clay:    '#B5532A',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
} as const

const GAME_URL = 'https://ronda-virid.vercel.app'

type Tab = 'friends' | 'requests' | 'add'

interface Props {
  onBack: () => void
}

export function FriendsScreen({ onBack }: Props) {
  const { user, loading: authLoading } = useAuth()
  const { t } = useI18n()
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

  const invite = async (friend: FriendDoc) => {
    try {
      await Share.share({ message: `🎴 ${GAME_URL}` })
    } catch { /* annulé */ }
  }

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
                      <TouchableOpacity style={s.btnSmall} onPress={() => invite(f)}>
                        <Text style={s.btnSmallTxt}>{t('inviteToPlay')}</Text>
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
})

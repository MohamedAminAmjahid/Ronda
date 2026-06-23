import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Share,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../firebase/auth'
import {
  searchUserByUsername, sendFriendRequest, acceptFriendRequest, declineFriendRequest,
  getFriends, getPendingRequests, type FriendDoc, type UserDoc,
} from '../firebase/firestore'

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
  const [tab, setTab] = useState<Tab>('friends')

  const [friends, setFriends] = useState<FriendDoc[]>([])
  const [requests, setRequests] = useState<FriendDoc[]>([])
  const [loading, setLoading] = useState(false)

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

  // ── Recherche / ajout ────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [result, setResult] = useState<UserDoc | null>(null)
  const [searching, setSearching] = useState(false)
  const [addMsg, setAddMsg] = useState<string | null>(null)

  const doSearch = async () => {
    if (!search.trim()) return
    setSearching(true)
    setResult(null)
    setAddMsg(null)
    try {
      const u = await searchUserByUsername(search)
      if (!u) setAddMsg('Aucun joueur trouvé.')
      else setResult(u)
    } catch {
      setAddMsg('Recherche impossible.')
    } finally {
      setSearching(false)
    }
  }

  const add = async (target: UserDoc) => {
    if (!user) return
    if (target.uid === user.uid) { setAddMsg("C'est toi 🙂"); return }
    try {
      await sendFriendRequest(user.uid, target.uid)
      setAddMsg(`Demande envoyée à ${target.username}.`)
      setResult(null)
      setSearch('')
    } catch {
      setAddMsg('Envoi impossible.')
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
      await Share.share({ message: `Viens jouer à la Ronda avec moi, ${friend.username} ! 🎴 ${GAME_URL}` })
    } catch { /* annulé */ }
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────────

  if (!authLoading && !user) {
    return (
      <SafeAreaView style={[s.root, { justifyContent: 'center' }]}>
        <View style={s.center}>
          <Text style={s.empty}>Connecte-toi pour gérer tes amis.</Text>
          <TouchableOpacity style={s.btnPrimary} onPress={onBack}>
            <Text style={s.btnPrimaryTxt}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'friends', label: 'Amis' },
    { key: 'requests', label: `Demandes${requests.length ? ` (${requests.length})` : ''}` },
    { key: 'add', label: 'Ajouter' },
  ]

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>
        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>← Menu</Text>
          </TouchableOpacity>
          <Text style={s.title}>Amis</Text>
        </View>

        <View style={s.tabs}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[s.tab, tab === t.key && s.tabActive]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[s.tabTxt, tab === t.key && s.tabTxtActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {loading && tab !== 'add' && <ActivityIndicator color={C.brass} style={{ marginTop: 24 }} />}

          {tab === 'friends' && !loading && (
            friends.length === 0
              ? <Text style={s.empty}>Aucun ami pour l'instant. Ajoute-en via l'onglet « Ajouter ».</Text>
              : friends.map((f) => (
                <View key={f.uid} style={s.row}>
                  <Text style={s.rowName} numberOfLines={1}>{f.username}</Text>
                  <TouchableOpacity style={s.btnSmall} onPress={() => invite(f)}>
                    <Text style={s.btnSmallTxt}>Inviter à jouer</Text>
                  </TouchableOpacity>
                </View>
              ))
          )}

          {tab === 'requests' && !loading && (
            requests.length === 0
              ? <Text style={s.empty}>Aucune demande en attente.</Text>
              : requests.map((r) => (
                <View key={r.uid} style={s.row}>
                  <Text style={s.rowName} numberOfLines={1}>{r.username}</Text>
                  <View style={s.rowActions}>
                    <TouchableOpacity style={s.btnAccept} onPress={() => accept(r.uid)}>
                      <Text style={s.btnAcceptTxt}>Accepter</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.btnDecline} onPress={() => decline(r.uid)}>
                      <Text style={s.btnDeclineTxt}>Refuser</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
          )}

          {tab === 'add' && (
            <>
              <Text style={s.label}>Rechercher par pseudo</Text>
              <View style={s.searchRow}>
                <TextInput
                  style={s.input}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Pseudo exact"
                  placeholderTextColor={C.boneOff}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onSubmitEditing={doSearch}
                  returnKeyType="search"
                />
                <TouchableOpacity style={s.btnSearch} onPress={doSearch} disabled={searching}>
                  <Text style={s.btnSearchTxt}>{searching ? '…' : 'Chercher'}</Text>
                </TouchableOpacity>
              </View>

              {result && (
                <View style={s.row}>
                  <Text style={s.rowName} numberOfLines={1}>{result.username}</Text>
                  <TouchableOpacity style={s.btnSmall} onPress={() => add(result)}>
                    <Text style={s.btnSmallTxt}>Ajouter</Text>
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
  btnSearch: { backgroundColor: C.brass, borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' },
  btnSearchTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.ink },
  addMsg: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.bone, marginTop: 10, textAlign: 'center' },

  btnPrimary: { backgroundColor: C.brass, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  btnPrimaryTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.ink },
})

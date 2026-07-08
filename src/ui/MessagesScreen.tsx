import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, type Href } from 'expo-router'
import { AvatarDisplay } from './ProfileScreen'
import { useAuth } from '../firebase/auth'
import { getUserChats, deleteChat, type ChatPreview } from '../firebase/firestore'
import { getCachedProfile, isProfileStale, refreshProfile, subscribeProfile } from '../online/profileCache'
import { useI18n } from '../i18n/useI18n'

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.45)',
  red:     '#C0392B',
} as const

interface Props {
  onBack: () => void
}

/** Heure/date relative compacte d'un dernier message. */
function shortTime(d: Date | null): string {
  if (!d) return ''
  const min = Math.floor((Date.now() - d.getTime()) / 60000)
  if (min < 1)  return 'à l\'instant'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24)   return `${h} h`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days} j`
  return d.toLocaleDateString()
}

export function MessagesScreen({ onBack }: Props) {
  const { t }    = useI18n()
  const { user } = useAuth()

  const [chats, setChats]     = useState<ChatPreview[]>([])
  const [loading, setLoading] = useState(true)
  const [toDelete, setToDelete] = useState<ChatPreview | null>(null)
  const [, forceRender]       = useState(0)

  // Charge les conversations.
  useEffect(() => {
    if (!user) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    void getUserChats(user.uid)
      .then((list) => {
        if (cancelled) return
        setChats(list)
        // Préchauffe le profil de chaque interlocuteur.
        for (const c of list) {
          const other = c.participants.find((p) => p !== user.uid)
          if (other && isProfileStale(other)) void refreshProfile(other)
        }
      })
      .catch(() => { if (!cancelled) setChats([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user])

  // Re-render quand un profil du cache est mis à jour.
  useEffect(() => subscribeProfile(() => forceRender((n) => n + 1)), [])

  const confirmDelete = useCallback(async () => {
    if (!toDelete) return
    const id = toDelete.chatId
    setToDelete(null)
    setChats((prev) => prev.filter((c) => c.chatId !== id))   // retrait optimiste
    await deleteChat(id).catch(() => {})
  }, [toDelete])

  const openChat = (c: ChatPreview) => {
    if (!user) return
    const other = c.participants.find((p) => p !== user.uid)
    if (!other) return
    const prof = getCachedProfile(other)
    const name = prof?.username ?? 'Joueur'
    router.push(`/chat?friendUid=${other}&name=${encodeURIComponent(name)}` as Href)
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>
        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>{t('back')}</Text>
          </TouchableOpacity>
          <Text style={s.title}>💬 {t('messagesTitle')}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={C.brass} style={{ marginTop: 40 }} />
        ) : chats.length === 0 ? (
          <Text style={s.empty}>{t('messagesEmpty')}</Text>
        ) : (
          <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
            {chats.map((c) => {
              const other = user ? c.participants.find((p) => p !== user.uid) : undefined
              const prof  = other ? getCachedProfile(other) : null
              const name  = prof?.username ?? 'Joueur'
              const initial = name[0]?.toUpperCase() ?? '?'
              return (
                <View key={c.chatId} style={s.row}>
                  <TouchableOpacity style={s.rowMain} onPress={() => openChat(c)} activeOpacity={0.75}>
                    <AvatarDisplay
                      type={(prof?.avatarType ?? 'initial') as 'initial' | 'emoji' | 'image'}
                      initial={initial}
                      emoji={prof?.avatarEmoji ?? ''}
                      image={prof?.avatarImage ?? ''}
                      size={46}
                    />
                    <View style={s.rowBody}>
                      <View style={s.rowTop}>
                        <Text style={s.rowName} numberOfLines={1}>{name}</Text>
                        <Text style={s.rowTime}>{shortTime(c.updatedAt)}</Text>
                      </View>
                      <View style={s.rowBottom}>
                        <Text
                          style={[s.rowMsg, c.unreadCount > 0 && s.rowMsgUnread]}
                          numberOfLines={1}
                        >
                          {c.lastMessage || '—'}
                        </Text>
                        {c.unreadCount > 0 && (
                          <View style={s.unreadBadge}>
                            <Text style={s.unreadTxt}>{c.unreadCount > 9 ? '9+' : c.unreadCount}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.trashBtn} onPress={() => setToDelete(c)} hitSlop={8} activeOpacity={0.7}>
                    <Text style={s.trashTxt}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              )
            })}
          </ScrollView>
        )}
      </View>

      {/* Confirmation de suppression */}
      <Modal visible={toDelete !== null} transparent animationType="fade" onRequestClose={() => setToDelete(null)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>{t('messagesDeleteConfirm')}</Text>
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setToDelete(null)}>
                <Text style={s.modalCancelTxt}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalDelete} onPress={() => { void confirmDelete() }}>
                <Text style={s.modalDeleteTxt}>{t('delete')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.table, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 460, paddingHorizontal: 18 },

  header:  { paddingTop: 16, paddingBottom: 8, alignItems: 'center', gap: 6 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6 },
  backTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  title:   { fontFamily: 'Cairo_600SemiBold', fontSize: 24, color: C.bone, letterSpacing: 1, textTransform: 'uppercase' },

  empty:   { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff, textAlign: 'center', marginTop: 48, paddingHorizontal: 24, lineHeight: 22 },

  list:    { paddingVertical: 10, gap: 8, paddingBottom: 28 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 14, paddingLeft: 12, paddingRight: 6, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.18)',
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowBody: { flex: 1, gap: 3 },
  rowTop:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowName: { flex: 1, fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.bone },
  rowTime: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowMsg:  { flex: 1, fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff },
  rowMsgUnread: { color: C.bone, fontFamily: 'Cairo_600SemiBold' },
  unreadBadge: {
    backgroundColor: C.red, borderRadius: 9, minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  unreadTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 11, color: '#fff' },
  trashBtn:  { padding: 8, marginLeft: 2 },
  trashTxt:  { fontSize: 18 },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28,
  },
  modalCard: {
    width: '100%', maxWidth: 320, backgroundColor: C.deep, borderRadius: 18, padding: 22, gap: 16,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)',
  },
  modalTitle:   { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.bone, textAlign: 'center', lineHeight: 22 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancel: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.35)',
  },
  modalCancelTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.boneOff },
  modalDelete: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    backgroundColor: 'rgba(192,57,43,0.20)', borderWidth: 1, borderColor: 'rgba(192,57,43,0.45)',
  },
  modalDeleteTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: '#E57373' },
})

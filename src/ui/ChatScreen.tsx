import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../firebase/auth'
import {
  getChatId, sendMessage, subscribeMessages, markChatRead, getUserById,
  subscribeOnlineStatus,
  type MessageDoc, type PresenceInfo,
} from '../firebase/firestore'
import { getCachedMessages, setCachedMessages } from '../online/messagesCache'
import { useI18n } from '../i18n/useI18n'
import { AvatarDisplay } from './ProfileScreen'
import { PlayerProfileModal } from './PlayerProfileModal'
import { xpRequired } from '../profile/profile'
import { PresenceDot, presenceLabel } from './PresenceDot'

const C = {
  bg:          '#0D0D1A',
  border:      'rgba(201,162,39,0.18)',
  brass:       '#C9A227',
  bone:        '#F4ECD8',
  boneOff:     'rgba(244,236,216,0.45)',
  ink:         '#1C2622',
  bubbleMine:  '#C9A227',
  bubbleTheir: '#1A1A35',
  red:         '#E53935',
} as const

interface Props {
  friendUid: string
  friendName: string
  onBack: () => void
}

export function ChatScreen({ friendUid, friendName, onBack }: Props) {
  const { user } = useAuth()
  const { t } = useI18n()
  const scrollRef = useRef<ScrollView>(null)

  const chatId = user ? getChatId(user.uid, friendUid) : ''

  // Affichage instantané des messages en cache (skeleton seulement sans cache).
  const [messages, setMessages] = useState<MessageDoc[]>(() => (chatId ? getCachedMessages(chatId) ?? [] : []))
  const [loading, setLoading] = useState(() => !(chatId && getCachedMessages(chatId)))
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inputFocused, setInputFocused] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  // Avatar + niveau de l'ami, chargés depuis Firestore
  const [friendAvatar, setFriendAvatar] = useState<{
    avatarType: string; avatarEmoji: string; avatarImage: string
  }>({ avatarType: 'initial', avatarEmoji: '', avatarImage: '' })
  const [friendLevel, setFriendLevel] = useState<number | undefined>(undefined)
  const [friendXp,    setFriendXp]    = useState<number | undefined>(undefined)

  const [presence, setPresence] = useState<PresenceInfo | null>(null)

  useEffect(() => {
    void getUserById(friendUid).then(doc => {
      if (!doc) return
      setFriendAvatar({ avatarType: doc.avatarType, avatarEmoji: doc.avatarEmoji, avatarImage: doc.avatarImage })
      setFriendLevel(doc.level)
      setFriendXp(doc.xp)
    })
  }, [friendUid])

  useEffect(() => {
    const unsub = subscribeOnlineStatus(friendUid, setPresence)
    return unsub
  }, [friendUid])

  useEffect(() => {
    if (!user || !chatId) return
    void markChatRead(chatId, user.uid)
    // Affichage immédiat du cache s'il existe.
    const cached = getCachedMessages(chatId)
    if (cached) { setMessages(cached); setLoading(false) }
    const unsub = subscribeMessages(chatId, (msgs) => {
      setMessages(msgs)
      setCachedMessages(chatId, msgs)   // flux temps réel → cache
      setLoading(false)
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80)
    })
    return unsub
  }, [chatId, user])

  const onSend = async () => {
    if (!user || !text.trim() || sending) return
    const msg = text.trim()
    setText('')
    setError(null)
    setSending(true)
    try {
      await sendMessage(user.uid, friendUid, msg)
    } catch {
      setError(t('chatErrorSend'))
      setText(msg)
    } finally {
      setSending(false)
    }
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={s.avatarWrap}>
          <AvatarDisplay
            type={friendAvatar.avatarType as 'initial' | 'emoji' | 'image'}
            initial={friendName?.[0]?.toUpperCase() ?? '?'}
            emoji={friendAvatar.avatarEmoji}
            image={friendAvatar.avatarImage}
            size={36}
            level={friendLevel}
            xp={friendXp}
            xpMax={friendLevel !== undefined ? xpRequired(friendLevel) : undefined}
            onPress={() => setShowProfile(true)}
          />
          <PresenceDot info={presence} ring={C.bg} />
        </View>
        <View style={s.headerNameCol}>
          <Text style={s.headerName} numberOfLines={1}>{friendName}</Text>
          {(() => {
            const label = presenceLabel(presence, t, { hours: true })
            return label
              ? <Text style={[s.headerStatus, presence?.isOnline && s.headerStatusOnline]} numberOfLines={1}>{label}</Text>
              : null
          })()}
        </View>
      </View>

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={s.flex}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {loading && <ActivityIndicator color={C.brass} style={{ marginTop: 48 }} />}

          {!loading && messages.length === 0 && (
            <Text style={s.emptyTxt}>{t('chatEmpty')}</Text>
          )}

          {messages.map((msg) => {
            const mine = msg.fromUid === user?.uid
            return (
              <View key={msg.id} style={[s.row, mine ? s.rowRight : s.rowLeft]}>
                <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleTheir]}>
                  <Text style={[s.bubbleTxt, mine ? s.bubbleTxtMine : s.bubbleTxtTheir]}>
                    {msg.text}
                  </Text>
                </View>
              </View>
            )
          })}
        </ScrollView>

        {/* Erreur */}
        {error && <Text style={s.errorTxt}>{error}</Text>}

        {/* Saisie */}
        <View style={s.inputRow}>
          <TextInput
            style={[s.input, inputFocused && s.inputFocused]}
            value={text}
            onChangeText={setText}
            placeholder={t('chatPlaceholder')}
            placeholderTextColor={C.boneOff}
            multiline
            maxLength={500}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!text.trim() || sending) && s.sendBtnOff]}
            onPress={onSend}
            disabled={!text.trim() || sending}
          >
            <Text style={s.sendTxt}>{t('chatSend')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <PlayerProfileModal
        visible={showProfile}
        uid={friendUid}
        name={friendName}
        onClose={() => setShowProfile(false)}
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: C.bg },
  flex:  { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn:   { paddingRight: 4 },
  backArrow: { fontSize: 22, color: C.brass },
  avatarWrap: { position: 'relative' },
  headerNameCol: { flex: 1, gap: 1 },
  headerName: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 17,
    color: C.bone,
    letterSpacing: 0.3,
  },
  headerStatus: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff },
  headerStatusOnline: { color: '#27AE60' },

  // Liste messages
  list: { padding: 14, gap: 8, flexGrow: 1 },
  emptyTxt: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 14,
    color: C.boneOff,
    textAlign: 'center',
    marginTop: 48,
  },

  row:      { flexDirection: 'row' },
  rowRight: { justifyContent: 'flex-end' },
  rowLeft:  { justifyContent: 'flex-start' },

  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  bubbleMine: {
    backgroundColor: C.bubbleMine,
    borderBottomRightRadius: 4,
  },
  bubbleTheir: {
    backgroundColor: C.bubbleTheir,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  bubbleTxt:      { fontFamily: 'Cairo_400Regular', fontSize: 15, lineHeight: 21 },
  bubbleTxtMine:  { color: C.ink },
  bubbleTxtTheir: { color: C.bone },

  errorTxt: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 12,
    color: C.red,
    textAlign: 'center',
    paddingBottom: 4,
  },

  // Saisie
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.bg,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontFamily: 'Cairo_400Regular',
    fontSize: 15,
    color: C.bone,
    borderWidth: 1,
    borderColor: C.border,
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: C.brass,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  sendBtnOff: { opacity: 0.35 },
  sendTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.ink },
  inputFocused: {
    borderColor: C.brass,
    shadowColor: C.brass, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
})

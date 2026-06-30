import { useState, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, StyleSheet, Animated, Keyboard,
} from 'react-native'
import type { ChatMessage } from '../online/store'

const QUICK = ['😄', '👍', '😮', '🔥', 'gg', 'bien joué']

interface Props {
  messages:    ChatMessage[]
  sendMessage: (text: string) => void
  myUsername:  string
  accentColor: string
  isGameOver:  boolean
}

export function GameChat({ messages, sendMessage, myUsername, accentColor, isGameOver }: Props) {
  const [open,    setOpen]    = useState(false)
  const [input,   setInput]   = useState('')
  const [unread,  setUnread]  = useState(0)
  const prevLen               = useRef(messages.length)
  const listRef               = useRef<FlatList>(null)
  const slideAnim             = useRef(new Animated.Value(0)).current

  // Track unread messages when panel is closed
  useEffect(() => {
    const added = messages.length - prevLen.current
    prevLen.current = messages.length
    if (!open && added > 0) setUnread(u => u + added)
  }, [messages.length, open])

  // Slide animation
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: open ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start()
  }, [open, slideAnim])

  // Auto-scroll to bottom on new messages when open
  useEffect(() => {
    if (open && messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true })
    }
  }, [messages.length, open])

  function openPanel() {
    setOpen(true)
    setUnread(0)
  }

  function closePanel() {
    setOpen(false)
    Keyboard.dismiss()
  }

  function doSend(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    try {
      sendMessage(trimmed)
    } catch (e) {
      console.error('[chat] send error:', e)
    }
    setInput('')
  }

  if (isGameOver) return null

  const translateY = slideAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [260, 0],
  })

  return (
    <View style={s.wrapper} pointerEvents="box-none">
      {/* ── Panel ─────────────────────────────────────────────────────────── */}
      {open && (
        <Animated.View style={[s.panel, { transform: [{ translateY }] }]}>
          {/* Header */}
          <View style={[s.panelHeader, { backgroundColor: accentColor }]}>
            <Text style={s.panelTitle}>Chat</Text>
            <TouchableOpacity onPress={closePanel} activeOpacity={0.7} style={s.closeBtn}>
              <Text style={s.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Messages */}
          <FlatList
            ref={listRef}
            style={s.msgList}
            data={messages}
            keyExtractor={m => String(m.id)}
            onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              const isMe = item.username === myUsername
              return (
                <View style={[s.bubbleRow, isMe ? s.bubbleRowMe : s.bubbleRowOther]}>
                  {!isMe && <Text style={s.senderName}>{item.username}</Text>}
                  <View style={[s.bubble, isMe
                    ? [s.bubbleMe, { backgroundColor: accentColor }]
                    : s.bubbleOther,
                  ]}>
                    <Text style={[s.bubbleTxt, isMe ? s.bubbleTxtMe : s.bubbleTxtOther]}>
                      {item.text}
                    </Text>
                  </View>
                </View>
              )
            }}
            ListEmptyComponent={
              <Text style={s.emptyTxt}>Pas encore de message…</Text>
            }
          />

          {/* Quick messages */}
          <View style={s.quickRow}>
            {QUICK.map(q => (
              <TouchableOpacity key={q} style={s.quickChip} onPress={() => doSend(q)} activeOpacity={0.7}>
                <Text style={s.quickTxt}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Input */}
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder="Message…"
              placeholderTextColor="rgba(255,255,255,0.4)"
              maxLength={120}
              onSubmitEditing={() => doSend(input)}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[s.sendBtn, { backgroundColor: accentColor }]}
              onPress={() => doSend(input)}
              activeOpacity={0.8}
            >
              <Text style={s.sendTxt}>➤</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* ── Toggle button ─────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[s.toggleBtn, { backgroundColor: accentColor }]}
        onPress={open ? closePanel : openPanel}
        activeOpacity={0.8}
      >
        <Text style={s.toggleIcon}>💬</Text>
        {!open && unread > 0 && (
          <View style={s.badge}>
            <Text style={s.badgeTxt}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 90,
    right: 16,
    alignItems: 'flex-end',
    zIndex: 998,
  },

  // ── Panel ──────────────────────────────────────────────────────────────────
  panel: {
    width: 260,
    height: 320,
    backgroundColor: '#1A1A2E',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  panelTitle: {
    color: '#fff',
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 13,
  },
  closeBtn:  { padding: 4 },
  closeTxt:  { color: 'rgba(255,255,255,0.7)', fontSize: 13 },

  // ── Messages ───────────────────────────────────────────────────────────────
  msgList: { flex: 1, paddingHorizontal: 10, paddingTop: 6 },

  bubbleRow:      { marginBottom: 6 },
  bubbleRowMe:    { alignItems: 'flex-end' },
  bubbleRowOther: { alignItems: 'flex-start' },

  senderName: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 2,
    fontFamily: 'Cairo_400Regular',
  },

  bubble: {
    maxWidth: 180,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  bubbleMe: {
    borderBottomRightRadius: 2,
  },
  bubbleOther: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderBottomLeftRadius: 2,
  },
  bubbleTxt:      { fontSize: 13, fontFamily: 'Cairo_400Regular' },
  bubbleTxtMe:    { color: '#fff' },
  bubbleTxtOther: { color: 'rgba(255,255,255,0.85)' },

  emptyTxt: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
    fontFamily: 'Cairo_400Regular',
  },

  // ── Quick chips ────────────────────────────────────────────────────────────
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingBottom: 4,
    gap: 4,
  },
  quickChip: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  quickTxt: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Cairo_400Regular',
  },

  // ── Input ──────────────────────────────────────────────────────────────────
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 6,
  },
  input: {
    flex: 1,
    height: 34,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Cairo_400Regular',
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendTxt: { color: '#fff', fontSize: 14 },

  // ── Toggle button ──────────────────────────────────────────────────────────
  toggleBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  toggleIcon: { fontSize: 22 },

  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#E53935',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeTxt: {
    color: '#fff',
    fontSize: 9,
    fontFamily: 'Cairo_600SemiBold',
  },
})

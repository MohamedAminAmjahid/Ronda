import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Animated,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { CardFace, CardBack } from './components/Card'
import type { Card } from '../engine/types'
import { useProfile } from '../profile/useProfile'
import {
  sendSpectatorMessage, subscribeSpectatorChat, type SpectatorMessage,
} from '../firebase/firestore'
import {
  useSpectate, startSpectate, stopSpectate, sendCheer, type SpectatePlayer,
} from '../online/spectate'

const C = {
  gradTop: '#0C3A29' as const,
  gradBot: '#061A12' as const,
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.55)',
  ghost:   'rgba(244,236,216,0.12)',
  ink:     '#1C2622',
} as const

const CHEER_EMOJIS = ['👏', '🔥', '💪', '🎉', '😮']

interface Props {
  code: string
  onBack: () => void
}

/** Rangée de dos de cartes (main cachée d'un joueur). */
function BackRow({ count }: { count: number }) {
  const n = Math.min(count, 7)
  return (
    <View style={{ flexDirection: 'row' }}>
      {Array.from({ length: n }).map((_, i) => (
        <View key={i} style={{ marginLeft: i > 0 ? -22 : 0 }}><CardBack size="sm" /></View>
      ))}
    </View>
  )
}

/** Bandeau joueur (pseudo + score + dos de cartes), mis en avant si c'est son tour. */
function PlayerStrip({ player, active, seatLabel }: { player: SpectatePlayer | undefined; active: boolean; seatLabel: string }) {
  return (
    <View style={[s.playerStrip, active && s.playerStripActive]}>
      <BackRow count={player?.handCount ?? 0} />
      <Text style={s.playerName} numberOfLines={1}>
        {active ? '▶ ' : ''}{player?.pseudo ?? seatLabel} — {player?.score ?? 0}
      </Text>
    </View>
  )
}

export function SpectateScreen({ code, onBack }: Props) {
  const { username } = useProfile()
  const snap = useSpectate()

  const [chat, setChat] = useState<SpectatorMessage[]>([])
  const [text, setText] = useState('')
  const chatRef = useRef<ScrollView>(null)

  // Connexion / déconnexion au flux Colyseus spectateur.
  useEffect(() => {
    void startSpectate(code, username || 'Spectateur')
    return () => { stopSpectate() }
  }, [code, username])

  // Chat spectateur (Firestore).
  useEffect(() => {
    const unsub = subscribeSpectatorChat(code, (msgs) => {
      setChat(msgs)
      setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 60)
    })
    return unsub
  }, [code])

  // Animation d'emoji de soutien.
  const cheerAnim = useRef(new Animated.Value(0)).current
  const [cheerShown, setCheerShown] = useState<{ emoji: string; targetSeat: number } | null>(null)
  useEffect(() => {
    if (!snap.cheer) return
    setCheerShown({ emoji: snap.cheer.emoji, targetSeat: snap.cheer.targetSeat })
    cheerAnim.setValue(0)
    Animated.timing(cheerAnim, { toValue: 1, duration: 1400, useNativeDriver: true }).start(() => setCheerShown(null))
  }, [snap.cheer, cheerAnim])

  const seat0 = snap.players.find((p) => p.seat === 0)
  const seat1 = snap.players.find((p) => p.seat === 1)

  const onSend = async () => {
    const msg = text.trim()
    if (!msg) return
    setText('')
    await sendSpectatorMessage(code, username || 'Spectateur', msg).catch(() => {})
  }

  const cheer = (targetSeat: number) => {
    const emoji = CHEER_EMOJIS[Math.floor(Math.random() * CHEER_EMOJIS.length)]
    sendCheer(emoji, targetSeat)
  }

  const cheerTranslate = cheerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -120] })

  return (
    <LinearGradient colors={[C.gradTop, C.gradBot]} style={s.root}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn} activeOpacity={0.7}>
            <Text style={s.backTxt}>← Menu</Text>
          </TouchableOpacity>
          <Text style={s.spectatorCount}>👁️ {snap.spectatorCount} {snap.spectatorCount > 1 ? 'spectateurs' : 'spectateur'}</Text>
          <View style={{ width: 60 }} />
        </View>

        {snap.status === 'connecting' && (
          <View style={s.center}><ActivityIndicator color={C.brass} size="large" /></View>
        )}

        {snap.status === 'error' && (
          <View style={s.center}>
            <Text style={s.infoTxt}>{snap.error ?? 'Partie introuvable.'}</Text>
            <TouchableOpacity style={s.backFromInfo} onPress={onBack}><Text style={s.backTxt}>← Menu</Text></TouchableOpacity>
          </View>
        )}

        {(snap.status === 'watching' || snap.status === 'ended') && (
          <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {/* ── Plateau (lecture seule) ────────────────────────────── */}
            <View style={s.board}>
              <PlayerStrip player={seat1} active={snap.currentSeat === 1 && snap.status === 'watching'} seatLabel="Joueur 2" />

              <View style={s.tableZone}>
                {snap.table.length === 0 ? (
                  <Text style={s.tableEmpty}>Table vide</Text>
                ) : (
                  <View style={s.tableCards}>
                    {snap.table.map((c, i) => (
                      <View key={`${c.suit}_${c.value}_${i}`} style={s.tableCard}>
                        <CardFace card={{ suit: c.suit, value: c.value } as Card} size="md" />
                      </View>
                    ))}
                  </View>
                )}
                {snap.status === 'ended' && <Text style={s.endedTxt}>Partie terminée</Text>}
              </View>

              <PlayerStrip player={seat0} active={snap.currentSeat === 0 && snap.status === 'watching'} seatLabel="Joueur 1" />

              {/* Emoji de soutien flottant */}
              {cheerShown && (
                <Animated.Text
                  pointerEvents="none"
                  style={[
                    s.cheerFloat,
                    cheerShown.targetSeat === 1 ? { top: 24 } : { bottom: 96 },
                    { opacity: cheerAnim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }), transform: [{ translateY: cheerTranslate }] },
                  ]}
                >
                  {cheerShown.emoji}
                </Animated.Text>
              )}
            </View>

            {/* ── Soutien ────────────────────────────────────────────── */}
            <View style={s.supportRow}>
              <TouchableOpacity style={s.supportBtn} onPress={() => cheer(0)} activeOpacity={0.85}>
                <Text style={s.supportTxt}>👏 {seat0?.pseudo ?? 'J1'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.supportBtn} onPress={() => cheer(1)} activeOpacity={0.85}>
                <Text style={s.supportTxt}>👏 {seat1?.pseudo ?? 'J2'}</Text>
              </TouchableOpacity>
            </View>

            {/* ── Chat spectateurs ───────────────────────────────────── */}
            <ScrollView ref={chatRef} style={s.chat} contentContainerStyle={s.chatContent} showsVerticalScrollIndicator={false}>
              {chat.length === 0 ? (
                <Text style={s.chatEmpty}>Encourage les joueurs dans le chat 💬</Text>
              ) : chat.map((m) => (
                <Text key={m.id} style={s.chatLine}>
                  <Text style={s.chatName}>{m.fromName} : </Text>{m.text}
                </Text>
              ))}
            </ScrollView>

            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                value={text}
                onChangeText={setText}
                placeholder="Message…"
                placeholderTextColor={C.boneOff}
                maxLength={200}
                onSubmitEditing={() => { void onSend() }}
              />
              <TouchableOpacity style={s.sendBtn} onPress={() => { void onSend() }} disabled={!text.trim()}>
                <Text style={s.sendTxt}>Envoyer</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </LinearGradient>
  )
}

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6,
  },
  backBtn: { paddingVertical: 6, minWidth: 60 },
  backTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  spectatorCount: { fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 14 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  infoTxt: { fontFamily: 'Cairo_400Regular', color: C.bone, fontSize: 15, textAlign: 'center', paddingHorizontal: 24 },
  backFromInfo: { paddingVertical: 8 },

  board: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  playerStrip: {
    alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: 'transparent',
  },
  playerStripActive: { borderColor: C.brass, backgroundColor: 'rgba(201,162,39,0.10)' },
  playerName: { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 13, letterSpacing: 0.3 },

  tableZone: { alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 120, paddingVertical: 8 },
  tableCards: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  tableCard: {},
  tableEmpty: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  endedTxt: { fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 16, marginTop: 8 },

  cheerFloat: { position: 'absolute', alignSelf: 'center', fontSize: 46 },

  supportRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  supportBtn: {
    flex: 1, backgroundColor: 'rgba(201,162,39,0.14)', borderRadius: 12, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.30)',
  },
  supportTxt: { fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 13 },

  chat: { flex: 1, marginHorizontal: 16, borderTopWidth: 1, borderTopColor: C.ghost },
  chatContent: { paddingVertical: 8, gap: 4 },
  chatEmpty: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 12, textAlign: 'center', marginTop: 12 },
  chatLine: { fontFamily: 'Cairo_400Regular', color: C.bone, fontSize: 13, lineHeight: 19 },
  chatName: { fontFamily: 'Cairo_600SemiBold', color: C.brass },

  inputRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  input: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.bone, borderWidth: 1, borderColor: C.ghost,
  },
  sendBtn: { backgroundColor: C.brass, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 11 },
  sendTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.ink },
})

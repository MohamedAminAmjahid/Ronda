import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { useAuth } from '../firebase/auth'
import { useProfile } from '../profile/useProfile'
import { sendGlobalMessage, subscribeGlobalChat, type GlobalMessageDoc } from '../firebase/firestore'
import { markGlobalChatSeen } from '../online/globalChatCache'
import { countryFlag } from '../data/countries'
import { useI18n } from '../i18n/useI18n'
import { AvatarDisplay } from './ProfileScreen'

const C = {
  bg:      '#0D0D1A',
  border:  'rgba(201,162,39,0.18)',
  brass:   '#C9A227',
  brassBg: 'rgba(201,162,39,0.14)',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.45)',
  ink:     '#1C2622',
  red:     '#E53935',
} as const

/** Anti-spam client uniquement — la seule barrière faisant réellement autorité
 * est la règle Firestore (uid == auth.uid, texte ≤ 200), voir firestore.ts.
 * Un client modifié pourrait contourner ce délai. */
const SEND_COOLDOWN_MS = 10_000

type CountryTab = 'all' | 'MA' | 'FR'

/** Heure compacte (HH:MM) — un message mondial défile trop vite pour un
 * format relatif ("il y a 2 min") comme dans MessagesScreen.tsx. */
function shortHour(d: Date | null): string {
  if (!d) return ''
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

interface Props {
  /** true quand ce slide est celui affiché à l'écran — sert à marquer les
   * messages comme vus (badge BottomNav) uniquement pendant que l'utilisateur
   * regarde effectivement le chat mondial. */
  active: boolean
}

export function GlobalChatSlide({ active }: Props) {
  const { user } = useAuth()
  const { username, avatarType, avatarEmoji, avatarImage, country: myCountry } = useProfile()
  const { t } = useI18n()
  const scrollRef = useRef<ScrollView>(null)

  const [messages, setMessages] = useState<GlobalMessageDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [countryTab, setCountryTab] = useState<CountryTab>('all')
  const [cooldownLeft, setCooldownLeft] = useState(0)

  const lastSentAtRef = useRef(0)

  useEffect(() => {
    const unsub = subscribeGlobalChat((msgs) => {
      setMessages(msgs)
      setLoading(false)
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80)
    })
    return unsub
  }, [])

  // Marque comme vu uniquement pendant que ce slide est actif — sinon le
  // badge BottomNav se viderait rien qu'en ouvrant l'écran Messages (même sur
  // le slide Amis), avant même d'avoir regardé le chat mondial.
  useEffect(() => {
    if (!active || messages.length === 0) return
    const last = messages[messages.length - 1]
    if (last.createdAt) markGlobalChatSeen(last.createdAt.getTime())
  }, [active, messages])

  // Décompte du cooldown anti-spam, affiché sur le bouton d'envoi.
  useEffect(() => {
    const id = setInterval(() => {
      const remaining = SEND_COOLDOWN_MS - (Date.now() - lastSentAtRef.current)
      setCooldownLeft(Math.max(0, Math.ceil(remaining / 1000)))
    }, 250)
    return () => clearInterval(id)
  }, [])

  const filtered = countryTab === 'all' ? messages : messages.filter((m) => m.country === countryTab)

  const onSend = async () => {
    if (!user || !text.trim() || sending) return
    if (Date.now() - lastSentAtRef.current < SEND_COOLDOWN_MS) return
    const msg = text.trim()
    setText('')
    setError(null)
    setSending(true)
    lastSentAtRef.current = Date.now()
    try {
      await sendGlobalMessage(user.uid, username, avatarType, avatarEmoji, avatarImage, msg, myCountry)
    } catch {
      setError(t('globalChatErrorSend'))
      setText(msg)
      lastSentAtRef.current = 0 // échec réel → ne pénalise pas le cooldown
    } finally {
      setSending(false)
    }
  }

  const onCooldown = cooldownLeft > 0
  const canSend = !!text.trim() && !sending && !onCooldown

  return (
    <View style={s.root}>
      {/* Filtre par pays */}
      <View style={s.filterRow}>
        {(
          [
            { key: 'all', label: `🌍 ${t('geoGlobal')}` },
            { key: 'MA', label: '🇲🇦 Maroc' },
            { key: 'FR', label: '🇫🇷 France' },
          ] as { key: CountryTab; label: string }[]
        ).map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[s.filterTab, countryTab === f.key && s.filterTabActive]}
            onPress={() => setCountryTab(f.key)}
          >
            <Text style={[s.filterTabTxt, countryTab === f.key && s.filterTabTxtActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          ref={scrollRef}
          style={s.flex}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {loading && <ActivityIndicator color={C.brass} style={{ marginTop: 48 }} />}

          {!loading && filtered.length === 0 && (
            <Text style={s.emptyTxt}>{t('globalChatEmpty')}</Text>
          )}

          {filtered.map((msg) => {
            const mine = msg.uid === user?.uid
            return (
              <View key={msg.id} style={[s.row, mine && s.rowMine]}>
                <AvatarDisplay
                  type={(msg.avatarType || 'initial') as 'initial' | 'emoji' | 'image'}
                  initial={msg.username[0]?.toUpperCase() ?? '?'}
                  emoji={msg.avatarEmoji}
                  image={msg.avatarImage}
                  size={34}
                />
                <View style={s.rowBody}>
                  <View style={s.rowTop}>
                    <Text style={[s.rowName, mine && s.rowNameMine]} numberOfLines={1}>
                      {msg.country ? `${countryFlag(msg.country)} ` : ''}{msg.username}
                    </Text>
                    <Text style={s.rowTime}>{shortHour(msg.createdAt)}</Text>
                  </View>
                  <Text style={s.rowTxt}>{msg.text}</Text>
                </View>
              </View>
            )
          })}
        </ScrollView>

        {error && <Text style={s.errorTxt}>{error}</Text>}

        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder={t('globalChatPlaceholder')}
            placeholderTextColor={C.boneOff}
            multiline
            maxLength={200}
          />
          <TouchableOpacity style={[s.sendBtn, !canSend && s.sendBtnOff]} onPress={() => { void onSend() }} disabled={!canSend}>
            <Text style={s.sendTxt}>{onCooldown ? `${cooldownLeft}s` : t('chatSend')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },

  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  filterTab: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.2)', borderWidth: 1, borderColor: 'rgba(244,236,216,0.12)',
  },
  filterTabActive: { backgroundColor: C.brass, borderColor: C.brass },
  filterTabTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 12, color: C.boneOff },
  filterTabTxtActive: { color: C.ink },

  list: { padding: 14, gap: 10, flexGrow: 1 },
  emptyTxt: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff, textAlign: 'center', marginTop: 48 },

  row: {
    flexDirection: 'row', gap: 10, borderRadius: 12, padding: 8,
  },
  rowMine: { backgroundColor: C.brassBg, borderWidth: 1, borderColor: 'rgba(201,162,39,0.35)' },
  rowBody: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowName: { flex: 1, fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.brass },
  rowNameMine: { color: C.brass },
  rowTime: { fontFamily: 'Cairo_400Regular', fontSize: 10, color: C.boneOff },
  rowTxt: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.bone, lineHeight: 19 },

  errorTxt: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.red, textAlign: 'center', paddingBottom: 4 },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg,
  },
  input: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontFamily: 'Cairo_400Regular', fontSize: 15, color: C.bone,
    borderWidth: 1, borderColor: C.border, maxHeight: 100,
  },
  sendBtn: { backgroundColor: C.brass, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 11 },
  sendBtnOff: { opacity: 0.35 },
  sendTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.ink },
})

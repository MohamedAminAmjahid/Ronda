import { useState, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, Share, ActivityIndicator, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { useI18n } from '../i18n/useI18n'
import { useProfile } from '../profile/useProfile'
import { useLobbyDiJouj } from '../online/useLobbyDiJouj'

// ── Palette (bordeaux Di Jouj) ─────────────────────────────────────────────────

const C = {
  gradTop:  '#1A0008' as const,
  gradBot:  '#2D0A1E' as const,
  surface:  '#3D1030',
  acc:      '#8B1A4A',
  brass:    '#C9A227',
  bone:     '#F4ECD8',
  boneOff:  'rgba(244,236,216,0.50)',
  ghost:    'rgba(244,236,216,0.12)',
  red:      '#C0392B',
  green:    '#27AE60',
} as const

// ── Screen ────────────────────────────────────────────────────────────────────

export function DiJoujLobbyScreen() {
  const { t }        = useI18n()
  const { username } = useProfile()
  const {
    phase, code, playerCount, slots, isAdmin, error,
    connect, joinByCode: joinLobbyByCode, setPlayerCount, startGame, leave,
  } = useLobbyDiJouj()

  const [joinCode, setJoinCode] = useState('')

  // ── Handlers ─────────────────────────────────────────────────────────────

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

  const handleLeave = useCallback(() => {
    leave()
    router.back()
  }, [leave])

  // ── IDLE ──────────────────────────────────────────────────────────────────

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

            <TouchableOpacity
              style={[s.mainBtn, { backgroundColor: C.acc }]}
              onPress={handleCreate}
              activeOpacity={0.8}
            >
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

  // ── CONNECTING ────────────────────────────────────────────────────────────

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

  // ── WAITING (lobby actif) ─────────────────────────────────────────────────

  const humanSlots = slots.filter(s => !s.isBot)
  const pc = playerCount

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

        <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

          {/* ── Code de la partie ────────────────────────────────────────────── */}
          {code && (
            <View style={s.codeBox}>
              <Text style={s.codeLabel}>{t('copy')}</Text>
              <Text style={s.codeValue}>{code}</Text>
              <TouchableOpacity onPress={handleShare} activeOpacity={0.7} style={s.shareBtn}>
                <Text style={s.shareTxt}>{t('share')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Sélecteur nombre de joueurs (admin seulement) ────────────────── */}
          {isAdmin && (
            <View style={s.countSection}>
              <Text style={s.countLabel}>{t('djPlayers')}</Text>
              <View style={s.countBtns}>
                {([2, 4] as const).map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[s.countBtn, pc === n && s.countBtnActive]}
                    onPress={() => setPlayerCount(n)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.countBtnTxt, pc === n && s.countBtnTxtActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.botsInfo}>{t('djBotsInfo')}</Text>
            </View>
          )}

          {/* ── Slots joueurs ─────────────────────────────────────────────────── */}
          <View style={s.slotsList}>
            {Array.from({ length: pc }).map((_, i) => {
              const slot = humanSlots[i]
              return (
                <View key={i} style={s.slotRow}>
                  <View style={[s.slotDot, slot ? s.slotDotFilled : s.slotDotEmpty]} />
                  <Text style={s.slotName}>
                    {slot ? slot.pseudo : '...'}
                  </Text>
                  {slot?.isAdmin && (
                    <View style={s.adminBadge}>
                      <Text style={s.adminBadgeTxt}>{t('djAdmin')}</Text>
                    </View>
                  )}
                  {slot && !slot.connected && (
                    <View style={[s.adminBadge, { backgroundColor: C.red }]}>
                      <Text style={s.adminBadgeTxt}>⚠</Text>
                    </View>
                  )}
                </View>
              )
            })}
            {/* Bots que l'on va ajouter au démarrage */}
            {Array.from({ length: Math.max(0, pc - humanSlots.length) }).map((_, i) => (
              <View key={`bot-${i}`} style={[s.slotRow, { opacity: 0.5 }]}>
                <View style={[s.slotDot, s.slotDotBot]} />
                <Text style={s.slotName}>Bot</Text>
              </View>
            ))}
          </View>

          {/* ── Bouton Lancer (admin seulement) ─────────────────────────────── */}
          {isAdmin && (
            <TouchableOpacity
              style={[
                s.launchBtn,
                humanSlots.length < 2 && s.launchBtnDim,
              ]}
              onPress={startGame}
              activeOpacity={0.8}
              disabled={humanSlots.length < 2}
            >
              <Text style={s.launchBtnTxt}>{t('djLaunch')}</Text>
            </TouchableOpacity>
          )}

          {!isAdmin && (
            <View style={s.waitingRow}>
              <ActivityIndicator color={C.brass} size="small" />
              <Text style={s.waitingTxt}>{t('waitingOpponent')}</Text>
            </View>
          )}

        </ScrollView>
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
    fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 20,
    textAlign: 'center', marginBottom: 24,
  },
  errorTxt: {
    fontFamily: 'Cairo_400Regular', color: C.red, fontSize: 14,
    textAlign: 'center', marginBottom: 16,
  },

  mainBtn: {
    width: '100%', paddingVertical: 16, paddingHorizontal: 24,
    borderRadius: 14, alignItems: 'center',
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
  joinBtn: {
    paddingVertical: 14, paddingHorizontal: 16, backgroundColor: C.acc, borderRadius: 10,
  },
  joinBtnDim: { opacity: 0.45 },
  joinBtnTxt: { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 13 },

  // Lobby actif
  scrollContent: { padding: 20, gap: 20 },

  codeBox: {
    backgroundColor: C.surface, borderRadius: 14, paddingVertical: 18, paddingHorizontal: 24,
    alignItems: 'center', gap: 8,
  },
  codeLabel: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 12 },
  codeValue: { fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 30, letterSpacing: 6 },
  shareBtn:  { paddingVertical: 6, paddingHorizontal: 18, backgroundColor: C.acc, borderRadius: 8 },
  shareTxt:  { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 13 },

  countSection: { alignItems: 'center', gap: 10 },
  countLabel:   { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  countBtns:    { flexDirection: 'row', gap: 12 },
  countBtn: {
    width: 64, height: 48, backgroundColor: C.surface, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.ghost,
  },
  countBtnActive: { borderColor: C.brass, backgroundColor: '#5A1A3A' },
  countBtnTxt:    { fontFamily: 'Cairo_600SemiBold', color: C.boneOff, fontSize: 18 },
  countBtnTxtActive: { color: C.brass },
  botsInfo: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 11, textAlign: 'center' },

  slotsList: { gap: 12 },
  slotRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  slotDot: { width: 10, height: 10, borderRadius: 5 },
  slotDotFilled: { backgroundColor: C.green },
  slotDotEmpty:  { backgroundColor: C.ghost },
  slotDotBot:    { backgroundColor: C.boneOff },
  slotName: { flex: 1, fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 14 },
  adminBadge: {
    paddingVertical: 2, paddingHorizontal: 8, backgroundColor: C.brass, borderRadius: 6,
  },
  adminBadgeTxt: { fontFamily: 'Cairo_400Regular', color: '#1A0008', fontSize: 11 },

  launchBtn: {
    marginTop: 8, backgroundColor: C.acc, borderRadius: 14,
    paddingVertical: 18, alignItems: 'center',
  },
  launchBtnDim: { opacity: 0.45 },
  launchBtnTxt: { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 17, letterSpacing: 0.5 },

  waitingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  waitingTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
})

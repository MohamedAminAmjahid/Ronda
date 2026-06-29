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

const MAX_PLAYERS = 4

const C = {
  gradTop: '#1A0008' as const,
  gradBot: '#2D0A1E' as const,
  surface: '#3D1030',
  acc:     '#8B1A4A',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.50)',
  ghost:   'rgba(244,236,216,0.12)',
  red:     '#C0392B',
  green:   '#27AE60',
} as const

export function DiJoujLobbyScreen() {
  const { t }        = useI18n()
  const { username } = useProfile()
  const {
    phase, code, slots, isAdmin, adminPseudo, error,
    connect, joinByCode: joinLobbyByCode, startGame, leave,
  } = useLobbyDiJouj()

  const [joinCode, setJoinCode] = useState('')

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

  // ── Idle / Error ──────────────────────────────────────────────────────────

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

            <TouchableOpacity style={s.mainBtn} onPress={handleCreate} activeOpacity={0.8}>
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

  // ── Connecting ────────────────────────────────────────────────────────────

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

  // ── Waiting (lobby actif) ─────────────────────────────────────────────────

  const humanSlots   = slots.filter(s => !s.isBot && s.connected)
  const connectedCnt = humanSlots.length
  const canLaunch    = connectedCnt >= 2
  const isFull       = connectedCnt >= MAX_PLAYERS

  let statusMsg: string
  if (isFull)        statusMsg = `${MAX_PLAYERS} joueurs max atteint`
  else if (canLaunch) statusMsg = `${connectedCnt} joueurs connectés — tu peux lancer !`
  else               statusMsg = 'En attente d\'au moins 2 joueurs...'

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

        <ScrollView
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Code de la room ──────────────────────────────────────────── */}
          <View style={s.codeBox}>
            <Text style={s.codeLabel}>Code de la partie</Text>
            <Text style={s.codeValue}>{code ?? '------'}</Text>
            <TouchableOpacity onPress={handleShare} activeOpacity={0.7} style={s.shareBtn}>
              <Text style={s.shareTxt}>⬆ {t('share')}</Text>
            </TouchableOpacity>
          </View>

          {/* ── Liste des joueurs (max 4 slots) ──────────────────────────── */}
          <View style={s.slotsList}>
            {Array.from({ length: MAX_PLAYERS }).map((_, i) => {
              const slot = humanSlots[i]
              if (slot) {
                return (
                  <View key={slot.sessionId} style={s.slotRow}>
                    <Text style={[s.slotIcon, { color: C.green }]}>✓</Text>
                    <Text style={s.slotName}>{slot.pseudo}</Text>
                    {slot.isAdmin && (
                      <View style={s.adminBadge}>
                        <Text style={s.adminBadgeTxt}>{t('djAdmin')}</Text>
                      </View>
                    )}
                  </View>
                )
              }
              return (
                <View key={`empty-${i}`} style={[s.slotRow, s.slotRowEmpty]}>
                  <Text style={[s.slotIcon, { color: C.boneOff }]}>⏳</Text>
                  <Text style={s.slotNameEmpty}>En attente d'un joueur...</Text>
                </View>
              )
            })}
          </View>

          {/* ── Message de statut ─────────────────────────────────────────── */}
          <View style={[s.statusBox, canLaunch && s.statusBoxActive]}>
            <Text style={[s.statusTxt, canLaunch && s.statusTxtActive]}>{statusMsg}</Text>
          </View>

          {/* ── Bouton lancer (admin) / message attente (non-admin) ──────── */}
          {isAdmin ? (
            <TouchableOpacity
              style={[s.launchBtn, !canLaunch && s.launchBtnDim]}
              onPress={startGame}
              activeOpacity={0.8}
              disabled={!canLaunch}
            >
              <Text style={s.launchBtnTxt}>{t('djLaunch')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.waitingRow}>
              <ActivityIndicator color={C.brass} size="small" />
              <Text style={s.waitingTxt}>
                En attente que {adminPseudo || 'l\'hôte'} lance la partie...
              </Text>
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
    fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 20, textAlign: 'center', marginBottom: 24,
  },
  errorTxt: {
    fontFamily: 'Cairo_400Regular', color: C.red, fontSize: 14, textAlign: 'center', marginBottom: 16,
  },

  mainBtn: {
    width: '100%', paddingVertical: 16, paddingHorizontal: 24,
    borderRadius: 14, alignItems: 'center', backgroundColor: C.acc,
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
  joinBtn:    { paddingVertical: 14, paddingHorizontal: 16, backgroundColor: C.acc, borderRadius: 10 },
  joinBtnDim: { opacity: 0.45 },
  joinBtnTxt: { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 13 },

  // ── Lobby actif ──────────────────────────────────────────────────────────
  scrollContent: { padding: 20, gap: 20 },

  codeBox: {
    backgroundColor: C.surface, borderRadius: 16, paddingVertical: 24, paddingHorizontal: 24,
    alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)',
  },
  codeLabel: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 12, letterSpacing: 0.5 },
  codeValue: {
    fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 36, letterSpacing: 10,
    textShadowColor: 'rgba(201,162,39,0.4)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
  },
  shareBtn: { paddingVertical: 8, paddingHorizontal: 22, backgroundColor: C.acc, borderRadius: 10 },
  shareTxt: { fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 13 },

  slotsList: { gap: 10 },
  slotRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16,
    borderWidth: 1, borderColor: C.ghost,
  },
  slotRowEmpty: { opacity: 0.55 },
  slotIcon:     { fontSize: 16, width: 20, textAlign: 'center' },
  slotName: {
    flex: 1, fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 15,
  },
  slotNameEmpty: {
    flex: 1, fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 14, fontStyle: 'italic',
  },
  adminBadge: {
    paddingVertical: 2, paddingHorizontal: 8, backgroundColor: C.brass, borderRadius: 6,
  },
  adminBadgeTxt: { fontFamily: 'Cairo_400Regular', color: '#1A0008', fontSize: 11 },

  statusBox: {
    backgroundColor: C.ghost, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16,
    alignItems: 'center', borderWidth: 1, borderColor: 'transparent',
  },
  statusBoxActive: { backgroundColor: 'rgba(39,174,96,0.12)', borderColor: 'rgba(39,174,96,0.3)' },
  statusTxt:       { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13, textAlign: 'center' },
  statusTxtActive: { color: '#27AE60', fontFamily: 'Cairo_600SemiBold' },

  launchBtn: {
    backgroundColor: C.brass, borderRadius: 14,
    paddingVertical: 18, alignItems: 'center',
    shadowColor: C.brass, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
  launchBtnDim: { opacity: 0.38, shadowOpacity: 0 },
  launchBtnTxt: { fontFamily: 'Cairo_600SemiBold', color: '#1A0008', fontSize: 17, letterSpacing: 0.5 },

  waitingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 12,
  },
  waitingTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13, flexShrink: 1 },
})

import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Linking, Modal, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, type Href } from 'expo-router'
import { useProfile } from '../profile/useProfile'
import { useI18n } from '../i18n/useI18n'
import { loadActiveRoom, clearActiveRoom, type ActiveRoom } from '../profile/profile'
import { reconnect as reconnect1v1 } from '../online/store'
import { reconnectLobby } from '../online/lobby2v2'

const RONDA_ROUTE: Href = '/ronda' as Href
const DIJOUJ_ROUTE: Href = '/dijouj' as Href
const LINKEDIN_URL = 'https://www.linkedin.com/in/amjahid-mohamed-amin'

// ── Tokens ────────────────────────────────────────────────────────────────────

const C = {
  bg:          '#0D0D1A',
  night:       '#1A0D2E',
  brass:       '#C9A227',
  brassBorder: 'rgba(201,162,39,0.30)',
  bone:        '#F4ECD8',
  boneOff:     'rgba(244,236,216,0.45)',
  boneGhost:   'rgba(244,236,216,0.12)',
  ink:         '#1C2622',
  ronda:       '#0E5C4A',
  dijouj:      '#2D0A1E',
  dijoujAcc:   '#8B1A4A',
} as const

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onLeaderboard: () => void
  onRules:       () => void
  onCredits:     () => void
}

// ── Écran ─────────────────────────────────────────────────────────────────────

export function MenuScreen({ onLeaderboard, onRules, onCredits }: Props) {
  const { username } = useProfile()
  const { t, lang, setLang } = useI18n()

  // ── Reconnexion à une partie en cours ──────────────────────────────────────
  const [resumeRoom, setResumeRoom] = useState<ActiveRoom | null>(null)
  const [resuming, setResuming] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)

  useEffect(() => {
    void loadActiveRoom().then((r) => { if (r) setResumeRoom(r) })
  }, [])

  const onResume = async () => {
    if (!resumeRoom || resuming) return
    setResuming(true)
    setResumeError(null)
    try {
      if (resumeRoom.roomType === 'ronda2v2') {
        await reconnectLobby(resumeRoom.reconnectionToken)
        setResumeRoom(null)
        router.push('/lobby2v2?reconnect=1' as Href)
      } else {
        await reconnect1v1(resumeRoom.reconnectionToken)
        setResumeRoom(null)
        router.push('/online' as Href)
      }
    } catch {
      clearActiveRoom()
      setResumeError(t('reconnectFailed'))
    } finally {
      setResuming(false)
    }
  }

  const onForfeit = () => {
    clearActiveRoom()
    setResumeRoom(null)
    setResumeError(null)
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>

        {/* ── Modale de reconnexion ────────────────────────────── */}
        <Modal visible={resumeRoom !== null} transparent animationType="fade" onRequestClose={onForfeit}>
          <View style={s.modalBackdrop}>
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>{t('activeGame')}</Text>
              {resumeError ? (
                <>
                  <Text style={s.resumeText}>{resumeError}</Text>
                  <View style={s.modalActions}>
                    <TouchableOpacity style={s.modalSave} onPress={onForfeit}>
                      <Text style={s.modalSaveTxt}>OK</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={s.resumeText}>
                    {t('resumeGameMsg').replace('{code}', resumeRoom?.code ? ` (code : ${resumeRoom.code})` : '')}
                  </Text>
                  <View style={s.modalActions}>
                    <TouchableOpacity style={s.modalCancel} onPress={onForfeit} disabled={resuming}>
                      <Text style={s.modalCancelTxt}>{t('abandon')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.modalSave, resuming && s.btnDisabledOpacity]}
                      onPress={onResume}
                      disabled={resuming}
                    >
                      <Text style={s.modalSaveTxt}>{resuming ? t('connecting') : t('resume')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>

        {/* ── Contenu scrollable ────────────────────────────────── */}
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

          {/* ── Titre plateforme ──────────────────────────────────── */}
          <View style={s.hero}>
            <View style={s.titleRow}>
              <Text style={s.platformTitle}>Dar Lwar9a</Text>
              <Text style={s.platformTM}>TM</Text>
            </View>
            <Text style={s.platformAr}>دار الورقة</Text>
            <Text style={s.helloTxt}>Salut {username || '…'} 👋</Text>
          </View>

          {/* ── Section Jeux ─────────────────────────────────────── */}
          <Text style={s.sectionLabel}>{t('platformGames')}</Text>

          {/* ── Carte Ronda ──────────────────────────────────────── */}
          <TouchableOpacity
            style={[s.gameCard, s.rondaCard]}
            onPress={() => router.push(RONDA_ROUTE)}
            activeOpacity={0.88}
          >
            <View style={s.cardTop}>
              <View>
                <Text style={s.cardTitle}>RONDA</Text>
                <Text style={s.cardTitleAr}>رُنْدة</Text>
              </View>
              <View style={s.cardBadge}>
                <Text style={s.cardBadgeTxt}>1v1 · 2v2</Text>
              </View>
            </View>
            <Text style={s.cardDesc}>{t('rondaCardDesc')}</Text>
            <View style={[s.cardBtn, s.rondaBtn]}>
              <Text style={s.cardBtnTxt}>{t('play')}</Text>
            </View>
          </TouchableOpacity>

          {/* ── Carte Di Jouj ────────────────────────────────────── */}
          <TouchableOpacity
            style={[s.gameCard, s.dijoujCard]}
            onPress={() => router.push(DIJOUJ_ROUTE)}
            activeOpacity={0.88}
          >
            <View style={s.cardTop}>
              <View>
                <Text style={s.cardTitle}>DI JOUJ</Text>
                <Text style={s.cardTitleAr}>ديجوج</Text>
              </View>
              <View style={[s.cardBadge, s.dijoujBadge]}>
                <Text style={s.cardBadgeTxt}>{t('comingSoon')}</Text>
              </View>
            </View>
            <Text style={s.cardDesc}>{t('dijoujCardDesc')}</Text>
            <View style={[s.cardBtn, s.dijoujBtn]}>
              <Text style={[s.cardBtnTxt, s.dijoujBtnTxt]}>{t('play')}</Text>
            </View>
          </TouchableOpacity>

          {/* ── Liens texte ──────────────────────────────────────── */}
          <View style={s.textLinks}>
            <TouchableOpacity style={s.linkBtn} onPress={onLeaderboard}>
              <Text style={s.linkTxt}>{t('leaderboard')}</Text>
            </TouchableOpacity>
            <Text style={s.linkSep}>·</Text>
            <TouchableOpacity style={s.linkBtn} onPress={onRules}>
              <Text style={s.linkTxt}>{t('rules')}</Text>
            </TouchableOpacity>
            <Text style={s.linkSep}>·</Text>
            <TouchableOpacity style={s.linkBtn} onPress={onCredits}>
              <Text style={s.linkTxt}>{t('credits')}</Text>
            </TouchableOpacity>
          </View>

          {/* ── Sélecteur de langue ──────────────────────────────── */}
          <View style={s.langRow}>
            {(['ar', 'fr', 'en'] as const).map((lg) => (
              <TouchableOpacity
                key={lg}
                style={[s.langBtn, lang === lg && s.langBtnActive]}
                onPress={() => setLang(lg)}
                accessibilityLabel={lg}
              >
                <Text style={[s.langLabel, lang === lg && s.langLabelActive]}>
                  {lg.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Pied ─────────────────────────────────────────────── */}
          <View style={s.footer}>
            <Text style={s.footerTxt}>v1.0</Text>
            <TouchableOpacity onPress={() => Linking.openURL(LINKEDIN_URL)}>
              <Text style={s.author}>Made by Amjahid Mohamed Amin</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </View>
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 430, paddingHorizontal: 24 },

  // Scrollable
  scroll: { flex: 1 },
  scrollContent: { gap: 14, paddingBottom: 28, paddingTop: 8 },

  // Hero
  hero: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  platformTitle: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 32,
    color: C.bone,
    letterSpacing: 1.5,
  },
  platformTM: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 13,
    color: C.boneOff,
    letterSpacing: 2,
    marginBottom: 6,
  },
  platformAr: {
    fontFamily: 'ReemKufi_700Bold',
    fontSize: 22,
    color: C.brass,
    letterSpacing: 1,
  },
  helloTxt: {
    fontFamily: 'Cairo_400Regular', fontSize: 14, color: 'rgba(244,236,216,0.50)', marginTop: 4,
  },

  // Section label
  sectionLabel: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 10,
    color: 'rgba(244,236,216,0.22)',
    letterSpacing: 3,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: -2,
  },

  // Game cards
  gameCard: {
    borderRadius: 16,
    padding: 18,
    gap: 10,
    borderWidth: 1,
  },
  rondaCard: {
    backgroundColor: C.ronda,
    borderColor: 'rgba(201,162,39,0.30)',
  },
  dijoujCard: {
    backgroundColor: C.dijouj,
    borderColor: 'rgba(139,26,74,0.40)',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 22,
    color: C.bone,
    letterSpacing: 3,
  },
  cardTitleAr: {
    fontFamily: 'ReemKufi_700Bold',
    fontSize: 16,
    color: C.brass,
    marginTop: 2,
  },
  cardBadge: {
    backgroundColor: 'rgba(201,162,39,0.18)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.28)',
  },
  dijoujBadge: {
    backgroundColor: 'rgba(139,26,74,0.28)',
    borderColor: 'rgba(139,26,74,0.40)',
  },
  cardBadgeTxt: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 11, color: C.bone, letterSpacing: 0.4,
  },
  cardDesc: {
    fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff, lineHeight: 19,
  },
  cardBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 2,
  },
  rondaBtn: { backgroundColor: C.brass },
  dijoujBtn: {
    backgroundColor: 'rgba(139,26,74,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(139,26,74,0.55)',
  },
  cardBtnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.ink, letterSpacing: 0.3 },
  dijoujBtnTxt: { color: C.boneOff },

  // Text links
  textLinks: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginTop: 4,
  },
  linkSep: { color: 'rgba(244,236,216,0.18)', fontSize: 12 },
  linkBtn: { paddingVertical: 8, paddingHorizontal: 10 },
  linkTxt: {
    fontFamily: 'Cairo_400Regular', fontSize: 12, color: 'rgba(244,236,216,0.26)',
    letterSpacing: 1, textTransform: 'uppercase',
  },

  // Language selector
  langRow: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  langBtn: {
    width: 44, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(244,236,216,0.10)', backgroundColor: 'rgba(255,255,255,0.04)',
  },
  langBtnActive: { borderColor: C.brass, backgroundColor: 'rgba(201,162,39,0.15)' },
  langLabel: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: 'rgba(244,236,216,0.26)', letterSpacing: 0.5,
  },
  langLabelActive: { color: C.brass },

  // Footer
  footer: { alignItems: 'center', paddingTop: 4, gap: 4 },
  footerTxt: {
    fontSize: 10, color: 'rgba(244,236,216,0.14)', letterSpacing: 1, textTransform: 'uppercase',
  },
  author: {
    fontFamily: 'Cairo_400Regular', fontSize: 11,
    color: 'rgba(244,236,216,0.28)', letterSpacing: 0.3, textDecorationLine: 'underline',
  },

  // Modal reconnexion
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(13,13,26,0.90)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28,
  },
  modalCard: {
    width: '100%', maxWidth: 360, backgroundColor: C.night, borderRadius: 16, padding: 22, gap: 10,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)',
  },
  modalTitle: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.boneOff, letterSpacing: 1.5, textTransform: 'uppercase',
  },
  resumeText: { fontFamily: 'Cairo_400Regular', fontSize: 15, color: C.bone, lineHeight: 22 },
  modalActions: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 6,
  },
  modalCancel: { paddingVertical: 12, paddingHorizontal: 16 },
  modalCancelTxt: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff },
  modalSave: { backgroundColor: C.brass, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 22 },
  modalSaveTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.ink },
  btnDisabledOpacity: { opacity: 0.4 },
})

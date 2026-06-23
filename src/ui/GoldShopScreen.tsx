import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Share, Linking, AppState, Modal, type AppStateStatus,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useProfile } from '../profile/useProfile'
import AsyncStorage from '@react-native-async-storage/async-storage'

// ── Tokens (cohérents avec le reste de l'app) ──────────────────────────────────

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
const FB_URL = 'https://www.facebook.com/PLACEHOLDER_FB'
const IG_URL = 'https://www.instagram.com/PLACEHOLDER_IG'

const SHARE_KEY = 'ronda_share_count'
const FB_KEY = 'ronda_fb_claimed'
const IG_KEY = 'ronda_ig_claimed'

const SHARE_DAILY_LIMIT = 3
const SHARE_REWARD = 100
const FOLLOW_REWARD = 300

/** Date du jour au format YYYY-MM-DD (suffisant pour le quota quotidien). */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

const PACKS: { gold: number; price: string }[] = [
  { gold: 500, price: '1,19 €' },
  { gold: 1000, price: '2,29 €' },
  { gold: 2500, price: '4,99 €' },
  { gold: 5000, price: '8,99 €' },
]

interface Props {
  onBack: () => void
}

export function GoldShopScreen({ onBack }: Props) {
  const { gold, addGold } = useProfile()

  const [shareCount, setShareCount] = useState(0)
  const [fbClaimed, setFbClaimed] = useState(false)
  const [igClaimed, setIgClaimed] = useState(false)

  // Plateforme dont on attend le retour (pour proposer la récompense au retour app).
  const [pendingClaim, setPendingClaim] = useState<null | 'fb' | 'ig'>(null)
  const [askClaim, setAskClaim] = useState<null | 'fb' | 'ig'>(null)
  const appState = useRef<AppStateStatus>(AppState.currentState)

  // Chargement initial des compteurs persistés.
  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(SHARE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as { count?: number; date?: string }
          setShareCount(parsed.date === todayStr() ? (parsed.count ?? 0) : 0)
        }
        setFbClaimed((await AsyncStorage.getItem(FB_KEY)) === 'true')
        setIgClaimed((await AsyncStorage.getItem(IG_KEY)) === 'true')
      } catch {
        // stockage indisponible — valeurs par défaut
      }
    })()
  }, [])

  // Retour dans l'app après ouverture du réseau social → propose la récompense.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appState.current
      appState.current = next
      if (pendingClaim && (prev === 'background' || prev === 'inactive') && next === 'active') {
        setAskClaim(pendingClaim)
        setPendingClaim(null)
      }
    })
    return () => sub.remove()
  }, [pendingClaim])

  // ── Actions ─────────────────────────────────────────────────────────────────

  const onShareGame = async () => {
    if (shareCount >= SHARE_DAILY_LIMIT) return
    try {
      const result = await Share.share({ message: `Joue à la Ronda ! 🎴 ${GAME_URL}` })
      if (result.action === Share.sharedAction) {
        const next = shareCount + 1
        setShareCount(next)
        addGold(SHARE_REWARD)
        await AsyncStorage.setItem(SHARE_KEY, JSON.stringify({ count: next, date: todayStr() }))
      }
    } catch {
      // partage annulé / indisponible
    }
  }

  const openFollow = (platform: 'fb' | 'ig') => {
    setPendingClaim(platform)
    void Linking.openURL(platform === 'fb' ? FB_URL : IG_URL).catch(() => setPendingClaim(null))
  }

  const confirmFollow = async () => {
    const platform = askClaim
    setAskClaim(null)
    if (!platform) return
    if (platform === 'fb' ? fbClaimed : igClaimed) return
    addGold(FOLLOW_REWARD)
    try {
      await AsyncStorage.setItem(platform === 'fb' ? FB_KEY : IG_KEY, 'true')
    } catch {
      // sans effet
    }
    if (platform === 'fb') setFbClaimed(true)
    else setIgClaimed(true)
  }

  const quotaReached = shareCount >= SHARE_DAILY_LIMIT

  // ── Rendu ─────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>
        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>← Menu</Text>
          </TouchableOpacity>
          <View style={s.headerRow}>
            <Text style={s.title}>Boutique</Text>
            <View style={s.goldPill}>
              <Text style={s.goldCoin}>🪙</Text>
              <Text style={s.goldAmount}>{gold}</Text>
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* 1. Partager le jeu */}
          <View style={s.card}>
            <View style={s.cardHead}>
              <Text style={s.cardTitle}>Partager le jeu</Text>
              <Text style={s.reward}>🪙 +{SHARE_REWARD}</Text>
            </View>
            <Text style={s.cardDesc}>Partage Ronda et gagne de l'or (max {SHARE_DAILY_LIMIT}× par jour).</Text>
            <TouchableOpacity
              style={[s.btnPrimary, quotaReached && s.btnDisabled]}
              onPress={onShareGame}
              disabled={quotaReached}
            >
              <Text style={[s.btnPrimaryTxt, quotaReached && s.btnDisabledTxt]}>
                {quotaReached ? 'Revient demain' : 'Partager le jeu'}
              </Text>
            </TouchableOpacity>
            <Text style={s.counter}>{shareCount}/{SHARE_DAILY_LIMIT} aujourd'hui</Text>
          </View>

          {/* 2. Facebook */}
          <FollowCard
            label="Suivre sur Facebook"
            reward={FOLLOW_REWARD}
            claimed={fbClaimed}
            onPress={() => openFollow('fb')}
          />

          {/* 3. Instagram */}
          <FollowCard
            label="Suivre sur Instagram"
            reward={FOLLOW_REWARD}
            claimed={igClaimed}
            onPress={() => openFollow('ig')}
          />

          {/* 4. Packs payants (affichage uniquement) */}
          <Text style={s.sectionLabel}>Packs d'or</Text>
          <View style={s.packGrid}>
            {PACKS.map((p) => (
              <View key={p.gold} style={s.pack}>
                <Text style={s.packCoin}>🪙</Text>
                <Text style={s.packGold}>{p.gold}</Text>
                <Text style={s.packPrice}>{p.price}</Text>
                <View style={s.packBtn}>
                  <Text style={s.packBtnTxt}>🔒 Bientôt</Text>
                </View>
              </View>
            ))}
          </View>

        </ScrollView>
      </View>

      {/* Confirmation de suivi (au retour dans l'app) */}
      <Modal visible={askClaim !== null} transparent animationType="fade" onRequestClose={() => setAskClaim(null)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>As-tu suivi la page ?</Text>
            <Text style={s.modalText}>Confirme pour recevoir 🪙 +{FOLLOW_REWARD}.</Text>
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setAskClaim(null)}>
                <Text style={s.modalCancelTxt}>Non</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalSave} onPress={confirmFollow}>
                <Text style={s.modalSaveTxt}>Oui</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

// ── Carte « suivre un réseau » ──────────────────────────────────────────────────

function FollowCard({
  label, reward, claimed, onPress,
}: { label: string; reward: number; claimed: boolean; onPress: () => void }) {
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>{label}</Text>
        <Text style={s.reward}>🪙 +{reward}</Text>
      </View>
      <Text style={s.cardDesc}>Une seule fois — récompense à vie.</Text>
      {claimed ? (
        <View style={[s.btnPrimary, s.btnClaimed]}>
          <Text style={s.btnClaimedTxt}>✓ Réclamé</Text>
        </View>
      ) : (
        <TouchableOpacity style={s.btnSecondary} onPress={onPress}>
          <Text style={s.btnSecondaryTxt}>{label}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.table, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 460, paddingHorizontal: 20 },

  header: { paddingTop: 16, paddingBottom: 8, gap: 8 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6 },
  backTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 26, color: C.bone,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  goldPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.25)', borderWidth: 1, borderColor: 'rgba(201,162,39,0.35)',
  },
  goldCoin: { fontSize: 14 },
  goldAmount: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.brass },

  scroll: { paddingVertical: 12, gap: 14, paddingBottom: 32 },

  card: {
    backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 14, padding: 16, gap: 10,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.18)',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 17, color: C.bone },
  reward: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.brass },
  cardDesc: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff, lineHeight: 18 },
  counter: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.boneOff, textAlign: 'center' },

  btnPrimary: { backgroundColor: C.brass, borderRadius: 11, paddingVertical: 14, alignItems: 'center' },
  btnPrimaryTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.ink, letterSpacing: 0.3 },
  btnDisabled: { backgroundColor: 'rgba(244,236,216,0.12)' },
  btnDisabledTxt: { color: 'rgba(244,236,216,0.4)' },
  btnSecondary: {
    borderRadius: 11, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1.5, borderColor: C.brass,
  },
  btnSecondaryTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.brass, letterSpacing: 0.3 },
  btnClaimed: { backgroundColor: 'rgba(201,162,39,0.18)' },
  btnClaimedTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.brass },

  sectionLabel: {
    fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.boneOff,
    letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 6, marginLeft: 2,
  },
  packGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  pack: {
    width: '47%', backgroundColor: C.deep, borderRadius: 14, paddingVertical: 18,
    paddingHorizontal: 12, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.22)',
  },
  packCoin: { fontSize: 26 },
  packGold: { fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: C.bone },
  packPrice: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.brass, marginBottom: 8 },
  packBtn: {
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 9, paddingVertical: 9,
    paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(244,236,216,0.18)',
  },
  packBtnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.boneOff },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(9,64,47,0.85)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28,
  },
  modalCard: {
    width: '100%', maxWidth: 360, backgroundColor: C.deep, borderRadius: 16,
    padding: 22, gap: 10, borderWidth: 1, borderColor: 'rgba(201,162,39,0.3)',
  },
  modalTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 18, color: C.bone },
  modalText: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 6 },
  modalCancel: { paddingVertical: 12, paddingHorizontal: 18 },
  modalCancelTxt: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff },
  modalSave: { backgroundColor: C.brass, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 26 },
  modalSaveTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.ink },
})

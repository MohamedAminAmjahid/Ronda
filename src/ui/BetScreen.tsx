import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams, type Href } from 'expo-router'
import { useProfile } from '../profile/useProfile'
import { removeGold } from '../profile/profile'
import { connectQuick } from '../online/store'
import { connectDiJoujQuick } from '../online/storeDiJouj'

const QUICK_BETS = [10, 25, 50, 100] as const

const C = {
  gradTop: '#0D0D1A' as const,
  gradBot: '#1A0D2E' as const,
  surface: '#1E1635',
  acc:     '#8B1A4A',
  brass:   '#C9A227',
  brassDim:'rgba(201,162,39,0.18)',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.50)',
  ghost:   'rgba(244,236,216,0.10)',
  red:     '#C0392B',
  green:   '#27AE60',
} as const

export function BetScreen() {
  const { game } = useLocalSearchParams<{ game?: string }>()
  const { username, gold } = useProfile()
  const isRonda = game !== 'dijouj'

  const [quickBet, setQuickBet] = useState(0)
  const [custom, setCustom]   = useState('')
  const [connecting, setConnecting] = useState(false)

  const customVal = custom !== '' ? (parseInt(custom, 10) || 0) : null
  const activeBet = customVal !== null ? customVal : quickBet

  const canBet    = gold >= 5
  const betValid  = activeBet > 0 && activeBet >= 5 && activeBet <= gold
  const canPlay   = !connecting && (activeBet === 0 || betValid)

  function pickQuick(b: number) {
    setCustom('')
    setQuickBet(prev => prev === b ? 0 : b)
  }

  function handleCustomChange(v: string) {
    setQuickBet(0)
    const digits = v.replace(/[^0-9]/g, '')
    setCustom(digits)
  }

  async function launchGame(bet: number) {
    if (connecting) return
    setConnecting(true)
    try {
      if (bet > 0) removeGold(bet)
      const pseudo = username || 'Joueur'
      if (isRonda) {
        await connectQuick(pseudo, bet)
        router.push('/online' as Href)
      } else {
        await connectDiJoujQuick(pseudo, bet)
        router.push('/dijouj-online' as Href)
      }
    } finally {
      setConnecting(false)
    }
  }

  const gameTitle = isRonda ? 'RONDA' : 'DI JOUJ'
  const gradColors: [string, string] = isRonda
    ? ['#0A2A1E', '#0E5C4A']
    : ['#1A0008', '#2D0A1E']

  return (
    <LinearGradient colors={[C.gradTop, C.gradBot]} style={s.root}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >

          {/* ── Header ──────────────────────────────────────────────── */}
          <View style={s.header}>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={s.backBtn}>
              <Text style={s.backTxt}>← Retour</Text>
            </TouchableOpacity>
            <Text style={s.title}>{gameTitle}</Text>
            <View style={s.headerSpacer} />
          </View>

          {/* ── Contenu ─────────────────────────────────────────────── */}
          <View style={s.body}>

            {/* Balance */}
            <LinearGradient colors={gradColors} style={s.balanceCard}>
              <Text style={s.balanceLabel}>Ton solde</Text>
              <Text style={s.balanceAmount}>🪙 {gold}</Text>
            </LinearGradient>

            {/* Titre section mise */}
            <Text style={s.sectionTitle}>Choisir une mise</Text>
            <Text style={s.sectionSub}>
              Le gagnant remporte la mise totale du pot.
            </Text>

            {/* Quick bets */}
            <View style={s.quickRow}>
              {QUICK_BETS.map(b => {
                const disabled = b > gold
                const active   = quickBet === b && custom === ''
                return (
                  <TouchableOpacity
                    key={b}
                    style={[
                      s.quickBtn,
                      active    && s.quickBtnActive,
                      disabled  && s.quickBtnDisabled,
                    ]}
                    onPress={() => !disabled && pickQuick(b)}
                    activeOpacity={disabled ? 1 : 0.75}
                  >
                    <Text style={[s.quickBtnTxt, active && s.quickBtnTxtActive, disabled && s.quickBtnTxtDisabled]}>
                      {b}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* Custom input */}
            <TextInput
              style={[s.input, custom !== '' && s.inputActive]}
              value={custom}
              onChangeText={handleCustomChange}
              placeholder="Mise personnalisée…"
              placeholderTextColor={C.boneOff}
              keyboardType="number-pad"
              maxLength={5}
            />
            {customVal !== null && customVal > 0 && customVal < 5 && (
              <Text style={s.inputHint}>Mise minimum : 5 🪙</Text>
            )}
            {customVal !== null && customVal > gold && (
              <Text style={s.inputHint}>Solde insuffisant (max {gold} 🪙)</Text>
            )}

            {/* Gold insuffisant */}
            {!canBet && (
              <View style={s.alertBox}>
                <Text style={s.alertTxt}>Gold insuffisant pour miser.</Text>
                <TouchableOpacity onPress={() => router.push('/gold-shop' as Href)} activeOpacity={0.7}>
                  <Text style={s.alertLink}>Obtenir de l'or →</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Selected bet preview */}
            {activeBet > 0 && betValid && (
              <View style={s.previewBox}>
                <Text style={s.previewTxt}>
                  Mise sélectionnée : <Text style={s.previewAmount}>🪙 {activeBet}</Text>
                </Text>
                <Text style={s.previewGain}>
                  Gain si victoire : <Text style={s.previewGainAmt}>🪙 +{activeBet}</Text> net
                </Text>
              </View>
            )}

            {/* CTA */}
            <View style={s.ctaGroup}>
              <TouchableOpacity
                style={[s.playBtn, (!canPlay || !betValid) && s.playBtnDisabled]}
                onPress={() => canPlay && betValid && launchGame(activeBet)}
                activeOpacity={canPlay && betValid ? 0.85 : 1}
              >
                {connecting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.playBtnTxt}>
                      Jouer — Mise {activeBet > 0 ? `🪙 ${activeBet}` : '?'}
                    </Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={s.freeBtn}
                onPress={() => !connecting && launchGame(0)}
                activeOpacity={0.7}
              >
                <Text style={s.freeBtnTxt}>Jouer sans mise</Text>
              </TouchableOpacity>
            </View>

          </View>
        </KeyboardAvoidingView>
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
    fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 20, letterSpacing: 6,
  },
  headerSpacer: { width: 60 },

  body: {
    flex: 1, paddingHorizontal: 24, paddingTop: 8, gap: 16,
  },

  balanceCard: {
    borderRadius: 16, paddingVertical: 18, paddingHorizontal: 24,
    alignItems: 'center', gap: 4,
  },
  balanceLabel: {
    fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 12, letterSpacing: 1,
  },
  balanceAmount: {
    fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 32,
  },

  sectionTitle: {
    fontFamily: 'Cairo_600SemiBold', color: C.bone, fontSize: 16, letterSpacing: 0.3,
  },
  sectionSub: {
    fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 12, marginTop: -10,
  },

  quickRow: { flexDirection: 'row', gap: 10 },
  quickBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    backgroundColor: C.surface, borderWidth: 1.5, borderColor: 'rgba(201,162,39,0.18)',
  },
  quickBtnActive:   { backgroundColor: C.brassDim, borderColor: C.brass },
  quickBtnDisabled: { opacity: 0.30 },
  quickBtnTxt: {
    fontFamily: 'Cairo_600SemiBold', color: C.boneOff, fontSize: 15,
  },
  quickBtnTxtActive:   { color: C.brass },
  quickBtnTxtDisabled: { color: C.boneOff },

  input: {
    backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontFamily: 'Cairo_400Regular', fontSize: 16, color: C.bone,
    borderWidth: 1.5, borderColor: 'rgba(244,236,216,0.12)',
  },
  inputActive: { borderColor: C.brass },
  inputHint: {
    fontFamily: 'Cairo_400Regular', color: C.red, fontSize: 12, marginTop: -10,
  },

  alertBox: {
    backgroundColor: 'rgba(192,57,43,0.12)', borderRadius: 12, padding: 14, gap: 6,
    borderLeftWidth: 3, borderLeftColor: C.red,
  },
  alertTxt:  { fontFamily: 'Cairo_400Regular', color: C.bone, fontSize: 14 },
  alertLink: { fontFamily: 'Cairo_600SemiBold', color: C.brass, fontSize: 13 },

  previewBox: {
    backgroundColor: 'rgba(201,162,39,0.08)', borderRadius: 12, padding: 14, gap: 4,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)',
  },
  previewTxt: {
    fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13,
  },
  previewAmount: { fontFamily: 'Cairo_600SemiBold', color: C.brass },
  previewGain: {
    fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13,
  },
  previewGainAmt: { fontFamily: 'Cairo_600SemiBold', color: C.green },

  ctaGroup: { gap: 10, marginTop: 4 },
  playBtn: {
    backgroundColor: C.brass, borderRadius: 14, paddingVertical: 18, alignItems: 'center',
  },
  playBtnDisabled: { opacity: 0.38 },
  playBtnTxt: {
    fontFamily: 'Cairo_600SemiBold', color: '#1C2622', fontSize: 16, letterSpacing: 0.4,
  },
  freeBtn: {
    borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(244,236,216,0.14)',
  },
  freeBtnTxt: {
    fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 14,
  },
})

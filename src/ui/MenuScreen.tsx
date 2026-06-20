import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Svg, Circle, Polygon } from 'react-native-svg'
import { TERMS } from './terms'

const LINKEDIN_URL = 'https://www.linkedin.com/in/amjahid-mohamed-amin'

// ── Tokens ────────────────────────────────────────────────────────────────────

const C = {
  table:    '#0E5C4A',
  deep:     '#09402F',
  brass:    '#C9A227',
  bone:     '#F4ECD8',
  ink:      '#1C2622',
  boneOff:  'rgba(244,236,216,0.45)',
  disabled: 'rgba(244,236,216,0.12)',
  disabledTxt: 'rgba(244,236,216,0.3)',
} as const

// ── Logo khatam ───────────────────────────────────────────────────────────────

function KhatamLogo() {
  return (
    <Svg width={72} height={72} viewBox="0 0 72 72">
      <Circle cx="36" cy="36" r="34" fill={C.deep} stroke={C.brass} strokeWidth="2" />
      <Polygon
        points={
          '36,10 39.2,23.4 51.8,17.4 45.8,29 60,36 ' +
          '45.8,43 51.8,54.6 39.2,48.6 36,62 32.8,48.6 ' +
          '20.2,54.6 26.2,43 12,36 26.2,29 20.2,17.4 32.8,23.4'
        }
        fill={C.brass}
      />
    </Svg>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onPlayVsAi:  () => void
  onPlay2v2:   () => void
  onRules:     () => void
  onCredits:   () => void
}

// ── Écran ─────────────────────────────────────────────────────────────────────

export function MenuScreen({ onPlayVsAi, onPlay2v2, onRules, onCredits }: Props) {
  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>

        {/* ── Identité ─────────────────────────────────────────── */}
        <View style={s.hero}>
          <KhatamLogo />
          <View style={s.titleBlock}>
            <Text style={s.title}>RONDA</Text>
            <Text style={s.titleSub}>{TERMS.ronda.ar}</Text>
          </View>
          <View style={s.divider} />
          <Text style={s.tagline}>Jeu de cartes marocain</Text>
        </View>

        {/* ── Actions ──────────────────────────────────────────── */}
        <View style={s.actions}>

          {/* Jouer contre l'IA */}
          <TouchableOpacity style={s.btnPrimary} onPress={onPlayVsAi}>
            <Text style={s.btnPrimaryTxt}>Jouer contre l'IA</Text>
          </TouchableOpacity>

          {/* 2 contre 2 (toi + IA alliée contre 2 IA) */}
          <TouchableOpacity style={s.btnSecondary} onPress={onPlay2v2}>
            <Text style={s.btnSecondaryTxt}>2 contre 2</Text>
          </TouchableOpacity>

          {/* Jouer avec un ami — désactivé (multijoueur à venir) */}
          <TouchableOpacity style={s.btnDisabled} disabled>
            <Text style={s.btnDisabledIcon}>🔒</Text>
            <Text style={s.btnDisabledTxt}>Jouer avec un ami</Text>
            <Text style={s.btnDisabledBadge}>Bientôt</Text>
          </TouchableOpacity>

          {/* Règles + Crédits — liens discrets */}
          <View style={s.textLinks}>
            <TouchableOpacity style={s.btnCredits} onPress={onRules}>
              <Text style={s.btnCreditsTxt}>Règles</Text>
            </TouchableOpacity>
            <Text style={s.linkSep}>·</Text>
            <TouchableOpacity style={s.btnCredits} onPress={onCredits}>
              <Text style={s.btnCreditsTxt}>Crédits</Text>
            </TouchableOpacity>
          </View>

        </View>

        {/* ── Pied de page ─────────────────────────────────────── */}
        <View style={s.footer}>
          <Text style={s.footerTxt}>v1.0 — solo</Text>
          <TouchableOpacity onPress={() => Linking.openURL(LINKEDIN_URL)}>
            <Text style={s.author}>Made by Amjahid Mohamed Amin</Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.table,
    alignItems: 'center',
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: 430,
    paddingHorizontal: 28,
  },

  // Identité
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 20,
  },
  titleBlock: {
    alignItems: 'center',
    gap: 4,
  },
  title: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 48,
    color: C.bone,
    letterSpacing: 10,
    textTransform: 'uppercase',
  },
  titleSub: {
    fontFamily: 'ReemKufi_700Bold',
    fontSize: 24,
    color: C.brass,
    letterSpacing: 2,
  },
  divider: {
    width: 48,
    height: 2,
    backgroundColor: C.brass,
    opacity: 0.5,
    borderRadius: 1,
  },
  tagline: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 13,
    color: C.boneOff,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // Boutons
  actions: {
    gap: 14,
    paddingBottom: 32,
  },
  btnPrimary: {
    backgroundColor: C.brass,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: C.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  btnPrimaryTxt: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 16,
    color: C.ink,
    letterSpacing: 0.4,
  },
  btnSecondary: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.brass,
  },
  btnSecondaryTxt: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 16,
    color: C.brass,
    letterSpacing: 0.4,
  },
  btnDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.disabled,
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 10,
  },
  btnDisabledIcon: {
    fontSize: 14,
  },
  btnDisabledTxt: {
    fontFamily: 'Cairo_400Regular',
    flex: 1,
    fontSize: 15,
    color: C.disabledTxt,
  },
  btnDisabledBadge: {
    fontSize: 10,
    color: C.disabledTxt,
    borderWidth: 1,
    borderColor: C.disabledTxt,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  textLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  linkSep: {
    color: 'rgba(244,236,216,0.25)',
    fontSize: 12,
  },
  btnCredits: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  btnCreditsTxt: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 12,
    color: 'rgba(244,236,216,0.3)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Pied
  footer: {
    alignItems: 'center',
    paddingBottom: 12,
    gap: 6,
  },
  footerTxt: {
    fontSize: 10,
    color: 'rgba(244,236,216,0.2)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  author: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 12,
    color: 'rgba(244,236,216,0.45)',
    letterSpacing: 0.3,
    textDecorationLine: 'underline',
  },
})

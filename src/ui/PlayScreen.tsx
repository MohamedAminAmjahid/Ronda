import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { TERMS } from './terms'
import { getDifficulty, setDifficulty, loadDifficulty, type Difficulty } from '../game/difficulty'

// ── Tokens (cohérents avec MenuScreen) ─────────────────────────────────────────

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
} as const

interface Props {
  onBack:     () => void
  onPlay1v1:  () => void
  onPlay2v2:  () => void
}

const DIFFICULTIES: { key: Difficulty; label: string }[] = [
  { key: 'easy', label: 'Facile' },
  { key: 'medium', label: 'Moyen' },
]

/** Choix du mode hors-ligne (vs IA) : 1 contre 1 ou 2 contre 2 + difficulté. */
export function PlayScreen({ onBack, onPlay1v1, onPlay2v2 }: Props) {
  const [difficulty, setDiff] = useState<Difficulty>(getDifficulty)

  useEffect(() => {
    void loadDifficulty().then(setDiff)
  }, [])

  const chooseDifficulty = (d: Difficulty) => {
    setDifficulty(d)
    setDiff(d)
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>

        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>← Menu</Text>
          </TouchableOpacity>
          <Text style={s.title}>Jouer</Text>
          <Text style={s.subtitle}>Contre l'ordinateur</Text>
        </View>

        <View style={s.body}>

          <Text style={s.diffLabel}>Difficulté</Text>
          <View style={s.diffRow}>
            {DIFFICULTIES.map((d) => {
              const active = d.key === difficulty
              return (
                <TouchableOpacity
                  key={d.key}
                  style={[s.diffPill, active && s.diffPillActive]}
                  onPress={() => chooseDifficulty(d.key)}
                  activeOpacity={0.85}
                >
                  <Text style={[s.diffPillTxt, active && s.diffPillTxtActive]}>{d.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <TouchableOpacity style={s.btnPrimary} onPress={onPlay1v1} activeOpacity={0.85}>
            <Text style={s.btnPrimaryTxt}>1 contre 1</Text>
            <Text style={s.btnPrimarySub}>Toi contre l'IA</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.btnSecondary} onPress={onPlay2v2} activeOpacity={0.85}>
            <Text style={s.btnSecondaryTxt}>2 contre 2</Text>
            <Text style={s.btnSecondarySub}>Toi + IA alliée contre 2 IA</Text>
          </TouchableOpacity>
        </View>

        <View style={s.footer}>
          <Text style={s.footerTxt}>{TERMS.ronda.ar}</Text>
        </View>

      </View>
    </SafeAreaView>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.table, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 430, paddingHorizontal: 28 },

  header: { paddingTop: 16, alignItems: 'center', gap: 6 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6, marginBottom: 4 },
  backTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  title: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 30, color: C.bone,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  subtitle: {
    fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff,
    letterSpacing: 1, textTransform: 'uppercase',
  },

  body: { flex: 1, justifyContent: 'center', gap: 16 },

  diffLabel: {
    fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff,
    letterSpacing: 1.5, textTransform: 'uppercase', alignSelf: 'center',
  },
  diffRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 8 },
  diffPill: {
    paddingHorizontal: 22, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1.5, borderColor: 'rgba(244,236,216,0.18)', backgroundColor: 'rgba(0,0,0,0.18)',
  },
  diffPillActive: { borderColor: C.brass, backgroundColor: C.brass },
  diffPillTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.boneOff },
  diffPillTxtActive: { color: C.ink },
  btnPrimary: {
    backgroundColor: C.brass, borderRadius: 14, paddingVertical: 22,
    alignItems: 'center', gap: 4,
    shadowColor: C.ink, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  btnPrimaryTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 20, color: C.ink, letterSpacing: 0.4 },
  btnPrimarySub: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: 'rgba(28,38,34,0.7)' },
  btnSecondary: {
    borderRadius: 14, paddingVertical: 22, alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderColor: C.brass,
  },
  btnSecondaryTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 20, color: C.brass, letterSpacing: 0.4 },
  btnSecondarySub: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff },

  footer: { alignItems: 'center', paddingBottom: 16 },
  footerTxt: { fontFamily: 'ReemKufi_700Bold', fontSize: 22, color: 'rgba(201,162,39,0.45)', letterSpacing: 2 },
})

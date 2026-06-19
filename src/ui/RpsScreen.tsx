import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { PlayerId } from '../engine/types'
import { HUMAN_ID, BOT_ID } from '../game'

const C = {
  table:    '#0E5C4A',
  deep:     '#09402F',
  brass:    '#C9A227',
  bone:     '#F4ECD8',
  ink:      '#1C2622',
  boneOff:  'rgba(244,236,216,0.45)',
  surface:  'rgba(0,0,0,0.2)',
  selected: 'rgba(201,162,39,0.18)',
} as const

// ── Logique RPS ───────────────────────────────────────────────────────────────

type Choice = 'pierre' | 'feuille' | 'ciseaux'
type Result = 'player' | 'bot' | 'tie'

const CHOICES: Choice[] = ['pierre', 'feuille', 'ciseaux']

const LABELS: Record<Choice, { symbol: string; label: string; beats: Choice }> = {
  pierre:  { symbol: '✊', label: 'Pierre',  beats: 'ciseaux' },
  feuille: { symbol: '✋', label: 'Feuille', beats: 'pierre'  },
  ciseaux: { symbol: '✌', label: 'Ciseaux', beats: 'feuille' },
}

function resolve(player: Choice, bot: Choice): Result {
  if (player === bot) return 'tie'
  return LABELS[player].beats === bot ? 'player' : 'bot'
}

// ── Types / Props ─────────────────────────────────────────────────────────────

type Phase = 'choosing' | 'result'

interface Props {
  onStart: (firstDealer: PlayerId) => void
  onBack:  () => void
}

// ── Écran ─────────────────────────────────────────────────────────────────────

export function RpsScreen({ onStart, onBack }: Props) {
  const [phase,       setPhase]       = useState<Phase>('choosing')
  const [playerChoice, setPlayerChoice] = useState<Choice | null>(null)
  const [botChoice,    setBotChoice]    = useState<Choice | null>(null)
  const [result,       setResult]       = useState<Result | null>(null)

  // Égalité → repasse automatiquement en 'choosing' après 1.5 s
  useEffect(() => {
    if (result !== 'tie') return
    const tid = setTimeout(() => {
      setPlayerChoice(null)
      setBotChoice(null)
      setResult(null)
      setPhase('choosing')
    }, 1500)
    return () => clearTimeout(tid)
  }, [result])

  const handlePick = (choice: Choice) => {
    if (phase !== 'choosing') return
    const bot = CHOICES[Math.floor(Math.random() * 3)]
    const res  = resolve(choice, bot)
    setPlayerChoice(choice)
    setBotChoice(bot)
    setResult(res)
    setPhase('result')
  }

  const humanWon = result === 'player'

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>

        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>← Rituels</Text>
          </TouchableOpacity>
          <Text style={s.title}>Pierre-Feuille-Ciseaux</Text>
          <Text style={s.subtitle}>Le gagnant est donneur</Text>
        </View>

        {/* ── Phase choix ───────────────────────────────────── */}
        {phase === 'choosing' && (
          <View style={s.choicesArea}>
            <Text style={s.prompt}>Choisissez votre arme</Text>
            <View style={s.choicesRow}>
              {CHOICES.map(c => (
                <TouchableOpacity key={c} style={s.choiceBtn} onPress={() => handlePick(c)}>
                  <Text style={s.choiceSymbol}>{LABELS[c].symbol}</Text>
                  <Text style={s.choiceLabel}>{LABELS[c].label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Phase résultat ────────────────────────────────── */}
        {phase === 'result' && playerChoice && botChoice && result && (
          <View style={s.resultArea}>
            {/* Confrontation */}
            <View style={s.faceoff}>
              <View style={s.faceSlot}>
                <Text style={s.faceLabel}>Vous</Text>
                <View style={[s.faceCard, result === 'player' && s.faceCardWin]}>
                  <Text style={s.faceSymbol}>{LABELS[playerChoice].symbol}</Text>
                  <Text style={s.faceChoice}>{LABELS[playerChoice].label}</Text>
                </View>
              </View>

              <Text style={s.faceSep}>VS</Text>

              <View style={s.faceSlot}>
                <Text style={s.faceLabel}>Bot</Text>
                <View style={[s.faceCard, result === 'bot' && s.faceCardWin]}>
                  <Text style={s.faceSymbol}>{LABELS[botChoice].symbol}</Text>
                  <Text style={s.faceChoice}>{LABELS[botChoice].label}</Text>
                </View>
              </View>
            </View>

            {/* Verdict */}
            {result === 'tie' ? (
              <View style={s.outcomeBox}>
                <Text style={s.outcomeTitle}>Égalité !</Text>
                <Text style={s.outcomeSub}>On rejoue…</Text>
              </View>
            ) : (
              <View style={s.outcomeGroup}>
                <View style={s.outcomeBox}>
                  <Text style={s.outcomeTitle}>
                    {humanWon ? 'Vous avez gagné !' : 'Le bot a gagné.'}
                  </Text>
                  <Text style={s.outcomeSub}>
                    {humanWon
                      ? 'Vous êtes donneur — le bot pose la première carte.'
                      : 'Le bot est donneur — vous posez la première carte.'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={s.btnPrimary}
                  onPress={() => onStart(humanWon ? HUMAN_ID : BOT_ID)}
                >
                  <Text style={s.btnPrimaryTxt}>Commencer la partie</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

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
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 28,
    alignItems: 'center',
    gap: 6,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    marginBottom: 8,
  },
  backTxt: {
    color: C.boneOff,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 22,
    color: C.bone,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 12,
    color: C.boneOff,
    letterSpacing: 0.6,
  },

  // Phase choix
  choicesArea: {
    alignItems: 'center',
    gap: 24,
    paddingTop: 16,
  },
  prompt: {
    fontSize: 14,
    color: C.boneOff,
    letterSpacing: 0.6,
  },
  choicesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  choiceBtn: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.2)',
    paddingVertical: 20,
    alignItems: 'center',
    gap: 8,
  },
  choiceSymbol: {
    fontSize: 32,
  },
  choiceLabel: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 11,
    color: C.boneOff,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // Phase résultat
  resultArea: {
    gap: 24,
    paddingTop: 8,
  },
  faceoff: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  faceSlot: {
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  faceLabel: {
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: C.boneOff,
  },
  faceCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(201,162,39,0.2)',
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  faceCardWin: {
    borderColor: C.brass,
    backgroundColor: 'rgba(201,162,39,0.1)',
  },
  faceSymbol: {
    fontSize: 36,
  },
  faceChoice: {
    fontSize: 11,
    fontWeight: '600',
    color: C.boneOff,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  faceSep: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(244,236,216,0.2)',
    letterSpacing: 2,
    marginTop: 12,
  },

  outcomeGroup: {
    gap: 16,
    alignItems: 'center',
  },
  outcomeBox: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  outcomeTitle: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 20,
    color: C.bone,
  },
  outcomeSub: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 13,
    color: C.boneOff,
    textAlign: 'center',
    lineHeight: 20,
  },

  btnPrimary: {
    backgroundColor: C.brass,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
    shadowColor: C.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  btnPrimaryTxt: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 15,
    color: C.ink,
    letterSpacing: 0.5,
  },
})

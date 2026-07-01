import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useI18n } from '../i18n/useI18n'
import { CardFace, CardBack } from './components/Card'
import { loadLatestReplay, type Replay, type ReplayFrame } from '../replay/replay'

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
} as const

const SPEEDS = [1, 2, 4] as const
type Speed = typeof SPEEDS[number]

interface Props {
  onBack: () => void
}

export function ReplayScreen({ onBack }: Props) {
  const { t } = useI18n()
  const [replay, setReplay] = useState<Replay | null>(null)
  const [loading, setLoading] = useState(true)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<Speed>(1)

  useEffect(() => {
    let cancelled = false
    void loadLatestReplay().then((r) => {
      if (cancelled) return
      setReplay(r)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const steps = replay?.steps ?? []
  const total = steps.length

  // Lecture automatique.
  const playingRef = useRef(playing)
  playingRef.current = playing
  useEffect(() => {
    if (!playing || total === 0) return
    if (index >= total - 1) { setPlaying(false); return }
    const delay = 1200 / speed
    const tid = setTimeout(() => setIndex((i) => Math.min(i + 1, total - 1)), delay)
    return () => clearTimeout(tid)
  }, [playing, index, speed, total])

  if (loading) {
    return (
      <SafeAreaView style={[s.root, { justifyContent: 'center' }]}>
        <ActivityIndicator color={C.brass} />
      </SafeAreaView>
    )
  }

  if (!replay || total === 0) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <View style={s.column}>
          <View style={s.header}>
            <TouchableOpacity onPress={onBack} style={s.backBtn}>
              <Text style={s.backTxt}>{t('back')}</Text>
            </TouchableOpacity>
            <Text style={s.title}>{t('replayTitle')}</Text>
          </View>
          <View style={s.center}>
            <Text style={s.empty}>{t('replayEmpty')}</Text>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  const frame = steps[Math.min(index, total - 1)].frame
  const goFirst = () => { setPlaying(false); setIndex(0) }
  const goPrev  = () => { setPlaying(false); setIndex((i) => Math.max(0, i - 1)) }
  const goNext  = () => { setPlaying(false); setIndex((i) => Math.min(total - 1, i + 1)) }
  const goLast  = () => { setPlaying(false); setIndex(total - 1) }
  const cycleSpeed = () => setSpeed((sp) => SPEEDS[(SPEEDS.indexOf(sp) + 1) % SPEEDS.length])

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>
        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>{t('back')}</Text>
          </TouchableOpacity>
          <View style={s.headerRow}>
            <Text style={s.title}>{t('replayTitle')}</Text>
            <Text style={s.scorePill}>
              {t('you')} {frame.scores[0]} — {t('bot')} {frame.scores[1]}
            </Text>
          </View>
        </View>

        <ReplayBoard frame={frame} online={replay.online} t={t} />

        {/* Progression */}
        <View style={s.progressWrap}>
          <Text style={s.stepTxt}>{index + 1} / {total}</Text>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${((index + 1) / total) * 100}%` }]} />
          </View>
        </View>

        {/* Contrôles */}
        <View style={s.controls}>
          <TouchableOpacity style={s.ctrlBtn} onPress={goFirst} disabled={index === 0}>
            <Text style={[s.ctrlTxt, index === 0 && s.ctrlDisabled]}>⏮</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.ctrlBtn} onPress={goPrev} disabled={index === 0}>
            <Text style={[s.ctrlTxt, index === 0 && s.ctrlDisabled]}>◀</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.ctrlBtn, s.playBtn]} onPress={() => setPlaying((p) => !p)}>
            <Text style={s.playTxt}>{playing ? '⏸' : '▶'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.ctrlBtn} onPress={goNext} disabled={index >= total - 1}>
            <Text style={[s.ctrlTxt, index >= total - 1 && s.ctrlDisabled]}>▶</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.ctrlBtn} onPress={goLast} disabled={index >= total - 1}>
            <Text style={[s.ctrlTxt, index >= total - 1 && s.ctrlDisabled]}>⏭</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.ctrlBtn, s.speedBtn]} onPress={cycleSpeed}>
            <Text style={s.speedTxt}>x{speed}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  )
}

// ── Plateau du replay ─────────────────────────────────────────────────────────

function ReplayBoard({ frame, online, t }: { frame: ReplayFrame; online: boolean; t: (k: 'tableEmpty') => string }) {
  return (
    <View style={s.board}>
      {/* Adversaire (joueur 1) */}
      <View style={s.oppZone}>
        <Text style={s.zoneLabel}>🤖 {frame.hands[1].length}</Text>
        <View style={s.handRow}>
          {frame.hands[1].map((c, i) => (
            <View key={i} style={{ marginLeft: i > 0 ? -18 : 0 }}>
              {online ? <CardBack size="sm" /> : <CardFace card={c} size="sm" />}
            </View>
          ))}
        </View>
      </View>

      {/* Table + pioche */}
      <View style={s.tableZone}>
        <View style={s.deckCol}>
          {frame.deckCount > 0 ? <CardBack size="md" /> : <View style={s.deckEmpty} />}
          <Text style={s.deckCount}>{frame.deckCount}</Text>
        </View>
        <View style={s.tableCards}>
          {frame.table.length === 0
            ? <Text style={s.tableEmpty}>{t('tableEmpty')}</Text>
            : frame.table.map((c, i) => (
                <View key={i} style={s.tableCard}><CardFace card={c} size="md" /></View>
              ))
          }
        </View>
      </View>

      {/* Joueur (0) */}
      <View style={s.selfZone}>
        <View style={s.handRow}>
          {frame.hands[0].map((c, i) => (
            <View key={i} style={{ marginLeft: i > 0 ? -14 : 0 }}>
              <CardFace card={c} size="md" />
            </View>
          ))}
        </View>
        <Text style={s.zoneLabel}>🧑 {frame.hands[0].length}</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.table, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 460, paddingHorizontal: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty:  { fontFamily: 'Cairo_400Regular', fontSize: 15, color: C.boneOff, textAlign: 'center' },

  header:    { paddingTop: 14, paddingBottom: 6, gap: 8 },
  backBtn:   { alignSelf: 'flex-start', paddingVertical: 6 },
  backTxt:   { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:     { fontFamily: 'Cairo_600SemiBold', fontSize: 20, color: C.bone, letterSpacing: 1, textTransform: 'uppercase' },
  scorePill: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.brass,
    backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5,
  },

  board:    { flex: 1, justifyContent: 'space-between', paddingVertical: 12 },
  oppZone:  { alignItems: 'center', gap: 6 },
  selfZone: { alignItems: 'center', gap: 6 },
  zoneLabel: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.boneOff },
  handRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },

  tableZone: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, paddingVertical: 8,
  },
  deckCol:   { alignItems: 'center', gap: 4 },
  deckCount: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.boneOff },
  deckEmpty: {
    width: 58, height: 87, borderRadius: 8, borderWidth: 1,
    borderColor: 'rgba(244,236,216,0.15)',
  },
  tableCards: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 260 },
  tableCard:  {},
  tableEmpty: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff },

  progressWrap: { gap: 6, paddingVertical: 8 },
  stepTxt:      { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.bone, textAlign: 'center' },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.25)', overflow: 'hidden' },
  progressFill:  { height: '100%', backgroundColor: C.brass, borderRadius: 3 },

  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 16 },
  ctrlBtn: {
    width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)', borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)',
  },
  ctrlTxt:      { fontFamily: 'Cairo_600SemiBold', fontSize: 18, color: C.bone },
  ctrlDisabled: { color: 'rgba(244,236,216,0.25)' },
  playBtn:  { backgroundColor: C.brass, borderColor: C.brass },
  playTxt:  { fontFamily: 'Cairo_600SemiBold', fontSize: 20, color: C.ink },
  speedBtn: { width: 52, backgroundColor: 'rgba(201,162,39,0.15)' },
  speedTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.brass },
})

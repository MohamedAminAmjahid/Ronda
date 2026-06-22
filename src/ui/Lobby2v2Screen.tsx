import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import { GameScreen2v2 } from './GameScreen2v2'
import { GoldBadge } from './components/GoldBadge'
import { useLobby2v2 } from '../online/useLobby2v2'
import { useOnlineGame2v2 } from '../online/useOnlineGame2v2'
import { connectLobby, leave } from '../online/lobby2v2'

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

interface Props {
  onBack: () => void
  pseudo: string
  code?: string
}

export function Lobby2v2Screen({ onBack, pseudo, code }: Props) {
  const lobby = useLobby2v2()

  // Connexion au montage ; déconnexion au démontage.
  useEffect(() => {
    void connectLobby(pseudo, code)
    return () => { leave() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Partie démarrée → écran de jeu 2v2 en ligne ───────────────────────────
  if (lobby.status === 'playing') {
    return <GameScreen2v2 useGame2v2={useOnlineGame2v2} onBack={() => { leave(); onBack() }} />
  }

  if (lobby.status === 'connecting' || lobby.status === 'idle') {
    return (
      <SafeAreaView style={[s.root, { justifyContent: 'center' }]}>
        <Text style={s.waitTxt}>Connexion…</Text>
      </SafeAreaView>
    )
  }

  if (lobby.status === 'disconnected') {
    return (
      <SafeAreaView style={[s.root, { justifyContent: 'center' }]}>
        <View style={[s.column, { alignItems: 'center', gap: 16 }]}>
          <Text style={s.waitTxt}>{lobby.error ?? 'Déconnecté.'}</Text>
          <TouchableOpacity style={s.btnPrimary} onPress={onBack}>
            <Text style={s.btnPrimaryTxt}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // ── Lobby (WAITING) ─────────────────────────────────────────────────────────
  return <LobbyView lobby={lobby} onBack={onBack} />
}

function LobbyView({ lobby, onBack }: { lobby: ReturnType<typeof useLobby2v2>; onBack: () => void }) {
  const [copied, setCopied] = useState(false)
  const code = lobby.code

  const shareCode = async () => {
    if (!code) return
    try {
      await Share.share({ message: `Rejoins ma partie de Ronda 2v2 ! 🎴\nCode : ${code}\nLien : ${GAME_URL}` })
    } catch { /* annulé */ }
  }
  const copyCode = async () => {
    if (!code) return
    try { await Clipboard.setStringAsync(code); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
  }

  const renderTeam = (team: 0 | 1, label: string) => {
    const humans = lobby.slots.filter((sl) => sl.team === team)
    const botCount = Math.max(0, 2 - humans.length)
    const mine = lobby.myTeam === team
    return (
      <TouchableOpacity style={[s.teamCol, mine && s.teamColMine]} onPress={() => lobby.chooseTeam(team)} activeOpacity={0.8}>
        <Text style={s.teamLabel}>{label}</Text>
        {humans.map((h) => (
          <View key={h.key} style={s.slotRow}>
            <Text style={[s.slotName, h.key === lobby.mySessionId && s.slotMe]}>
              {h.pseudo}{h.isAdmin ? ' 👑' : ''}{h.key === lobby.mySessionId ? ' (toi)' : ''}
            </Text>
          </View>
        ))}
        {Array.from({ length: botCount }).map((_, i) => (
          <View key={`bot-${i}`} style={s.slotRow}>
            <Text style={s.slotBot}>Bot (auto)</Text>
          </View>
        ))}
        <Text style={s.teamHint}>{mine ? 'Votre équipe' : 'Toucher pour rejoindre'}</Text>
      </TouchableOpacity>
    )
  }

  const unassigned = lobby.slots.filter((sl) => sl.team !== 0 && sl.team !== 1)

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>
        <View style={s.header}>
          <View style={s.headerTop}>
            <TouchableOpacity onPress={() => { lobby.leave(); onBack() }} style={s.backBtn}>
              <Text style={s.backTxt}>← Quitter</Text>
            </TouchableOpacity>
            <GoldBadge />
          </View>
          <Text style={s.title}>2 contre 2</Text>
        </View>

        {code && (
          <View style={s.codeBox}>
            <Text style={s.codeLabel}>Code à partager</Text>
            <Text style={s.codeValue}>{code}</Text>
            <View style={s.shareRow}>
              <TouchableOpacity style={s.btnShare} onPress={shareCode}>
                <Text style={s.btnShareTxt}>Partager</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnCopy} onPress={copyCode}>
                <Text style={s.btnCopyTxt}>{copied ? 'Copié ✓' : 'Copier'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {lobby.error && <Text style={s.errorTxt}>{lobby.error}</Text>}

        <View style={s.teamsRow}>
          {renderTeam(0, 'Équipe A')}
          {renderTeam(1, 'Équipe B')}
        </View>

        {unassigned.length > 0 && (
          <View style={s.unassigned}>
            <Text style={s.teamHint}>Sans équipe : {unassigned.map((u) => u.pseudo).join(', ')}</Text>
          </View>
        )}

        <View style={{ flex: 1 }} />

        {lobby.isAdmin ? (
          <TouchableOpacity
            style={[s.btnPrimary, !lobby.canStart && s.btnDisabled]}
            disabled={!lobby.canStart}
            onPress={lobby.startGame}
          >
            <Text style={s.btnPrimaryTxt}>
              {lobby.canStart ? 'Lancer la partie' : 'En attente de joueurs (min. 2)'}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={s.waitTxt}>En attente que l'hôte lance la partie…</Text>
        )}
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.table, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 460, paddingHorizontal: 24 },
  header: { paddingTop: 16, paddingBottom: 16, alignItems: 'center', gap: 6 },
  headerTop: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6, marginBottom: 4 },
  backTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  title: { fontFamily: 'Cairo_600SemiBold', fontSize: 26, color: C.bone, letterSpacing: 1, textTransform: 'uppercase' },

  codeBox: {
    backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20,
    alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(201,162,39,0.3)', marginBottom: 16,
  },
  codeLabel: { fontFamily: 'Cairo_400Regular', fontSize: 10, color: C.boneOff, letterSpacing: 2, textTransform: 'uppercase' },
  codeValue: { fontFamily: 'Cairo_600SemiBold', fontSize: 28, color: C.brass, letterSpacing: 3 },
  shareRow: { flexDirection: 'row', gap: 10 },
  btnShare: { backgroundColor: C.brass, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  btnShareTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.ink },
  btnCopy: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1.5, borderColor: C.brass },
  btnCopyTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.brass },

  teamsRow: { flexDirection: 'row', gap: 12 },
  teamCol: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 14, padding: 14, gap: 8,
    borderWidth: 1.5, borderColor: 'rgba(244,236,216,0.12)', minHeight: 160,
  },
  teamColMine: { borderColor: C.brass },
  teamLabel: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.brass, letterSpacing: 1, textTransform: 'uppercase' },
  slotRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(244,236,216,0.06)' },
  slotName: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.bone },
  slotMe: { fontFamily: 'Cairo_600SemiBold', color: C.brass },
  slotBot: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: 'rgba(244,236,216,0.3)', fontStyle: 'italic' },
  teamHint: { fontFamily: 'Cairo_400Regular', fontSize: 10, color: C.boneOff, marginTop: 4 },

  unassigned: { marginTop: 12 },
  errorTxt: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.clay, marginBottom: 10 },

  waitTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.bone, textAlign: 'center' },
  btnPrimary: { backgroundColor: C.brass, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  btnPrimaryTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.ink, letterSpacing: 0.4 },
  btnDisabled: { opacity: 0.4 },
})

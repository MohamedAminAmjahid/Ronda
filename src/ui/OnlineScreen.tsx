import { useEffect, useRef, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Share } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { router, type Href } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { GameScreen } from './GameScreen'
import { Matchmaking } from './components/Matchmaking'
import { AvatarDisplay } from './ProfileScreen'
import { useOnlineGame } from '../online/useOnlineGame'
import { leave as leaveRondaRoom, voiceTransport } from '../online/store'
import { useProfile } from '../profile/useProfile'
import { xpRequired } from '../profile/profile'
import { useAuth } from '../firebase/auth'
import { updateGameStatus, type GameStatus } from '../firebase/firestore'
import { roomTypeByCode } from '../online/client'
import { getBotWaitSecs, pickBot, getOrCreateBotProfile } from '../online/botFallback'
import { useI18n } from '../i18n/useI18n'
import { useIsOffline } from '../net/useOnlineStatus'
import { VoiceButton } from '../voice/VoiceButton'
import { GameChat } from '../voice/GameChat'

const GAME_URL = 'https://ronda-virid.vercel.app'

/** Navigue vers le lobby 2v2 (création si pas de code, sinon jonction par code). */
function goLobby2v2(pseudo: string, code?: string): void {
  const q = code
    ? `?pseudo=${encodeURIComponent(pseudo)}&code=${encodeURIComponent(code)}`
    : `?pseudo=${encodeURIComponent(pseudo)}`
  router.push(`/lobby2v2${q}` as Href)
}

// Palette : même structure que DiJoujOnlineScreen (dégradé sombre + laiton),
// déclinée dans le vert de la Ronda pour garder l'identité du jeu.
const C = {
  gradTop: '#0C3A29' as const,
  gradBot: '#061A12' as const,
  surface: '#0E5C4A',
  acc:     '#127A5E',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.50)',
  ghost:   'rgba(244,236,216,0.12)',
  ink:     '#1C2622',
  clay:    '#B5532A',
  red:     '#C0392B',
} as const

interface Props {
  onBack: () => void
  /** 'friend' : n'affiche que « Créer une partie » + « Rejoindre avec un code ». */
  mode?: 'quick' | 'friend'
  /** Code pré-rempli (lien de partage /join?code=…) → connexion auto au montage. */
  initialCode?: string
  /** Présents quand on vient du bracket d'un tournoi (TournamentScreen) plutôt
   * que d'un lien d'invitation classique — voir tournament.tsx. */
  tournamentMatchId?: string
  tournamentPlayer1?: string
  tournamentPlayer2?: string
  tournamentIsFinal?: boolean
}

const CODE_LENGTH = 6
const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH)

export function OnlineScreen({
  onBack, mode = 'quick', initialCode,
  tournamentMatchId, tournamentPlayer1, tournamentPlayer2, tournamentIsFinal,
}: Props) {
  const game = useOnlineGame()
  const { connectionStatus, roomCode, opponentDisconnected, error } = game
  const { username, invisibleMode, avatarType, avatarEmoji, avatarImage, level, xp } = useProfile()
  const { user } = useAuth()
  const myUid = user?.uid ?? null
  const { t: tr } = useI18n()
  const offline = useIsOffline()

  // Match de tournoi : l'adversaire (son uid) est déduit des deux joueurs du
  // match transmis par TournamentScreen — le protocole RondaRoom n'expose
  // jamais l'uid de l'adversaire pendant la partie (seulement son pseudo).
  const tournamentOpponentUid = tournamentMatchId
    ? (tournamentPlayer1 === myUid ? tournamentPlayer2 : tournamentPlayer1)
    : undefined

  const avatar = { avatarType, avatarEmoji, avatarImage, level, xp }

  const [codeInput, setCodeInput] = useState(() => normalizeCode(initialCode ?? ''))
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const resolvedRef = useRef<string | null>(null) // dernier code résolu (évite doublons)

  // Nettoyage : quitter la room si l'écran est démonté en cours de connexion.
  useEffect(() => {
    return () => { game.newGame() } // newGame() = leave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Statut « en jeu » visible par les amis (users/{uid}.gameStatus). Le bot
  // de repli matchmaking ne passe jamais par l'état 'playing' de CET écran —
  // dès que onBotFallback se déclenche, il navigue directement vers /game
  // sans jamais rendre connectionStatus === 'playing' ici (voir WaitingScreen
  // plus bas) — donc 'playing' à cet endroit signifie toujours un vrai
  // adversaire (humain, ami ou matchmaking rapide).
  useEffect(() => {
    if (!myUid) return
    let status: GameStatus = null
    if (!invisibleMode) {
      if (connectionStatus === 'waiting') status = 'matchmaking'
      else if (connectionStatus === 'playing') status = mode === 'friend' ? 'playing_friend' : 'playing_online'
    }
    void updateGameStatus(myUid, status)
  }, [myUid, connectionStatus, mode, invisibleMode])

  // Toujours effacer au démontage, même si l'effet ci-dessus n'a pas eu
  // l'occasion de tourner une dernière fois (navigation brutale).
  useEffect(() => {
    return () => { if (myUid) void updateGameStatus(myUid, null) }
  }, [myUid])

  // Match de tournoi : pas de code à échanger — appariement automatique côté
  // serveur (RondaRoom.filterBy(['tournamentMatchId']), voir online/client.ts
  // joinTournamentMatch) dès que les deux joueurs appellent connectTournamentMatch
  // avec le même matchId. Bypass complet du flux code/roomTypeByCode ci-dessous.
  const tournamentJoinedRef = useRef(false)
  useEffect(() => {
    if (!tournamentMatchId || !tournamentOpponentUid || tournamentJoinedRef.current) return
    tournamentJoinedRef.current = true
    void game.connectTournamentMatch(username, tournamentMatchId, tournamentOpponentUid, !!tournamentIsFinal, myUid ?? undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentMatchId, tournamentOpponentUid, username, myUid, tournamentIsFinal])

  // Détection auto du type de room dès que le code est complet (6 caractères).
  // Sans objet pour un match de tournoi (pas de code) — voir effet ci-dessus.
  useEffect(() => {
    if (tournamentMatchId) return
    if (codeInput.length !== CODE_LENGTH) {
      setLookupError(null)
      resolvedRef.current = null
      return
    }
    if (resolvedRef.current === codeInput) return
    resolvedRef.current = codeInput
    setJoining(true)
    setLookupError(null)
    roomTypeByCode(codeInput)
      .then(({ type }) => {
        if (type === 'ronda2v2') goLobby2v2(username, codeInput)
        else game.connectByCode(username, codeInput)
      })
      .catch(() => {
        setJoining(false)
        setLookupError('Code de partie introuvable.')
        resolvedRef.current = null
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeInput, username, tournamentMatchId])

  // Invitation générique : partage le lien de téléchargement de l'app (sans room).
  const inviteFriend = async () => {
    try {
      await Share.share({ message: `Joue à la Ronda avec moi ! 🎴 Télécharge ici : ${GAME_URL}` })
    } catch {
      // partage annulé / indisponible — sans effet
    }
  }

  // ── Partie en cours → GameScreen (mode online) ─────────────────────────────
  if (connectionStatus === 'playing') {
    return (
      <View style={{ flex: 1 }}>
        <GameScreen
          onBack={() => { game.newGame(); onBack() }}
          useGame={useOnlineGame}
          opponentName={game.opponentName ?? undefined}
          online
          forfeitReason={game.gameOver?.reason}
          tournamentMatchId={tournamentMatchId}
        />
        {!!tournamentMatchId && (
          <View style={s.tournamentBadge} pointerEvents="none">
            <Text style={s.tournamentBadgeTxt}>🏆 {tr('tournamentMatchBadge')}</Text>
          </View>
        )}
        {opponentDisconnected && (
          <View style={s.discOverlay} pointerEvents="none">
            <Text style={s.discTitle}>Adversaire déconnecté</Text>
            <Text style={s.discSub}>En attente de reconnexion…</Text>
          </View>
        )}
        <VoiceButton transport={voiceTransport} active username={username || 'Joueur'} />
        <GameChat
          messages={game.chatMessages}
          sendMessage={game.sendChatMsg}
          myUsername={username || 'Joueur'}
          accentColor="#2E7D32"
          isGameOver={game.view.isGameOver}
        />
      </View>
    )
  }

  // ── En attente (connexion / adversaire) ────────────────────────────────────
  if (connectionStatus === 'connecting' || connectionStatus === 'waiting') {
    return (
      <WaitingScreen
        code={roomCode}
        mode={mode}
        bet={game.bet ?? 0}
        username={username || 'Joueur'}
        avatar={avatar}
        onCancel={() => game.newGame()}
        onBotFallback={(name, emoji, avatarIdx, female) => {
          const stake = game.bet ?? 0
          leaveRondaRoom(false) // pas de remboursement : la mise suit dans la partie bot
          void getOrCreateBotProfile(name, avatarIdx, female) // arrière-plan, sans bloquer la navigation
          router.push(
            `/game?botName=${encodeURIComponent(name)}&botEmoji=${encodeURIComponent(emoji)}` +
            `&botAvatarIdx=${avatarIdx}&botFemale=${female ? 1 : 0}&bet=${stake}&wasOnline=1` as Href,
          )
        }}
      />
    )
  }

  // ── Lobby (idle / déconnecté) — dégradé sombre façon Di Jouj ────────────────
  return (
    <LinearGradient colors={[C.gradTop, C.gradBot]} style={s.root}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.column}>
          <View style={s.header}>
            <TouchableOpacity onPress={onBack} style={s.backBtn} activeOpacity={0.7}>
              <Text style={s.backTxt}>{tr('back')}</Text>
            </TouchableOpacity>
            <Text style={s.title}>RONDA</Text>
            <View style={s.headerSpacer} />
          </View>

          {/* Avatar + pseudo centrés */}
          <View style={s.identity}>
            <AvatarDisplay
              type={(avatarType ?? 'initial') as 'initial' | 'emoji' | 'image'}
              initial={(username?.[0] ?? '?').toUpperCase()}
              emoji={avatarEmoji ?? ''}
              image={avatarImage ?? ''}
              size={72}
              level={level}
              xp={xp} xpMax={xpRequired(level ?? 1)}
            />
            <Text style={s.identityName} numberOfLines={1}>{username}</Text>
            <Text style={s.identitySub}>{mode === 'friend' ? tr('playWithFriend') : tr('playOnline')}</Text>
          </View>

          {game.bet > 0 && (
            <View style={s.betBar}>
              <Text style={s.betTxt}>Mise · {game.bet} 🪙</Text>
            </View>
          )}

          {error && (
            <View style={s.errorBox}><Text style={s.errorTxt}>{error}</Text></View>
          )}

          {offline && (
            <View style={s.offlineNotice}>
              <Text style={s.offlineNoticeTxt}>📵 {tr('offlineNeedConnection')}</Text>
            </View>
          )}

          <View style={s.body}>
            {mode !== 'friend' && (
              <TouchableOpacity
                style={[s.btnPrimary, offline && s.btnDisabled]}
                onPress={() => { if (!offline) game.connectQuick(username) }}
                disabled={offline}
                activeOpacity={0.85}
              >
                <Text style={s.btnPrimaryTxt}>{tr('quickMatch')}</Text>
              </TouchableOpacity>
            )}

            {mode === 'friend' && (
              <>
                <TouchableOpacity style={[s.btnPrimary, offline && s.btnDisabled]} onPress={inviteFriend} activeOpacity={0.85}>
                  <Text style={s.btnPrimaryTxt}>Inviter un ami</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.btnSecondary, offline && s.btnDisabled]}
                  onPress={() => { if (!offline) game.connectCreate(username) }}
                  disabled={offline}
                  activeOpacity={0.85}
                >
                  <Text style={s.btnSecondaryTxt}>{tr('createGame')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.btnSecondary, offline && s.btnDisabled]}
                  onPress={() => { if (!offline) goLobby2v2(username) }}
                  disabled={offline}
                  activeOpacity={0.85}
                >
                  <Text style={s.btnSecondaryTxt}>{tr('lobby2v2')}</Text>
                </TouchableOpacity>

                <Text style={s.label}>{tr('joinWithCode')}</Text>
                <TextInput
                  style={s.input}
                  value={codeInput}
                  onChangeText={(v) => setCodeInput(normalizeCode(v))}
                  placeholder={tr('codePlaceholder')}
                  placeholderTextColor={C.boneOff}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!joining && !offline}
                />
                {joining ? (
                  <Text style={s.hint}>{tr('connecting')}</Text>
                ) : lookupError ? (
                  <Text style={s.lookupErr}>{lookupError}</Text>
                ) : (
                  <Text style={s.hint}>Le type de partie est détecté automatiquement.</Text>
                )}
              </>
            )}
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  )
}

// ── Écran d'attente (matchmaking) — style Di Jouj ────────────────────────────

interface AvatarInfo {
  avatarType: string; avatarEmoji: string; avatarImage: string
  level: number; xp: number
}

function WaitingScreen({
  code, mode = 'quick', bet, username, avatar, onCancel, onBotFallback,
}: {
  code: string | null
  mode?: 'quick' | 'friend'
  bet: number
  username: string
  avatar: AvatarInfo
  onCancel: () => void
  onBotFallback?: (name: string, emoji: string, avatarIdx: number, female: boolean) => void
}) {
  const { t: tr } = useI18n()
  const calledRef = useRef(false)
  // Délai aléatoire (25–70 s), figé pour toute la durée de cette recherche —
  // empêche de deviner le repli bot en comptant les secondes.
  const botWaitSecs = useRef(getBotWaitSecs()).current
  const [elapsed, setElapsed] = useState(0)
  const [copied, setCopied]   = useState(false)

  // Compteur 1 s (quick uniquement) — sert de chrono « matchmaking ».
  useEffect(() => {
    if (mode !== 'quick') return
    const id = setInterval(() => { setElapsed(s => s + 1) }, 1000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Repli bot silencieux : au bout du délai, on lance une partie hors-ligne.
  // Aucune indication à l'écran — le joueur croit avoir trouvé un adversaire.
  useEffect(() => {
    if (mode !== 'quick' || calledRef.current) return
    if (elapsed >= botWaitSecs && onBotFallback) {
      calledRef.current = true
      const { name, emoji, avatarIdx, female } = pickBot()
      onBotFallback(name, emoji, avatarIdx, female)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed])

  const formatTime = (sec: number) =>
    `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

  const shareCode = async () => {
    if (!code) return
    try {
      await Share.share({
        message: `Rejoins ma partie de Ronda ! 🎴\nCode : ${code}\nLien : ${GAME_URL}/join?code=${code}`,
      })
    } catch { /* annulé */ }
  }

  const copyCode = async () => {
    if (!code) return
    try {
      await Clipboard.setStringAsync(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* indisponible */ }
  }

  return (
    <LinearGradient colors={[C.gradTop, C.gradBot]} style={s.root}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.header}>
          <Text style={s.title}>RONDA</Text>
        </View>

        {bet > 0 && (
          <View style={s.betBar}>
            <Text style={s.betTxt}>Mise · {bet} 🪙</Text>
          </View>
        )}

        <View style={s.center}>
          {/* Avatar + pseudo du joueur */}
          <View style={s.identity}>
            <AvatarDisplay
              type={(avatar.avatarType ?? 'initial') as 'initial' | 'emoji' | 'image'}
              initial={(username?.[0] ?? '?').toUpperCase()}
              emoji={avatar.avatarEmoji ?? ''}
              image={avatar.avatarImage ?? ''}
              size={64}
              level={avatar.level}
            />
            <Text style={s.identityName} numberOfLines={1}>{username}</Text>
          </View>

          {/* Recherche rapide : animation de matchmaking (aucune mention de bot) */}
          {mode === 'quick' && (
            <Matchmaking
              accent={C.brass}
              track="rgba(201,162,39,0.18)"
              textColor={C.bone}
              label={tr('searchingOpponent')}
              timeLabel={formatTime(elapsed)}
            />
          )}

          {/* Mode ami : code de la chambre à partager */}
          {mode === 'friend' && (
            <>
              <Text style={s.waitTxt}>{tr('waitingOpponent')}</Text>
              {code && (
                <>
                  <View style={s.codeBox}>
                    <Text style={s.codeLabel}>{tr('joinWithCode')}</Text>
                    <Text style={s.codeValue}>{code}</Text>
                  </View>
                  <View style={s.shareRow}>
                    <TouchableOpacity style={s.btnShare} onPress={shareCode} activeOpacity={0.85}>
                      <Text style={s.btnShareTxt}>{tr('share')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.btnCopy} onPress={copyCode} activeOpacity={0.85}>
                      <Text style={s.btnCopyTxt}>{copied ? tr('copied') : tr('copy')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </>
          )}
        </View>

        <TouchableOpacity style={s.btnCancel} onPress={onCancel} activeOpacity={0.8}>
          <Text style={s.btnCancelTxt}>{tr('cancel')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </LinearGradient>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  column: { flex: 1, width: '100%', maxWidth: 430, alignSelf: 'center', paddingHorizontal: 24 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 12, paddingBottom: 8, paddingHorizontal: 8,
  },
  backBtn: { paddingRight: 12, paddingVertical: 6, minWidth: 60 },
  backTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  title: {
    flex: 1, textAlign: 'center',
    fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: C.brass, letterSpacing: 6,
  },
  headerSpacer: { minWidth: 60 },

  identity: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  identityName: { fontFamily: 'Cairo_600SemiBold', fontSize: 20, color: C.bone },
  identitySub:  { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff, letterSpacing: 0.4 },

  betBar: {
    alignSelf: 'center', backgroundColor: 'rgba(201,162,39,0.14)',
    borderRadius: 12, paddingHorizontal: 18, paddingVertical: 8, marginTop: 4,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.30)',
  },
  betTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.brass, letterSpacing: 0.3 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, paddingHorizontal: 8 },

  body: { gap: 14, marginTop: 20 },
  label: {
    fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff,
    letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 6,
  },
  hint: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff, marginTop: -8 },
  input: {
    backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 10, paddingHorizontal: 16,
    paddingVertical: 14, fontFamily: 'Cairo_400Regular', fontSize: 16, color: C.bone,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)',
  },
  btnPrimary: {
    backgroundColor: C.brass, borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  btnPrimaryTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.ink, letterSpacing: 0.4 },
  btnSecondary: {
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    borderWidth: 1.5, borderColor: C.brass, backgroundColor: 'rgba(201,162,39,0.08)',
  },
  btnSecondaryTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.brass, letterSpacing: 0.4 },
  btnDisabled: { opacity: 0.4 },

  offlineNotice: {
    backgroundColor: 'rgba(90,42,42,0.5)', borderRadius: 10, padding: 12, marginTop: 12,
    borderLeftWidth: 3, borderLeftColor: C.red,
  },
  offlineNoticeTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.bone, textAlign: 'center' },
  lookupErr: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.clay, marginTop: -8 },

  errorBox: {
    backgroundColor: 'rgba(181,83,42,0.18)', borderRadius: 10, padding: 12, marginTop: 12,
    borderLeftWidth: 3, borderLeftColor: C.clay,
  },
  errorTxt: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.bone, textAlign: 'center' },

  waitTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 18, color: C.bone, textAlign: 'center' },
  codeBox: {
    backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 14, paddingVertical: 18, paddingHorizontal: 28,
    alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(201,162,39,0.3)',
  },
  codeLabel: {
    fontFamily: 'Cairo_400Regular', fontSize: 10, color: C.boneOff,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  codeValue: { fontFamily: 'Cairo_600SemiBold', fontSize: 34, color: C.brass, letterSpacing: 4 },
  shareRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  btnShare: { backgroundColor: C.brass, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 22 },
  btnShareTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.ink, letterSpacing: 0.3 },
  btnCopy: {
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18,
    borderWidth: 1.5, borderColor: C.brass,
  },
  btnCopyTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.brass, letterSpacing: 0.3 },
  btnCancel: {
    alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 28, marginBottom: 12,
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(244,236,216,0.25)',
  },
  btnCancelTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.boneOff, letterSpacing: 0.3 },

  discOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(6,26,18,0.9)', gap: 8,
  },
  discTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: C.bone },
  discSub: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff },

  tournamentBadge: {
    position: 'absolute', top: 8, alignSelf: 'center', zIndex: 997,
    backgroundColor: 'rgba(201,162,39,0.92)', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  tournamentBadgeTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 12, color: C.ink, letterSpacing: 0.3 },
})

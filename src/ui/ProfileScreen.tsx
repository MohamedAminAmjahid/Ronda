import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Modal, TextInput, ActivityIndicator, Image, Switch, Animated, Share,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import * as Clipboard from 'expo-clipboard'
import { router, type Href } from 'expo-router'
import { frameDef } from '../cosmetics/avatarFrames'
import * as ImagePicker from 'expo-image-picker'
import { useProfile } from '../profile/useProfile'
import { useAuth } from '../firebase/auth'
import { FEMALE_AVATARS, MALE_AVATARS } from '../online/botFallback'
import { useI18n } from '../i18n/useI18n'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { uploadAvatar } from '../firebase/storage'
import { signInWithGoogle, signOut } from '../firebase/auth'
import {
  incrementUsernameChanges, USERNAME_CHANGE_COST, xpRequired, resetProfile,
} from '../profile/profile'
import { updateUsername, isUsernameAvailable, getUserById, getReferrals, type ReferralEntry } from '../firebase/firestore'
import { Svg, Circle } from 'react-native-svg'

// ── Palette ───────────────────────────────────────────────────────────────────

const C = {
  bg:          '#0D0D1A',
  surface:     '#1A0D2E',
  card:        '#1E1635',
  brass:       '#C9A227',
  brassDim:    'rgba(201,162,39,0.18)',
  brassBorder: 'rgba(201,162,39,0.30)',
  bone:        '#F4ECD8',
  boneOff:     'rgba(244,236,216,0.60)',
  ghost:       'rgba(244,236,216,0.10)',
  red:         '#C0392B',
  green:       '#27AE60',
  ronda:       '#0E5C4A',
  dijouj:      '#8B1A4A',
} as const

// ── Avatars prédéfinis ────────────────────────────────────────────────────────

const PRESET_EMOJIS = [
  '🦁', '🐯', '🦊', '🐺', '🐻', '🐼',
  '🦅', '🦋', '🐉', '🦄', '🐬', '🦈',
  '🎭', '🃏', '🎴', '👑', '💎', '🔥',
  '⚡', '🌙', '🌟', '🏆', '🎯', '🗡️',
] as const

// ── Composant Avatar ──────────────────────────────────────────────────────────

interface AvatarDisplayProps {
  type: 'initial' | 'emoji' | 'image'
  initial: string
  emoji: string
  /** URI string (photo utilisateur) OU asset local require()'d (avatar de bot). */
  image: string | number
  size?: number
  /** Cadre premium équipé (défaut : 'none'). */
  frame?: string
  /** Si fourni → badge niveau laiton en bas de l'avatar. */
  level?: number
  /** XP actuel — affiche l'anneau de progression. */
  xp?: number
  /** XP requis pour le prochain niveau (xpRequired(level)). */
  xpMax?: number
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/**
 * Repli de compatibilité : certains profils de bot créés lors d'une itération
 * antérieure du système d'avatars ont stocké avatarImage sous une forme
 * "bot_f22"/"bot_m5" (identifiant genre+index) au lieu de l'URL statique
 * réelle. getOrCreateBotProfile auto-répare ces docs à la prochaine sélection
 * du bot par le matchmaking (voir botFallback.ts), mais un bot pas encore
 * re-sélectionné depuis ce fix reste affiché cassé entre-temps — on résout
 * donc aussi ce format ici, au rendu, en dernier recours.
 */
function resolveBotAvatarImage(image: string): string {
  const match = image.match(/^bot_(f|m)(\d+)$/)
  if (!match) return image
  const female = match[1] === 'f'
  const idx = parseInt(match[2], 10)
  const list = female ? FEMALE_AVATARS : MALE_AVATARS
  return list[idx] ?? list[0] ?? image
}

export function AvatarDisplay({ type, initial, emoji, image, size = 80, frame = 'none', level, xp, xpMax }: AvatarDisplayProps) {
  const radius   = size / 2
  const fontSize = type === 'emoji' ? size * 0.48 : size * 0.45

  // Anneau XP — géométrie
  const ringR   = size / 2 + 3.5
  const ringStW = 3
  const ringDia = ringR * 2 + ringStW
  const ringOff = (ringDia - size) / 2
  const circ    = 2 * Math.PI * ringR

  const dashAnim = useRef(new Animated.Value(circ)).current
  const hasXp    = xp !== undefined && !!xpMax

  useEffect(() => {
    if (!hasXp) return
    const target = circ * (1 - Math.min((xp as number) / (xpMax as number), 1))
    dashAnim.setValue(circ)
    Animated.timing(dashAnim, { toValue: Math.max(0, target), duration: 600, useNativeDriver: false }).start()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xp, xpMax])

  const nearFull  = hasXp && (xp as number) >= (xpMax as number)
  const ringColor = nearFull ? '#27AE60' : '#C9A227'

  // NB : image peut être un number (asset require()'d, ex. avatar de bot) — 0
  // est une valeur légitime mais falsy en JS, donc `&& image` seul le rejette
  // à tort. On vérifie explicitement l'absence plutôt que la « vérité ».
  const hasImage = image !== '' && image !== undefined && image !== null
  const resolvedImage = typeof image === 'string' ? resolveBotAvatarImage(image) : image
  const inner = (type === 'image' && hasImage) ? (
    <View style={[av.circle, { width: size, height: size, borderRadius: radius }]}>
      <Image
        source={typeof resolvedImage === 'number' ? resolvedImage : { uri: resolvedImage }}
        style={{ width: size, height: size, borderRadius: radius }}
        resizeMode="cover"
      />
    </View>
  ) : (
    <View style={[av.circle, { width: size, height: size, borderRadius: radius }]}>
      <Text style={[av.text, { fontSize, lineHeight: size }]}>
        {type === 'emoji' && emoji ? emoji : initial}
      </Text>
    </View>
  )

  const avatar = frame === 'none' ? inner : <FramedAvatar frame={frame} size={size}>{inner}</FramedAvatar>

  if (level === undefined && !hasXp) return avatar

  return (
    <View style={av.withLevel}>
      {avatar}

      {hasXp && (
        <View pointerEvents="none" style={[av.ringWrap, { width: ringDia, height: ringDia, top: -ringOff, left: -ringOff }]}>
          <Svg width={ringDia} height={ringDia}>
            <Circle
              cx={ringDia / 2} cy={ringDia / 2} r={ringR}
              stroke="rgba(244,236,216,0.12)" strokeWidth={ringStW} fill="none"
            />
            <AnimatedCircle
              cx={ringDia / 2} cy={ringDia / 2} r={ringR}
              stroke={ringColor} strokeWidth={ringStW} fill="none"
              strokeDasharray={circ}
              strokeDashoffset={dashAnim as unknown as number}
              strokeLinecap="round"
              rotation={-90}
              originX={ringDia / 2}
              originY={ringDia / 2}
            />
          </Svg>
        </View>
      )}

      {level !== undefined && (
        <View style={av.levelWrap}>
          <View style={av.levelBadge}>
            <Text style={av.levelTxt}>{level}</Text>
          </View>
        </View>
      )}
    </View>
  )
}

/** Anneau (cadre) autour de l'avatar, avec lueur animée. */
function FramedAvatar({ frame, size, children }: { frame: string; size: number; children: ReactNode }) {
  const def = frameDef(frame)
  const ringSize = size + def.width * 2
  const glow = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    if (!def.animated) return
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1,   duration: 900, useNativeDriver: false }),
      Animated.timing(glow, { toValue: 0.4, duration: 900, useNativeDriver: false }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [def.animated, glow])

  const ringColors = (def.ring.length > 1 ? def.ring : [def.ring[0], def.ring[0]]) as [string, string, ...string[]]

  return (
    <Animated.View
      style={{
        width: ringSize, height: ringSize, borderRadius: ringSize / 2,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: def.glow, shadowOpacity: glow, shadowRadius: 12,
        shadowOffset: { width: 0, height: 0 }, elevation: 10,
      }}
    >
      <LinearGradient
        colors={ringColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', width: ringSize, height: ringSize, borderRadius: ringSize / 2 }}
      />
      {children}
    </Animated.View>
  )
}

const av = StyleSheet.create({
  circle: {
    backgroundColor: 'rgba(201,162,39,0.18)',
    borderWidth: 2, borderColor: '#C9A227',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  text: { fontFamily: 'Cairo_600SemiBold', color: '#C9A227', textAlign: 'center' },
  withLevel: { alignSelf: 'flex-start' },
  ringWrap: { position: 'absolute' },
  levelWrap: {
    position: 'absolute', bottom: -6,
    left: 0, right: 0, alignItems: 'center',
  },
  levelBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#C9A227',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: '#0D0D1A',
  },
  levelTxt: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 9, lineHeight: 12, color: '#1C2622',
  },
})

// ── Screen ────────────────────────────────────────────────────────────────────

export function ProfileScreen() {
  const {
    username, gold,
    gamesPlayed, gamesWon,
    rondaPlayed, rondaWon,
    dijoujPlayed, dijoujWon,
    usernameChanges,
    avatarType, avatarEmoji, avatarImage,
    goldHistoryPublic, statsPublic, invisibleMode, avatarFrame,
    xp, level,
    setUsername, removeGold,
    setAvatarEmoji, setAvatarImage, clearAvatar,
    setGoldHistoryPublic, setStatsPublic, setInvisibleMode,
  } = useProfile()
  const { user }   = useAuth()
  const { t }      = useI18n()
  const { canInstall, install } = useInstallPrompt()

  const [editingUsername, setEditingUsername]   = useState(false)
  const [draft, setDraft]                       = useState('')
  const [saving, setSaving]                     = useState(false)
  const [usernameError, setUsernameError]       = useState<string | null>(null)
  const [authLoading, setAuthLoading]           = useState(false)
  const [avatarModal, setAvatarModal]           = useState(false)
  const [avatarTab, setAvatarTab]               = useState<'emoji' | 'photo'>('emoji')
  const [photoLoading, setPhotoLoading]         = useState(false)

  // ── Parrainage ──────────────────────────────────────────────────────────
  const [referralCount, setReferralCount] = useState(0)
  const [linkCopied, setLinkCopied]       = useState(false)
  const referralLink = `https://ronda-virid.vercel.app?ref=${encodeURIComponent(username)}`

  // ── Trophées de tournoi (ex. 'Champion Semaine 28') ────────────────────
  // Écrits uniquement côté serveur (Admin SDK, distributePrizes) — jamais
  // par le profil local, donc lus ici directement depuis Firestore, comme
  // referralCount ci-dessus (même effet, pour éviter une 2e lecture du même
  // document).
  const [trophies, setTrophies] = useState<string[]>([])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    void getUserById(user.uid).then((u) => {
      if (cancelled || !u) return
      setReferralCount(u.referralCount)
      setTrophies(u.trophies)
    })
    return () => { cancelled = true }
  }, [user])

  const [showReferrals, setShowReferrals] = useState(false)
  const [refData, setRefData] = useState<{ completed: ReferralEntry[]; pending: ReferralEntry[] }>({ completed: [], pending: [] })
  const [refLoading, setRefLoading] = useState(false)

  const openReferrals = async () => {
    if (!user) return
    setShowReferrals(true)
    setRefLoading(true)
    const data = await getReferrals(user.uid)
    setRefData(data)
    setRefLoading(false)
  }

  const copyReferral = async () => {
    try {
      await Clipboard.setStringAsync(referralLink)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1800)
    } catch { /* presse-papiers indisponible */ }
  }

  const shareReferral = async () => {
    try {
      await Share.share({ message: `${t('referralDesc')}\n${referralLink}` })
    } catch { /* partage annulé */ }
  }

  const isFreeChange  = usernameChanges === 0
  const canAfford     = isFreeChange || gold >= USERNAME_CHANGE_COST
  const initial       = username ? username[0]?.toUpperCase() : '?'

  const winRate      = gamesPlayed  > 0 ? Math.round((gamesWon      / gamesPlayed)  * 100) : 0
  const rondaWinRate = rondaPlayed  > 0 ? Math.round((rondaWon      / rondaPlayed)  * 100) : 0
  const dijoujWinRate = dijoujPlayed > 0 ? Math.round((dijoujWon    / dijoujPlayed) * 100) : 0

  // ── Édition pseudo ────────────────────────────────────────────────────────

  const openUsernameEditor = () => { setDraft(username); setUsernameError(null); setEditingUsername(true) }

  const saveUsername = async () => {
    const clean = draft.trim()
    if (clean.length < 2 || saving || !canAfford) return
    if (clean === username) { setEditingUsername(false); return }
    setSaving(true); setUsernameError(null)
    try {
      if (user) {
        const ok = await isUsernameAvailable(clean, user.uid)
        if (!ok) { setUsernameError(t('usernameTaken')); return }
      }
      if (!isFreeChange) removeGold(USERNAME_CHANGE_COST)
      setUsername(clean)
      incrementUsernameChanges()
      if (user) void updateUsername(user.uid, clean).catch(() => {})
      setEditingUsername(false)
    } finally { setSaving(false) }
  }

  // ── Photo picker ──────────────────────────────────────────────────────────

  // Applique une photo choisie : upload dans Firebase Storage (URL persistante,
  // légère, partagée entre appareils). Repli local (data URI) si invité/échec.
  const applyPickedPhoto = async (asset: { base64?: string | null; uri: string }) => {
    if (user?.uid && asset.base64) {
      try {
        const url = await uploadAvatar(user.uid, asset.base64)
        setAvatarImage(url)
      } catch {
        setAvatarImage(`data:image/jpeg;base64,${asset.base64}`)
      }
    } else {
      setAvatarImage(asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri)
    }
    setAvatarModal(false)
  }

  const pickPhoto = async () => {
    setPhotoLoading(true)
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        setPhotoLoading(false)
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.3,
        base64: true,
      })
      if (!result.canceled && result.assets[0]) {
        await applyPickedPhoto(result.assets[0])
      }
    } finally { setPhotoLoading(false) }
  }

  const takePhoto = async () => {
    setPhotoLoading(true)
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (!perm.granted) { setPhotoLoading(false); return }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.3,
        base64: true,
      })
      if (!result.canceled && result.assets[0]) {
        await applyPickedPhoto(result.assets[0])
      }
    } finally { setPhotoLoading(false) }
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  const handleSignIn = async () => {
    setAuthLoading(true)
    try { await signInWithGoogle() } catch { } finally { setAuthLoading(false) }
  }

  const handleSignOut = async () => {
    setAuthLoading(true)
    try {
      await signOut()
      await resetProfile()
    } finally {
      setAuthLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>

      {/* ── Modal édition pseudo ──────────────────────────────── */}
      <Modal visible={editingUsername} transparent animationType="fade" onRequestClose={() => setEditingUsername(false)}>
        <View style={s.backdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>{t('yourUsername')}</Text>
            <TextInput
              style={s.modalInput}
              value={draft}
              onChangeText={v => setDraft(v.slice(0, 16))}
              placeholder={t('usernamePlaceholder')}
              placeholderTextColor={C.boneOff}
              maxLength={16}
              autoFocus autoCorrect={false}
            />
            <Text style={s.modalHint}>{t('usernameMaxChars')}</Text>
            {isFreeChange
              ? <Text style={s.costFree}>{t('firstChangeFree')}</Text>
              : <Text style={s.costPaid}>{t('changeCost').replace('{n}', String(USERNAME_CHANGE_COST))}</Text>
            }
            {usernameError && <Text style={s.errTxt}>{usernameError}</Text>}
            <View style={s.modalRow}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setEditingUsername(false)}>
                <Text style={s.modalCancelTxt}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalSave, (draft.trim().length < 2 || !canAfford || saving) && s.disabled]}
                disabled={draft.trim().length < 2 || !canAfford || saving}
                onPress={() => { void saveUsername() }}
              >
                <Text style={s.modalSaveTxt}>
                  {saving ? t('verifying') : !canAfford
                    ? t('insufficientGold').replace('{n}', String(USERNAME_CHANGE_COST))
                    : t('save')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal sélecteur d'avatar ──────────────────────────── */}
      <Modal visible={avatarModal} transparent animationType="slide" onRequestClose={() => setAvatarModal(false)}>
        <View style={s.backdrop}>
          <View style={[s.modalCard, s.avatarModalCard]}>

            <View style={s.avatarModalHeader}>
              <Text style={s.modalTitle}>Choisir un avatar</Text>
              <TouchableOpacity onPress={() => setAvatarModal(false)} style={s.closeBtn}>
                <Text style={s.closeBtnTxt}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Onglets */}
            <View style={s.tabs}>
              <TouchableOpacity
                style={[s.tab, avatarTab === 'emoji' && s.tabActive]}
                onPress={() => setAvatarTab('emoji')}
              >
                <Text style={[s.tabTxt, avatarTab === 'emoji' && s.tabTxtActive]}>Émojis</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tab, avatarTab === 'photo' && s.tabActive]}
                onPress={() => setAvatarTab('photo')}
              >
                <Text style={[s.tabTxt, avatarTab === 'photo' && s.tabTxtActive]}>Ma photo</Text>
              </TouchableOpacity>
            </View>

            {avatarTab === 'emoji' ? (
              <>
                <View style={s.emojiGrid}>
                  {PRESET_EMOJIS.map(em => (
                    <TouchableOpacity
                      key={em}
                      style={[s.emojiBtn, avatarType === 'emoji' && avatarEmoji === em && s.emojiBtnActive]}
                      onPress={() => { setAvatarEmoji(em); setAvatarModal(false) }}
                      activeOpacity={0.7}
                    >
                      <Text style={s.emojiChar}>{em}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {avatarType !== 'initial' && (
                  <TouchableOpacity style={s.resetBtn} onPress={() => { clearAvatar(); setAvatarModal(false) }}>
                    <Text style={s.resetBtnTxt}>Revenir aux initiales</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <View style={s.photoSection}>
                <AvatarDisplay
                  type={avatarType} initial={initial}
                  emoji={avatarEmoji} image={avatarImage} size={88}
                />
                <Text style={s.photoHint}>Choisir depuis…</Text>
                <TouchableOpacity
                  style={[s.photoBtn, photoLoading && s.disabled]}
                  onPress={() => { void pickPhoto() }}
                  disabled={photoLoading}
                  activeOpacity={0.8}
                >
                  {photoLoading
                    ? <ActivityIndicator color="#1C2622" />
                    : <Text style={s.photoBtnTxt}>📷 Galerie photo</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.photoBtn, s.photoBtnAlt, photoLoading && s.disabled]}
                  onPress={() => { void takePhoto() }}
                  disabled={photoLoading}
                  activeOpacity={0.8}
                >
                  <Text style={s.photoBtnAltTxt}>📸 Prendre une photo</Text>
                </TouchableOpacity>
                {avatarType !== 'initial' && (
                  <TouchableOpacity style={s.resetBtn} onPress={() => { clearAvatar(); setAvatarModal(false) }}>
                    <Text style={s.resetBtnTxt}>Supprimer l'avatar</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

          </View>
        </View>
      </Modal>

      {/* ── Contenu ───────────────────────────────────────────── */}
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Avatar + pseudo ───────────────────────────────────── */}
        <View style={s.avatarSection}>
          <View style={s.avatarHalo} />
          <TouchableOpacity onPress={() => setAvatarModal(true)} activeOpacity={0.85} style={s.avatarWrap}>
            <AvatarDisplay
              type={avatarType} initial={initial}
              emoji={avatarEmoji} image={avatarImage} size={88}
              frame={avatarFrame}
              level={level}
              xp={xp} xpMax={xpRequired(level)}
            />
            <View style={s.avatarEditBadge}>
              <Text style={s.avatarEditIcon}>✎</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={s.usernameRow} onPress={openUsernameEditor} activeOpacity={0.7}>
            <Text style={s.usernameText}>{username || '…'}</Text>
            <Text style={s.editIcon}>✎</Text>
          </TouchableOpacity>
          {user && <Text style={s.emailText}>{user.email}</Text>}
          {trophies.length > 0 && (
            <View style={s.trophyRow}>
              {trophies.map((tr) => (
                <Text key={tr} style={s.trophyBadge}>🏆 {tr}</Text>
              ))}
            </View>
          )}
        </View>

        {/* ── Niveau & XP ────────────────────────────────────────── */}
        <View style={s.card}>
          <View style={s.levelRow}>
            <Text style={s.levelBadge}>⭐ {t('level')} {level}</Text>
            <Text style={s.xpTxt}>
              {t('xpProgress').replace('{xp}', String(xp)).replace('{max}', String(xpRequired(level)))}
            </Text>
          </View>
          <View style={s.xpBarTrack}>
            <View style={[s.xpBarFill, { width: `${Math.min(100, Math.round((xp / xpRequired(level)) * 100))}%` as `${number}%` }]} />
          </View>
        </View>

        {/* ── Or ────────────────────────────────────────────────── */}
        <View style={s.card}>
          <View style={s.cardRow}>
            <View>
              <Text style={s.cardLabel}>Solde d'or</Text>
              <Text style={s.goldAmount}>🪙 {gold}</Text>
            </View>
            <TouchableOpacity
              style={s.shopBtn}
              onPress={() => router.push('/gold-shop' as Href)}
              activeOpacity={0.8}
            >
              <Text style={s.shopBtnTxt}>+ Obtenir</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={s.cosmeticsBtn}
            onPress={() => router.push('/cosmetics' as Href)}
            activeOpacity={0.8}
          >
            <Text style={s.cosmeticsBtnTxt}>🎨 {t('cosmetics')}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Parrainage ────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>{t('referral')}</Text>
          <Text style={s.referralDesc}>{t('referralDesc')}</Text>
          {user ? (
            <View style={s.referralBtns}>
              <TouchableOpacity style={s.referralCopyBtn} onPress={() => { void copyReferral() }} activeOpacity={0.85}>
                <Text style={s.referralCopyTxt}>{linkCopied ? t('referralSuccess') : t('referralCopy')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.referralShareBtn} onPress={() => { void shareReferral() }} activeOpacity={0.85}>
                <Text style={s.referralShareTxt}>{t('referralShare')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[s.authBtn, s.googleBtn]}
              onPress={() => { void handleSignIn() }}
              disabled={authLoading}
              activeOpacity={0.85}
            >
              {authLoading
                ? <ActivityIndicator color="#1C2622" />
                : <Text style={s.googleBtnTxt}>🔐 Se connecter pour parrainer</Text>}
            </TouchableOpacity>
          )}
          {user && (
            <Text style={s.referralCount}>{t('referralCount').replace('{n}', String(referralCount))}</Text>
          )}
          {user && (
            <TouchableOpacity style={s.referralViewBtn} onPress={() => { void openReferrals() }} activeOpacity={0.8}>
              <Text style={s.referralViewTxt}>{t('referralView')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Stats ─────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Statistiques</Text>
          <View style={[s.statRow, s.statRowTotal]}>
            <Text style={s.statGame}>Total</Text>
            <View style={s.statCols}>
              <StatCell label="Parties" value={gamesPlayed} />
              <StatCell label="Victoires" value={gamesWon} />
              <WinRateCell pct={winRate} />
            </View>
          </View>
          <View style={s.statRow}>
            <View style={[s.gameTag, { backgroundColor: C.ronda }]}>
              <Text style={s.gameTagTxt}>Ronda</Text>
            </View>
            <View style={s.statCols}>
              <StatCell label="Parties" value={rondaPlayed} />
              <StatCell label="Victoires" value={rondaWon} />
              <WinRateCell pct={rondaWinRate} />
            </View>
          </View>
          <View style={s.statRow}>
            <View style={[s.gameTag, { backgroundColor: C.dijouj }]}>
              <Text style={s.gameTagTxt}>Di Jouj</Text>
            </View>
            <View style={s.statCols}>
              <StatCell label="Parties" value={dijoujPlayed} />
              <StatCell label="Victoires" value={dijoujWon} />
              <WinRateCell pct={dijoujWinRate} />
            </View>
          </View>
        </View>

        {/* ── Confidentialité ───────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>{t('privacy')}</Text>
          <View style={s.toggleRow}>
            <Text style={s.toggleLabel}>{t('historyPublicToggle')}</Text>
            <Switch
              value={goldHistoryPublic}
              onValueChange={setGoldHistoryPublic}
              trackColor={{ false: 'rgba(244,236,216,0.20)', true: C.brass }}
              thumbColor={C.bone}
            />
          </View>
          <View style={s.toggleRow}>
            <Text style={s.toggleLabel}>{t('hideStats')}</Text>
            <Switch
              value={!statsPublic}
              onValueChange={(v) => setStatsPublic(!v)}
              trackColor={{ false: 'rgba(244,236,216,0.20)', true: C.brass }}
              thumbColor={C.bone}
            />
          </View>
          <View style={s.toggleRow}>
            <View style={s.toggleTextCol}>
              <Text style={s.toggleLabel}>👻 {t('invisibleMode')}</Text>
              <Text style={s.toggleDesc}>{t('invisibleModeDesc')}</Text>
            </View>
            <Switch
              value={invisibleMode}
              onValueChange={setInvisibleMode}
              trackColor={{ false: 'rgba(244,236,216,0.20)', true: C.brass }}
              thumbColor={C.bone}
            />
          </View>
        </View>

        {/* ── Compte ────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Compte</Text>

          {/* Installer la PWA */}
          <TouchableOpacity
            style={[s.authBtn, canInstall ? s.installBtn : s.installBtnDisabled]}
            onPress={() => { if (canInstall) install() }}
            disabled={!canInstall}
            activeOpacity={0.85}
          >
            <Text style={canInstall ? s.installBtnTxt : s.installBtnDisabledTxt}>
              {canInstall ? '📲 Installer l\'app' : '✅ Déjà installée ou non disponible'}
            </Text>
          </TouchableOpacity>

          {user ? (
            <TouchableOpacity
              style={[s.authBtn, s.signOutBtn]}
              onPress={() => { void handleSignOut() }}
              activeOpacity={0.8}
              disabled={authLoading}
            >
              {authLoading
                ? <ActivityIndicator color={C.bone} />
                : <Text style={s.authBtnTxt}>Se déconnecter</Text>
              }
            </TouchableOpacity>
          ) : (
            <>
              <Text style={s.authSub}>
                Connecte-toi pour sauvegarder ton profil sur tous tes appareils.
              </Text>
              <TouchableOpacity
                style={[s.authBtn, s.googleBtn]}
                onPress={() => { void handleSignIn() }}
                activeOpacity={0.8}
                disabled={authLoading}
              >
                {authLoading
                  ? <ActivityIndicator color="#1C2622" />
                  : <Text style={s.googleBtnTxt}>🔐 Continuer avec Google</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Modale « Mes parrainages » ────────────────────────── */}
      <Modal visible={showReferrals} transparent animationType="fade" onRequestClose={() => setShowReferrals(false)}>
        <View style={s.backdrop}>
          <View style={[s.modalCard, s.referralModalCard]}>
            <View style={s.avatarModalHeader}>
              <Text style={s.modalTitle}>🎁 {t('referral')}</Text>
              <TouchableOpacity onPress={() => setShowReferrals(false)} style={s.closeBtn}>
                <Text style={s.closeBtnTxt}>✕</Text>
              </TouchableOpacity>
            </View>

            {refLoading ? (
              <ActivityIndicator color={C.brass} style={{ marginVertical: 24 }} />
            ) : (refData.completed.length === 0 && refData.pending.length === 0) ? (
              <Text style={s.referralEmpty}>{t('referralNone')}</Text>
            ) : (
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {refData.completed.length > 0 && (
                  <>
                    <Text style={s.referralSection}>✅ {t('referralDone')}</Text>
                    {refData.completed.map((r) => (
                      <View key={r.uid} style={s.referralRow}>
                        <View style={s.referralRowMain}>
                          <Text style={s.referralName} numberOfLines={1}>{r.username}</Text>
                          <Text style={s.referralDate}>{fmtDate(r.date)}</Text>
                        </View>
                        <Text style={s.referralReward}>🪙 +{r.reward ?? 500}</Text>
                      </View>
                    ))}
                  </>
                )}
                {refData.pending.length > 0 && (
                  <>
                    <Text style={s.referralSection}>⏳ {t('referralPending')}</Text>
                    {refData.pending.map((r) => (
                      <View key={r.uid} style={s.referralRow}>
                        <View style={s.referralRowMain}>
                          <Text style={s.referralName} numberOfLines={1}>{r.username}</Text>
                          <Text style={s.referralDate}>{fmtDate(r.date)}</Text>
                        </View>
                        <Text style={s.referralWaiting}>⏳</Text>
                      </View>
                    ))}
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

/** Date courte JJ/MM (ou vide si absente). */
function fmtDate(d: Date | null): string {
  if (!d) return ''
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Sous-composant stat ───────────────────────────────────────────────────────

function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={sc.cell}>
      <Text style={sc.value}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  )
}

const sc = StyleSheet.create({
  cell:  { alignItems: 'center', flex: 1 },
  value: { fontFamily: 'Cairo_600SemiBold', fontSize: 18, color: '#C9A227' },
  label: { fontFamily: 'Cairo_400Regular', fontSize: 10, color: 'rgba(244,236,216,0.60)', letterSpacing: 0.5 },
})

function WinRateCell({ pct }: { pct: number }) {
  return (
    <View style={wrc.cell}>
      <Text style={wrc.value}>{pct}%</Text>
      <View style={wrc.track}>
        <View style={[wrc.fill, { width: `${Math.min(100, pct)}%` as `${number}%` }]} />
      </View>
      <Text style={wrc.label}>Taux</Text>
    </View>
  )
}

const wrc = StyleSheet.create({
  cell:  { alignItems: 'center', flex: 1 },
  value: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: '#C9A227' },
  track: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(201,162,39,0.15)', overflow: 'hidden', marginVertical: 2,
  },
  fill:  { height: 4, backgroundColor: '#C9A227', borderRadius: 2 },
  label: { fontFamily: 'Cairo_400Regular', fontSize: 10, color: 'rgba(244,236,216,0.60)', letterSpacing: 0.5 },
})

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, gap: 14, paddingTop: 16 },

  // Avatar section
  avatarSection: { alignItems: 'center', paddingVertical: 8, gap: 8 },
  avatarHalo: {
    position: 'absolute',
    width: 140, height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(201,162,39,0.06)',
    shadowColor: '#C9A227',
    shadowOpacity: 0.30,
    shadowRadius: 28,
    elevation: 8,
  },
  avatarWrap:    { position: 'relative' },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: C.brass, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.bg,
  },
  avatarEditIcon: { fontSize: 13, color: '#1C2622' },
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  usernameText: { fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: C.bone, letterSpacing: 0.3 },
  editIcon:     { fontSize: 16, color: C.boneOff },
  emailText:    { fontFamily: 'Cairo_400Regular', fontSize: 12, color: 'rgba(244,236,216,0.35)' },

  trophyRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 8 },
  trophyBadge: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 11, color: C.brass,
    backgroundColor: 'rgba(201,162,39,0.14)', borderWidth: 1, borderColor: 'rgba(201,162,39,0.35)',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },

  // Niveau & XP
  levelRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  levelBadge:  { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.brass },
  xpTxt:       { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.boneOff },
  xpBarTrack:  { height: 12, backgroundColor: 'rgba(201,162,39,0.15)', borderRadius: 6, overflow: 'hidden' },
  xpBarFill:   { height: 12, backgroundColor: C.brass, borderRadius: 6, shadowColor: '#C9A227', shadowOpacity: 0.70, shadowRadius: 8, elevation: 6 },

  // Cards
  card: {
    backgroundColor: C.card, borderRadius: 18, padding: 18, gap: 12,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.35)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 7,
  },
  cardRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: {
    fontFamily: 'Cairo_400Regular', fontSize: 10, color: C.boneOff,
    letterSpacing: 2.5, textTransform: 'uppercase',
  },
  goldAmount: { fontFamily: 'Cairo_600SemiBold', fontSize: 28, color: C.brass, marginTop: 2 },
  toggleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 },
  toggleTextCol: { flex: 1, paddingRight: 12 },
  toggleLabel: { flex: 1, fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.bone, paddingRight: 12 },
  toggleDesc: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff, marginTop: 2 },
  toggleHint: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.boneOff },
  shopBtn:    {
    backgroundColor: C.brassDim, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: C.brassBorder,
  },
  shopBtnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.brass },
  cosmeticsBtn: {
    marginTop: 12, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
    borderWidth: 1.5, borderColor: C.brassBorder, backgroundColor: 'rgba(201,162,39,0.06)',
  },
  cosmeticsBtnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.brass },
  referralDesc: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff, lineHeight: 18 },
  referralBtns: { flexDirection: 'row', gap: 10, marginTop: 2 },
  referralCopyBtn: { flex: 1, backgroundColor: C.brass, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  referralCopyTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: '#1C2622' },
  referralShareBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
    borderWidth: 1.5, borderColor: C.brass,
  },
  referralShareTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.brass },
  referralCount: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.boneOff, textAlign: 'center', marginTop: 2 },
  referralViewBtn: { paddingVertical: 8, alignItems: 'center' },
  referralViewTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.brass, textDecorationLine: 'underline' },
  referralModalCard: { maxHeight: '82%' },
  referralEmpty: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff, textAlign: 'center', paddingVertical: 20 },
  referralSection: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.bone,
    marginTop: 12, marginBottom: 6, letterSpacing: 0.3,
  },
  referralRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6,
  },
  referralRowMain: { flex: 1, gap: 2 },
  referralName: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.bone },
  referralDate: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff },
  referralReward: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.brass },
  referralWaiting: { fontSize: 16 },

  // Stats
  statRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: C.ghost,
  },
  statRowTotal: { borderTopWidth: 0, paddingTop: 0 },
  statGame:     { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.bone, width: 56 },
  gameTag:      { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, width: 56, alignItems: 'center' },
  gameTagTxt:   { fontFamily: 'Cairo_600SemiBold', fontSize: 11, color: '#fff' },
  statCols:     { flex: 1, flexDirection: 'row' },

  // Auth
  authSub:    { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13, lineHeight: 18 },
  authBtn:    { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  googleBtn:  { backgroundColor: C.brass },
  googleBtnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: '#1C2622', letterSpacing: 0.3 },
  signOutBtn: {
    backgroundColor: 'rgba(192,57,43,0.15)', borderWidth: 1, borderColor: 'rgba(192,57,43,0.4)',
  },
  authBtnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.bone },

  // Installer PWA
  installBtn:    { backgroundColor: C.brass },
  installBtnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: '#1C2622', letterSpacing: 0.3 },
  installBtnDisabled: {
    backgroundColor: 'rgba(244,236,216,0.08)', borderWidth: 1, borderColor: 'rgba(244,236,216,0.15)',
  },
  installBtnDisabledTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.boneOff },

  // Modal commun
  backdrop: {
    flex: 1, backgroundColor: 'rgba(13,13,26,0.92)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%', maxWidth: 380, backgroundColor: C.surface, borderRadius: 20, padding: 22, gap: 12,
    borderWidth: 1, borderColor: C.brassBorder,
  },
  avatarModalCard: { maxHeight: '88%' },
  avatarModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn:    { padding: 4 },
  closeBtnTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 18 },
  modalTitle: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.boneOff,
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  modalInput: {
    backgroundColor: 'rgba(0,0,0,0.30)', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 13,
    fontFamily: 'Cairo_400Regular', fontSize: 16, color: C.bone,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.20)',
  },
  modalHint: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff },
  costFree:  { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.green },
  costPaid:  { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.brass },
  errTxt:    { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.red },
  modalRow:  { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 6 },
  modalCancel:    { paddingVertical: 12, paddingHorizontal: 16 },
  modalCancelTxt: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff },
  modalSave:      { backgroundColor: C.brass, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 22 },
  modalSaveTxt:   { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: '#1C2622' },
  disabled:       { opacity: 0.4 },

  // Onglets
  tabs:       { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.20)', borderRadius: 10, padding: 3 },
  tab:        { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabActive:  { backgroundColor: C.brass },
  tabTxt:     { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.boneOff },
  tabTxtActive: { color: '#1C2622' },

  // Grille émojis
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  emojiBtn:  {
    width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(244,236,216,0.06)', borderWidth: 1.5, borderColor: 'rgba(244,236,216,0.10)',
  },
  emojiBtnActive: { borderColor: C.brass, backgroundColor: C.brassDim },
  emojiChar:      { fontSize: 26 },

  // Photo
  photoSection: { alignItems: 'center', gap: 14 },
  photoHint:    { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  photoBtn: {
    width: '100%', backgroundColor: C.brass, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  photoBtnTxt:    { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: '#1C2622' },
  photoBtnAlt:    {
    backgroundColor: 'transparent', borderWidth: 1.5, borderColor: C.brassBorder,
  },
  photoBtnAltTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.brass },
  resetBtn:    { paddingVertical: 8 },
  resetBtnTxt: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff, textDecorationLine: 'underline' },
})

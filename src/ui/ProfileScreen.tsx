import { useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Modal, TextInput, ActivityIndicator, Image, Switch,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, type Href } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { useProfile } from '../profile/useProfile'
import { useAuth } from '../firebase/auth'
import { useI18n } from '../i18n/useI18n'
import { signInWithGoogle, signOut } from '../firebase/auth'
import {
  incrementUsernameChanges, USERNAME_CHANGE_COST,
} from '../profile/profile'
import { updateUsername, isUsernameAvailable } from '../firebase/firestore'

// ── Palette ───────────────────────────────────────────────────────────────────

const C = {
  bg:          '#0D0D1A',
  surface:     '#1A0D2E',
  card:        '#1E1635',
  brass:       '#C9A227',
  brassDim:    'rgba(201,162,39,0.18)',
  brassBorder: 'rgba(201,162,39,0.30)',
  bone:        '#F4ECD8',
  boneOff:     'rgba(244,236,216,0.50)',
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
  image: string
  size?: number
}

export function AvatarDisplay({ type, initial, emoji, image, size = 80 }: AvatarDisplayProps) {
  const radius   = size / 2
  const fontSize = type === 'emoji' ? size * 0.48 : size * 0.45

  if (type === 'image' && image) {
    return (
      <View style={[av.circle, { width: size, height: size, borderRadius: radius }]}>
        <Image
          source={{ uri: image }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="cover"
        />
      </View>
    )
  }

  return (
    <View style={[av.circle, { width: size, height: size, borderRadius: radius }]}>
      <Text style={[av.text, { fontSize, lineHeight: size }]}>
        {type === 'emoji' && emoji ? emoji : initial}
      </Text>
    </View>
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
    goldHistoryPublic,
    setUsername, removeGold,
    setAvatarEmoji, setAvatarImage, clearAvatar,
    setGoldHistoryPublic,
  } = useProfile()
  const { user }   = useAuth()
  const { t }      = useI18n()

  const [editingUsername, setEditingUsername]   = useState(false)
  const [draft, setDraft]                       = useState('')
  const [saving, setSaving]                     = useState(false)
  const [usernameError, setUsernameError]       = useState<string | null>(null)
  const [authLoading, setAuthLoading]           = useState(false)
  const [avatarModal, setAvatarModal]           = useState(false)
  const [avatarTab, setAvatarTab]               = useState<'emoji' | 'photo'>('emoji')
  const [photoLoading, setPhotoLoading]         = useState(false)

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
        quality: 0.6,
        base64: true,
      })
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0]
        const uri   = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri
        setAvatarImage(uri)
        setAvatarModal(false)
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
        quality: 0.6,
        base64: true,
      })
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0]
        const uri   = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri
        setAvatarImage(uri)
        setAvatarModal(false)
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
    try { await signOut() } finally { setAuthLoading(false) }
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
          <TouchableOpacity onPress={() => setAvatarModal(true)} activeOpacity={0.85} style={s.avatarWrap}>
            <AvatarDisplay
              type={avatarType} initial={initial}
              emoji={avatarEmoji} image={avatarImage} size={88}
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

        {/* ── Stats ─────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Statistiques</Text>
          <View style={[s.statRow, s.statRowTotal]}>
            <Text style={s.statGame}>Total</Text>
            <View style={s.statCols}>
              <StatCell label="Parties" value={gamesPlayed} />
              <StatCell label="Victoires" value={gamesWon} />
              <StatCell label="Taux" value={`${winRate}%`} />
            </View>
          </View>
          <View style={s.statRow}>
            <View style={[s.gameTag, { backgroundColor: C.ronda }]}>
              <Text style={s.gameTagTxt}>Ronda</Text>
            </View>
            <View style={s.statCols}>
              <StatCell label="Parties" value={rondaPlayed} />
              <StatCell label="Victoires" value={rondaWon} />
              <StatCell label="Taux" value={`${rondaWinRate}%`} />
            </View>
          </View>
          <View style={s.statRow}>
            <View style={[s.gameTag, { backgroundColor: C.dijouj }]}>
              <Text style={s.gameTagTxt}>Di Jouj</Text>
            </View>
            <View style={s.statCols}>
              <StatCell label="Parties" value={dijoujPlayed} />
              <StatCell label="Victoires" value={dijoujWon} />
              <StatCell label="Taux" value={`${dijoujWinRate}%`} />
            </View>
          </View>
        </View>

        {/* ── Confidentialité ───────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>{t('historyPublicToggle')}</Text>
          <View style={s.toggleRow}>
            <Text style={s.toggleHint}>
              {goldHistoryPublic ? '🎁 ✓' : '🔒'}
            </Text>
            <Switch
              value={goldHistoryPublic}
              onValueChange={setGoldHistoryPublic}
              trackColor={{ false: 'rgba(244,236,216,0.20)', true: C.brass }}
              thumbColor={C.bone}
            />
          </View>
        </View>

        {/* ── Compte ────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Compte</Text>
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
    </SafeAreaView>
  )
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
  label: { fontFamily: 'Cairo_400Regular', fontSize: 10, color: 'rgba(244,236,216,0.50)', letterSpacing: 0.5 },
})

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, gap: 14, paddingTop: 16 },

  // Avatar section
  avatarSection: { alignItems: 'center', paddingVertical: 8, gap: 8 },
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

  // Cards
  card: {
    backgroundColor: C.card, borderRadius: 16, padding: 18, gap: 12,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.12)',
  },
  cardRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: {
    fontFamily: 'Cairo_400Regular', fontSize: 10, color: C.boneOff,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  goldAmount: { fontFamily: 'Cairo_600SemiBold', fontSize: 28, color: C.brass, marginTop: 2 },
  toggleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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

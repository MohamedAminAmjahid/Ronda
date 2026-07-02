import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Share, Linking, AppState, Modal, ActivityIndicator, type AppStateStatus,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useProfile } from '../profile/useProfile'
import { DAILY_TRANSFER_LIMIT } from '../profile/profile'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useI18n } from '../i18n/useI18n'
import { useAuth } from '../firebase/auth'
import { searchUserByUsername, type UserDoc } from '../firebase/firestore'
import { AvatarDisplay } from './ProfileScreen'
import { GoldTransferForm } from './GoldTransferForm'
import { PaymentModal } from '../payment/PaymentModal'
import { STRIPE_PACKS, type PackId } from '../payment/stripe'

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
const BMC_URL = 'https://buymeacoffee.com/amjahidmohamedamin'

const SHARE_KEY = 'ronda_share_count'
const FB_KEY = 'ronda_fb_claimed'
const IG_KEY = 'ronda_ig_claimed'
const VIDEO_KEY = 'ronda_video_count'

const SHARE_DAILY_LIMIT = 3
const SHARE_REWARD = 100
const FOLLOW_REWARD = 300
const VIDEO_DAILY_LIMIT = 3
const VIDEO_REWARD = 50
const VIDEO_SECONDS = 30

/** Date du jour au format YYYY-MM-DD (suffisant pour le quota quotidien). */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// Pack de référence pour le prix d'un montant personnalisé.
const REF_GOLD = 500
const REF_PRICE = 2.0
const MIN_CUSTOM_GOLD = 500

/** Prix proportionnel au pack de référence, arrondi à 2 décimales. */
function customPrice(gold: number): number {
  return Math.round((gold / REF_GOLD) * REF_PRICE * 100) / 100
}

interface Props {
  onBack: () => void
}

export function GoldShopScreen({ onBack }: Props) {
  const { t } = useI18n()
  const { gold, addGold } = useProfile()

  const [shareCount, setShareCount] = useState(0)
  const [fbClaimed, setFbClaimed] = useState(false)
  const [igClaimed, setIgClaimed] = useState(false)
  const [customGold, setCustomGold] = useState('')

  // Paiement Stripe.
  const [payPack, setPayPack] = useState<{ id: PackId; gold: number; label: string } | null>(null)

  // Plateforme dont on attend le retour (pour proposer la récompense au retour app).
  const [pendingClaim, setPendingClaim] = useState<null | 'fb' | 'ig'>(null)
  const [askClaim, setAskClaim] = useState<null | 'fb' | 'ig'>(null)
  const appState = useRef<AppStateStatus>(AppState.currentState)

  // Pub récompensée (simulation web).
  const [videoCount, setVideoCount] = useState(0)
  const [showVideo, setShowVideo] = useState(false)
  const [videoSecs, setVideoSecs] = useState(VIDEO_SECONDS)
  const [videoRewarded, setVideoRewarded] = useState(false)

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
        const rawVid = await AsyncStorage.getItem(VIDEO_KEY)
        if (rawVid) {
          const parsed = JSON.parse(rawVid) as { count?: number; date?: string }
          setVideoCount(parsed.date === todayStr() ? (parsed.count ?? 0) : 0)
        }
      } catch {
        // stockage indisponible — valeurs par défaut
      }
    })()
  }, [])

  // Compte à rebours de la pub : décrémente chaque seconde, crédite à 0.
  useEffect(() => {
    if (!showVideo || videoRewarded) return
    if (videoSecs <= 0) {
      setVideoRewarded(true)
      addGold(VIDEO_REWARD)
      const next = videoCount + 1
      setVideoCount(next)
      void AsyncStorage.setItem(VIDEO_KEY, JSON.stringify({ count: next, date: todayStr() })).catch(() => {})
      return
    }
    const tid = setTimeout(() => setVideoSecs((s) => s - 1), 1000)
    return () => clearTimeout(tid)
  }, [showVideo, videoSecs, videoRewarded, videoCount, addGold])

  const openVideo = () => {
    if (videoCount >= VIDEO_DAILY_LIMIT) return
    setVideoSecs(VIDEO_SECONDS)
    setVideoRewarded(false)
    setShowVideo(true)
  }

  // Fermeture anticipée (✕) → sans récompense.
  const closeEarly = () => { setShowVideo(false) }

  // Fermeture après récompense (bouton de confirmation).
  const closeVideo = () => {
    if (!videoRewarded) return
    setShowVideo(false)
  }

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
      const result = await Share.share({ message: `🎴 ${GAME_URL}` })
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

  const customNum = parseInt(customGold, 10) || 0
  const customValid = customNum >= MIN_CUSTOM_GOLD

  // ── Rendu ─────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>
        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>{t('back')}</Text>
          </TouchableOpacity>
          <View style={s.headerRow}>
            <Text style={s.title}>{t('shop')}</Text>
            <View style={s.goldPill}>
              <Text style={s.goldCoin}>🪙</Text>
              <Text style={s.goldAmount}>{gold}</Text>
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* 0. Soutenir le développeur */}
          <View style={s.card}>
            <Text style={s.cardTitle}>{t('supportDev')}</Text>
            <Text style={s.cardDesc}>{t('supportDevDesc')}</Text>
            <View style={s.supportRow}>
              <TouchableOpacity
                style={[s.btnSecondary, s.supportBtn]}
                onPress={() => Linking.openURL(BMC_URL)}
              >
                <Text style={s.btnSecondaryTxt}>{t('supportCoffee')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnSecondary, s.supportBtn]}
                onPress={() => Linking.openURL(`${BMC_URL}?amount=500`)}
              >
                <Text style={s.btnSecondaryTxt}>{t('supportMeal')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Offrir un cadeau (simulation, illimité) */}
          <GiftTransferCard mode="gift" />

          {/* Envoyer du gold (gratuit, plafonné par jour) */}
          <GiftTransferCard mode="transfer" />

          {/* 1. Partager le jeu */}
          <View style={s.card}>
            <View style={s.cardHead}>
              <Text style={s.cardTitle}>{t('shareGame')}</Text>
              <Text style={s.reward}>🪙 +{SHARE_REWARD}</Text>
            </View>
            <Text style={s.cardDesc}>{t('shareGameDesc').replace('{n}', String(SHARE_DAILY_LIMIT))}</Text>
            <TouchableOpacity
              style={[s.btnPrimary, quotaReached && s.btnDisabled]}
              onPress={onShareGame}
              disabled={quotaReached}
            >
              <Text style={[s.btnPrimaryTxt, quotaReached && s.btnDisabledTxt]}>
                {quotaReached ? t('comeBackTomorrow') : t('shareGame')}
              </Text>
            </TouchableOpacity>
            <Text style={s.counter}>{t('todayCount').replace('{count}', String(shareCount)).replace('{limit}', String(SHARE_DAILY_LIMIT))}</Text>
          </View>

          {/* 2. Facebook */}
          <FollowCard
            label={t('followFb')}
            reward={FOLLOW_REWARD}
            claimed={fbClaimed}
            onPress={() => openFollow('fb')}
            claimedTxt={t('claimed')}
            onceTxt={t('followOnce')}
          />

          {/* 3. Instagram */}
          <FollowCard
            label={t('followIg')}
            reward={FOLLOW_REWARD}
            claimed={igClaimed}
            onPress={() => openFollow('ig')}
            claimedTxt={t('claimed')}
            onceTxt={t('followOnce')}
          />

          {/* Regarder une vidéo (pub récompensée — simulation web) */}
          <View style={s.card}>
            <View style={s.cardHead}>
              <Text style={s.cardTitle}>{t('watchVideo')}</Text>
              <Text style={s.reward}>🪙 +{VIDEO_REWARD}</Text>
            </View>
            <Text style={s.cardDesc}>{t('watchVideoDesc')}</Text>
            <TouchableOpacity
              style={[s.btnPrimary, videoCount >= VIDEO_DAILY_LIMIT && s.btnDisabled]}
              onPress={openVideo}
              disabled={videoCount >= VIDEO_DAILY_LIMIT}
            >
              <Text style={[s.btnPrimaryTxt, videoCount >= VIDEO_DAILY_LIMIT && s.btnDisabledTxt]}>
                {videoCount >= VIDEO_DAILY_LIMIT ? t('comeBackTomorrow') : t('watchVideo')}
              </Text>
            </TouchableOpacity>
            <Text style={s.counter}>
              {t('todayCount').replace('{count}', String(videoCount)).replace('{limit}', String(VIDEO_DAILY_LIMIT))}
            </Text>
          </View>

          {/* 4. Packs payants (Stripe) */}
          <Text style={s.sectionLabel}>{t('goldPacks')}</Text>
          <View style={s.packGrid}>
            {STRIPE_PACKS.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={s.pack}
                activeOpacity={0.82}
                onPress={() => setPayPack({ id: p.id, gold: p.gold, label: p.label })}
              >
                <Text style={s.packCoin}>🪙</Text>
                <Text style={s.packGold}>{p.gold}</Text>
                <Text style={s.packPrice}>{p.label}</Text>
                <View style={s.packBuyBtn}>
                  <Text style={s.packBuyBtnTxt}>{t('buyPack')}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Montant personnalisé */}
          <View style={s.customCard}>
            <Text style={s.customTitle}>{t('customAmount')}</Text>
            <View style={s.customInputRow}>
              <Text style={s.customCoin}>🪙</Text>
              <TextInput
                style={s.customInput}
                value={customGold}
                onChangeText={(t) => setCustomGold(t.replace(/[^0-9]/g, '').slice(0, 7))}
                placeholder={`min. ${MIN_CUSTOM_GOLD}`}
                placeholderTextColor={C.boneOff}
                keyboardType="number-pad"
                inputMode="numeric"
              />
            </View>
            {customGold.length > 0 && !customValid ? (
              <Text style={s.customErr}>{t('minGold').replace('{n}', String(MIN_CUSTOM_GOLD))}</Text>
            ) : (
              <Text style={s.customPrice}>
                {customValid
                  ? `${customNum} gold → ${customPrice(customNum).toFixed(2)} €`
                  : `${MIN_CUSTOM_GOLD} gold = ${REF_PRICE.toFixed(2)} €`}
              </Text>
            )}
            <View style={[s.packBtn, s.customBtn, !customValid && s.customBtnDisabled]}>
              <Text style={s.packBtnTxt}>{t('comingSoon')}</Text>
            </View>
          </View>

        </ScrollView>
      </View>

      {/* Confirmation de suivi (au retour dans l'app) */}
      <Modal visible={askClaim !== null} transparent animationType="fade" onRequestClose={() => setAskClaim(null)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>{t('followConfirmTitle')}</Text>
            <Text style={s.modalText}>{t('followConfirmMsg').replace('{n}', String(FOLLOW_REWARD))}</Text>
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setAskClaim(null)}>
                <Text style={s.modalCancelTxt}>{t('no')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalSave} onPress={confirmFollow}>
                <Text style={s.modalSaveTxt}>{t('yes')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Paiement Stripe */}
      {payPack && (
        <PaymentModal
          visible
          packId={payPack.id}
          gold={payPack.gold}
          priceLabel={payPack.label}
          onClose={() => setPayPack(null)}
          onSuccess={(g) => { addGold(g); setPayPack(null) }}
        />
      )}

      {/* Pub récompensée (simulation) */}
      <Modal visible={showVideo} transparent animationType="fade" onRequestClose={closeEarly}>
        <View style={s.modalBackdrop}>
          <View style={s.adCard}>

            {/* ✕ toujours visible — quitte sans créditer */}
            <TouchableOpacity style={s.adXBtn} onPress={closeEarly} hitSlop={10}>
              <Text style={s.adXTxt}>✕</Text>
            </TouchableOpacity>

            {videoRewarded ? (
              <>
                <Text style={s.adEmoji}>🎉</Text>
                <Text style={s.adReward}>{t('adRewardMsg').replace('{n}', String(VIDEO_REWARD))}</Text>
                <TouchableOpacity style={s.modalSave} onPress={closeVideo}>
                  <Text style={s.modalSaveTxt}>{t('adClose')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={s.adPlayIcon}>📺</Text>
                <Text style={s.adWatchFull}>{t('adWatchFull').replace('{n}', String(VIDEO_REWARD))}</Text>
                <Text style={s.adWatching}>{t('adWatching')}</Text>
                <View style={s.adBarTrack}>
                  <View style={[s.adBarFill, { width: `${((VIDEO_SECONDS - videoSecs) / VIDEO_SECONDS) * 100}%` }]} />
                </View>
                <View style={[s.adCloseBtn, s.btnDisabled]}>
                  <Text style={s.adCloseDisabledTxt}>
                    {t('adCloseIn').replace('{n}', String(videoSecs))}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

// ── Carte « offrir un cadeau » / « envoyer du gold » ────────────────────────────

function GiftTransferCard({ mode }: { mode: 'gift' | 'transfer' }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const { giftGold, gold, giftCost } = useProfile()

  const [search, setSearch]         = useState('')
  const [searching, setSearching]   = useState(false)
  const [result, setResult]         = useState<UserDoc | null>(null)
  const [giftAmount, setGiftAmount] = useState(0)
  const [sending, setSending]       = useState(false)
  const [errMsg, setErrMsg]         = useState<string | null>(null)
  const [okMsg, setOkMsg]           = useState<string | null>(null)

  const reset = () => {
    setResult(null); setSearch(''); setGiftAmount(0)
  }

  const doSearch = async () => {
    if (!search.trim()) return
    setSearching(true); setResult(null); setErrMsg(null); setOkMsg(null)
    try {
      const u = await searchUserByUsername(search)
      if (!u)                              setErrMsg(t('noPlayerFound'))
      else if (user && u.uid === user.uid) setErrMsg(t('thatIsYou'))
      else                                 setResult(u)
    } catch (e) {
      console.error('[GiftTransferCard] recherche impossible:', e)
      setErrMsg(t('searchFailed'))
    } finally {
      setSearching(false)
    }
  }

  const doGift = async () => {
    if (!result || giftAmount <= 0 || sending) return
    setSending(true); setErrMsg(null)
    try {
      await giftGold(result.uid, giftAmount, result.username)
      setOkMsg(t('giftSuccess').replace('{n}', String(giftAmount)).replace('{name}', result.username))
      reset()
    } catch (e) {
      console.error('[GiftTransferCard] échec du cadeau:', e)
      setErrMsg(t('transferFailed'))
    } finally {
      setSending(false)
    }
  }

  const title = mode === 'gift' ? `🎁 ${t('giftCardTitle')}` : `💸 ${t('sendCardTitle')}`
  const desc  = mode === 'gift' ? t('giftCardDesc') : t('sendCardDesc').replace('{max}', String(DAILY_TRANSFER_LIMIT))

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{title}</Text>
      <Text style={s.cardDesc}>{desc}</Text>

      {/* Recherche d'un joueur par pseudo */}
      <View style={s.searchRow}>
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={(v) => { setSearch(v); setOkMsg(null); setErrMsg(null) }}
          placeholder={t('exactUsername')}
          placeholderTextColor={C.boneOff}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={doSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={s.btnSearch} onPress={doSearch} disabled={searching}>
          {searching
            ? <ActivityIndicator color={C.ink} size="small" />
            : <Text style={s.btnSearchTxt}>{t('searchBtn')}</Text>}
        </TouchableOpacity>
      </View>

      {result && (
        <View style={s.resultBox}>
          <View style={s.resultRow}>
            <AvatarDisplay
              type={(result.avatarType ?? 'initial') as 'initial' | 'emoji' | 'image'}
              initial={result.username?.[0]?.toUpperCase() ?? '?'}
              emoji={result.avatarEmoji ?? ''}
              image={result.avatarImage ?? ''}
              size={36}
            />
            <Text style={s.resultName} numberOfLines={1}>{result.username}</Text>
          </View>

          {mode === 'gift' ? (
            <>
              <Text style={s.amountLabel}>{t('giftAmountLabel')}</Text>
              <View style={s.chipRow}>
                {STRIPE_PACKS.map((p) => (
                  <TouchableOpacity
                    key={p.gold}
                    style={[s.chip, giftAmount === p.gold && s.chipActive]}
                    onPress={() => setGiftAmount(p.gold)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.chipTxt, giftAmount === p.gold && s.chipTxtActive]}>🪙 {p.gold}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {giftAmount > 0 && (
                <Text style={s.costLine}>
                  {t('giftCostLine').replace('{n}', String(giftAmount)).replace('{c}', String(giftCost(giftAmount)))}
                </Text>
              )}
              {(() => {
                const cost = giftCost(giftAmount)
                const cannotAfford = giftAmount > 0 && gold < cost
                const disabled = giftAmount <= 0 || sending || cannotAfford
                return (
                  <TouchableOpacity
                    style={[s.btnPrimary, disabled && s.btnDisabled]}
                    onPress={doGift}
                    disabled={disabled}
                  >
                    <Text style={[s.btnPrimaryTxt, disabled && s.btnDisabledTxt]}>
                      {sending ? '…' : cannotAfford ? t('insufficientBalance') : t('giftAction')}
                    </Text>
                  </TouchableOpacity>
                )
              })()}
              {errMsg && <Text style={s.errMsg}>{errMsg}</Text>}
              {okMsg  && <Text style={s.okMsg}>{okMsg}</Text>}
            </>
          ) : (
            <GoldTransferForm targetUid={result.uid} targetName={result.username} />
          )}
        </View>
      )}

      {/* Messages de recherche (avant qu'un joueur soit sélectionné) */}
      {!result && errMsg && <Text style={s.errMsg}>{errMsg}</Text>}
      {!result && okMsg  && <Text style={s.okMsg}>{okMsg}</Text>}
    </View>
  )
}

// ── Carte « suivre un réseau » ──────────────────────────────────────────────────

function FollowCard({
  label, reward, claimed, onPress, claimedTxt, onceTxt,
}: { label: string; reward: number; claimed: boolean; onPress: () => void; claimedTxt: string; onceTxt: string }) {
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>{label}</Text>
        <Text style={s.reward}>🪙 +{reward}</Text>
      </View>
      <Text style={s.cardDesc}>{onceTxt}</Text>
      {claimed ? (
        <View style={[s.btnPrimary, s.btnClaimed]}>
          <Text style={s.btnClaimedTxt}>{claimedTxt}</Text>
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

  supportRow: { flexDirection: 'row', gap: 10 },
  supportBtn: { flex: 1, paddingVertical: 12 },

  // ── Cadeau & transfert de gold ──
  quotaTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.brass },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontFamily: 'Cairo_400Regular', fontSize: 15, color: C.bone,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)',
  },
  btnSearch: {
    backgroundColor: C.brass, borderRadius: 10, paddingHorizontal: 18,
    minWidth: 64, alignItems: 'center', justifyContent: 'center',
  },
  btnSearchTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.ink },
  resultBox: {
    backgroundColor: 'rgba(0,0,0,0.20)', borderRadius: 12, padding: 12, gap: 10,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.18)',
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultName: { flex: 1, fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.bone },
  amountLabel: {
    fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff,
    letterSpacing: 1.2, textTransform: 'uppercase',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.22)', borderWidth: 1, borderColor: 'rgba(244,236,216,0.18)',
  },
  chipActive: { backgroundColor: C.brass, borderColor: C.brass },
  chipTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.bone },
  chipTxtActive: { color: C.ink },
  costLine: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.brass, textAlign: 'center' },
  errMsg: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: '#E74C3C', textAlign: 'center' },
  okMsg:  { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.brass, textAlign: 'center', lineHeight: 20 },

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
  packBuyBtn: {
    backgroundColor: C.brass, borderRadius: 9, paddingVertical: 9,
    paddingHorizontal: 14, marginTop: 4,
  },
  packBuyBtnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.ink },

  customCard: {
    backgroundColor: C.deep, borderRadius: 14, padding: 16, gap: 10, marginTop: 4,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.22)',
  },
  customTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.bone },
  customInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 10, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)',
  },
  customCoin: { fontSize: 18 },
  customInput: {
    flex: 1, paddingVertical: 13, fontFamily: 'Cairo_600SemiBold', fontSize: 18, color: C.bone,
  },
  customPrice: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.brass },
  customErr: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: '#E74C3C' },
  customBtn: { alignSelf: 'flex-start' },
  customBtnDisabled: { opacity: 0.45 },

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

  // Pub récompensée
  adCard: {
    width: '100%', maxWidth: 340, backgroundColor: '#101010', borderRadius: 18,
    padding: 26, paddingTop: 40, gap: 14, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.3)',
  },
  adXBtn: {
    position: 'absolute', top: 10, right: 12,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  adXTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 18, color: 'rgba(244,236,216,0.55)' },
  adWatchFull: {
    fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.brass,
    textAlign: 'center', lineHeight: 20,
  },
  adPlayIcon: { fontSize: 48, lineHeight: 56 },
  adEmoji:    { fontSize: 48, lineHeight: 56 },
  adWatching: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.bone },
  adReward:   { fontFamily: 'Cairo_600SemiBold', fontSize: 18, color: C.brass, textAlign: 'center' },
  adBarTrack: {
    width: '100%', height: 8, borderRadius: 4, overflow: 'hidden',
    backgroundColor: 'rgba(244,236,216,0.15)',
  },
  adBarFill: { height: '100%', backgroundColor: C.brass, borderRadius: 4 },
  adCloseBtn: {
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20,
    borderWidth: 1, borderColor: 'rgba(244,236,216,0.2)',
  },
  adCloseDisabledTxt: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: 'rgba(244,236,216,0.5)' },
})

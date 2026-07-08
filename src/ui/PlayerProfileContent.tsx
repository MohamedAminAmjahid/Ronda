import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native'
import { router, usePathname } from 'expo-router'
import { AvatarDisplay } from './ProfileScreen'
import { xpRequired } from '../profile/profile'
import { GoldTransferForm } from './GoldTransferForm'
import { GoldGiftForm } from './GoldGiftForm'
import { InviteToPlayModal } from './InviteToPlayModal'
import { useAuth } from '../firebase/auth'
import {
  getUserById, getGoldHistory, subscribeOnlineStatus, sendFriendRequest, getFriendStatus,
  type UserDoc, type FriendDoc, type GoldHistoryEntry, type PresenceInfo,
} from '../firebase/firestore'
import { PresenceDot, presenceLabel } from './PresenceDot'
import { useI18n } from '../i18n/useI18n'

// Écrans de partie : pendant une partie, « Inviter à jouer » n'a pas de sens
// (on ne peut pas lancer une 2e partie) → remplacé par « Ajouter ami ».
const IN_GAME = ['/game', '/dijouj', '/online', '/dijouj-online']

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
} as const

function winRate(played: number, won: number): number {
  return played > 0 ? Math.round((won / played) * 100) : 0
}

interface Props {
  uid?:  string
  name?: string
  /** Fermeture (contexte modale) : après l'ouverture d'un chat on referme. */
  onNavigateAway?: () => void
}

/**
 * Contenu du profil d'un joueur (avatar, stats, historique cadeaux, offrir/envoyer
 * du gold, inviter, message). Réutilisé par l'écran /friend-profile ET par la
 * modale de profil en cours de partie (PlayerProfileModal).
 */
export function PlayerProfileContent({ uid, name, onNavigateAway }: Props) {
  const { t } = useI18n()
  const { user } = useAuth()
  const pathname = usePathname()
  const isInGame = IN_GAME.some(p => pathname.startsWith(p))

  const [profile, setProfile] = useState<UserDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [history, setHistory] = useState<GoldHistoryEntry[]>([])
  const [presence, setPresence] = useState<PresenceInfo | null>(null)
  const [friendState, setFriendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [friendStatus, setFriendStatus] = useState<FriendDoc['status'] | null>(null)

  useEffect(() => {
    if (!uid) return
    const unsub = subscribeOnlineStatus(uid, setPresence)
    return unsub
  }, [uid])

  // Statut réel de l'amitié (moi → ce joueur) : conditionne « Inviter à jouer ».
  useEffect(() => {
    if (!user || !uid || uid === user.uid) { setFriendStatus(null); return }
    let cancelled = false
    void getFriendStatus(user.uid, uid)
      .then((st) => { if (!cancelled) setFriendStatus(st) })
      .catch(() => { if (!cancelled) setFriendStatus(null) })
    return () => { cancelled = true }
  }, [user, uid])

  useEffect(() => {
    if (!uid) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    setHistory([])
    void getUserById(uid)
      .then((u) => {
        if (cancelled) return
        setProfile(u)
        if (u?.goldHistoryPublic) {
          void getGoldHistory(uid).then((h) => { if (!cancelled) setHistory(h) })
        }
      })
      .catch(() => { if (!cancelled) setProfile(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [uid])

  const relativeTime = (d: Date | null): string => {
    if (!d) return t('timeNow')
    const min = Math.floor((Date.now() - d.getTime()) / 60000)
    if (min < 1)  return t('timeNow')
    if (min < 60) return t('timeMin').replace('{n}', String(min))
    const h = Math.floor(min / 60)
    if (h < 24)   return t('timeHour').replace('{n}', String(h))
    return t('timeDay').replace('{n}', String(Math.floor(h / 24)))
  }

  const displayName = profile?.username ?? (name ? decodeURIComponent(name) : '')
  const initial = displayName?.[0]?.toUpperCase() ?? '?'

  const isFriend = friendStatus === 'accepted'

  const handleAddFriend = async () => {
    if (!user || !profile || isFriend || friendState === 'sending' || friendState === 'sent') return
    setFriendState('sending')
    try {
      await sendFriendRequest(user.uid, profile.uid)
      setFriendState('sent')
    } catch {
      setFriendState('error')
    }
  }

  const friendDoc: FriendDoc | null = profile
    ? {
        uid: profile.uid,
        username: profile.username,
        status: 'accepted',
        avatarType: profile.avatarType,
        avatarEmoji: profile.avatarEmoji,
        avatarImage: profile.avatarImage,
      }
    : null

  if (loading) return <ActivityIndicator color={C.brass} style={{ marginTop: 40 }} />
  if (!profile) return <Text style={s.empty}>{t('profileNotFound')}</Text>

  return (
    <>
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>

        {/* ── Avatar + pseudo ── */}
        <View style={s.identity}>
          <View style={s.avatarWrap}>
            <AvatarDisplay
              type={(profile.avatarType ?? 'initial') as 'initial' | 'emoji' | 'image'}
              initial={initial}
              emoji={profile.avatarEmoji ?? ''}
              image={profile.avatarImage ?? ''}
              size={88}
              level={profile.level}
              xp={profile.xp} xpMax={xpRequired(profile.level)}
            />
            <PresenceDot info={presence} size={16} ring={C.table} />
          </View>
          <Text style={s.username} numberOfLines={1}>{profile.username}</Text>
          {(() => {
            const label = presenceLabel(presence, t, { hours: true })
            if (!label) return null
            return (
              <Text style={[s.presenceTxt, presence?.isOnline && s.presenceOnline]}>
                {presence?.isOnline ? '🟢' : '⚫'} {label}
              </Text>
            )
          })()}
        </View>

        {/* ── Stats ── */}
        <Text style={s.sectionLabel}>{t('statsTitle')}</Text>
        {profile.statsPublic === false ? (
          <View style={s.card}>
            <Text style={s.historyPrivate}>📊 {t('statsHidden')}</Text>
          </View>
        ) : (
          <View style={s.statsRow}>
            <StatCard
              title="🃏 RONDA"
              played={profile.rondaPlayed}
              won={profile.rondaWon}
              playedLbl={t('gamesPlayed')}
              wonLbl={t('gamesWon')}
              rateLbl={t('winRateLabel')}
            />
            <StatCard
              title="🎴 DI JOUJ"
              played={profile.dijoujPlayed}
              won={profile.dijoujWon}
              playedLbl={t('gamesPlayed')}
              wonLbl={t('gamesWon')}
              rateLbl={t('winRateLabel')}
            />
          </View>
        )}

        {/* ── Historique des cadeaux ── */}
        <Text style={s.sectionLabel}>{t('goldHistory')}</Text>
        {!profile.goldHistoryPublic ? (
          <View style={s.card}>
            <Text style={s.historyPrivate}>🔒 {t('historyPrivate')}</Text>
          </View>
        ) : history.length === 0 ? (
          <View style={s.card}>
            <Text style={s.historyEmpty}>{t('historyEmpty')}</Text>
          </View>
        ) : (
          <View style={s.card}>
            {history.map((h) => {
              const isReceived = h.toUid === profile.uid
              const other = isReceived ? h.fromName : h.toName
              return (
                <View key={h.id} style={s.histRow}>
                  <Text style={s.histIcon}>{isReceived ? '🎁' : '💸'}</Text>
                  <View style={s.histBody}>
                    <Text style={s.histName} numberOfLines={1}>{other || '—'}</Text>
                    <Text style={s.histMeta}>
                      {(isReceived ? t('received') : t('sent'))} · {relativeTime(h.createdAt)}
                    </Text>
                  </View>
                  <Text style={[s.histAmount, isReceived ? s.histReceived : s.histSent]}>
                    {isReceived ? '+' : '−'}{h.amount} 🪙
                  </Text>
                </View>
              )
            })}
          </View>
        )}

        {/* ── Offrir un pack (cadeau, illimité) ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>🎁 {t('giftCardTitle')}</Text>
          <Text style={s.cardDesc}>{t('giftCardDesc')}</Text>
          <GoldGiftForm targetUid={profile.uid} targetName={profile.username} />
        </View>

        {/* ── Envoyer du gold (transfert, gratuit/limité) ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>💸 {t('sendCardTitle')}</Text>
          <GoldTransferForm targetUid={profile.uid} targetName={profile.username} />
        </View>

        {/* ── Actions ── */}
        <View style={s.actions}>
          <TouchableOpacity
            style={s.actionBtn}
            onPress={() => {
              onNavigateAway?.()
              router.push(`/chat?friendUid=${profile.uid}&name=${encodeURIComponent(profile.username)}` as never)
            }}
            activeOpacity={0.85}
          >
            <Text style={s.actionBtnTxt}>{t('messageBtn')}</Text>
          </TouchableOpacity>
          {isInGame || !isFriend ? (
            // « Inviter à jouer » n'a de sens que si (a) on n'est pas déjà en
            // partie (on ne peut pas en lancer une 2e) ET (b) on est déjà ami
            // avec ce joueur (sinon → juste « Ajouter ami » d'abord).
            <TouchableOpacity
              style={s.actionBtnPrimary}
              onPress={() => { void handleAddFriend() }}
              disabled={friendState === 'sending' || friendState === 'sent'}
              activeOpacity={0.85}
            >
              <Text style={s.actionBtnPrimaryTxt}>
                {friendState === 'sent' ? '✓' : `➕ ${t('addFriend')}`}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={s.actionBtnPrimary}
              onPress={() => {
                // Bot : pas de vraie invitation possible → relance directement
                // une partie (matchmaking), sans jamais révéler que c'est un bot.
                if (profile.isBot) {
                  onNavigateAway?.()
                  router.push('/bet?game=ronda' as never)
                  return
                }
                setShowInvite(true)
              }}
              activeOpacity={0.85}
            >
              <Text style={s.actionBtnPrimaryTxt}>🎮 {t('inviteToPlay')}</Text>
            </TouchableOpacity>
          )}
        </View>

      </ScrollView>

      <InviteToPlayModal
        visible={showInvite}
        friend={friendDoc}
        onClose={() => setShowInvite(false)}
      />
    </>
  )
}

// ── Carte de stats par jeu ──────────────────────────────────────────────────────

function StatCard({
  title, played, won, playedLbl, wonLbl, rateLbl,
}: {
  title: string; played: number; won: number
  playedLbl: string; wonLbl: string; rateLbl: string
}) {
  return (
    <View style={s.statCard}>
      <Text style={s.statTitle}>{title}</Text>
      <View style={s.statLine}>
        <Text style={s.statValue}>{played}</Text>
        <Text style={s.statKey}>{playedLbl}</Text>
      </View>
      <View style={s.statLine}>
        <Text style={s.statValue}>{won}</Text>
        <Text style={s.statKey}>{wonLbl}</Text>
      </View>
      <View style={s.statLine}>
        <Text style={[s.statValue, s.statRate]}>{winRate(played, won)}%</Text>
        <Text style={s.statKey}>{rateLbl}</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  empty: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff, textAlign: 'center', marginTop: 40 },

  body: { paddingVertical: 12, gap: 16, paddingBottom: 32 },

  identity: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  avatarWrap: { position: 'relative' },
  username:    { fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: C.bone },
  presenceTxt: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff },
  presenceOnline: { color: '#27AE60' },

  sectionLabel: {
    fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.boneOff,
    letterSpacing: 1.5, textTransform: 'uppercase', marginLeft: 2,
  },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 14, padding: 14, gap: 8,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.18)',
  },
  statTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.bone, letterSpacing: 0.5, marginBottom: 2 },
  statLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  statValue: { fontFamily: 'Cairo_600SemiBold', fontSize: 20, color: C.bone },
  statRate: { color: C.brass },
  statKey: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff, textTransform: 'uppercase', letterSpacing: 0.5 },

  card: {
    backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 14, padding: 16, gap: 12,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.18)',
  },
  cardTitle: { fontFamily: 'Cairo_600SemiBold', fontSize: 17, color: C.bone },
  cardDesc: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff, lineHeight: 18 },

  historyPrivate: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff, textAlign: 'center', lineHeight: 20 },
  historyEmpty:   { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff, textAlign: 'center' },
  histRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(244,236,216,0.10)',
  },
  histIcon: { fontSize: 22 },
  histBody: { flex: 1, gap: 2 },
  histName: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.bone },
  histMeta: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff },
  histAmount: { fontFamily: 'Cairo_600SemiBold', fontSize: 15 },
  histReceived: { color: '#27AE60' },
  histSent:     { color: '#D98324' },

  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    borderWidth: 1.5, borderColor: C.brass, backgroundColor: 'rgba(201,162,39,0.10)',
  },
  actionBtnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.brass },
  actionBtnPrimary: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: C.brass,
  },
  actionBtnPrimaryTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.ink },
})

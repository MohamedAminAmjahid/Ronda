import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { AvatarDisplay } from './ProfileScreen'
import { GoldTransferForm } from './GoldTransferForm'
import { InviteToPlayModal } from './InviteToPlayModal'
import { getUserById, type UserDoc, type FriendDoc } from '../firebase/firestore'
import { useI18n } from '../i18n/useI18n'

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
  onBack: () => void
}

export function FriendProfileScreen({ onBack }: Props) {
  const { t } = useI18n()
  const { uid, name } = useLocalSearchParams<{ uid?: string; name?: string }>()

  const [profile, setProfile] = useState<UserDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)

  useEffect(() => {
    if (!uid) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    void getUserById(uid)
      .then((u) => { if (!cancelled) setProfile(u) })
      .catch(() => { if (!cancelled) setProfile(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [uid])

  const displayName = profile?.username ?? (name ? decodeURIComponent(name) : '')
  const initial = displayName?.[0]?.toUpperCase() ?? '?'

  // FriendDoc minimal pour la modale d'invitation.
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

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>
        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>{t('back')}</Text>
          </TouchableOpacity>
          <Text style={s.title}>{t('friendProfile')}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={C.brass} style={{ marginTop: 40 }} />
        ) : !profile ? (
          <Text style={s.empty}>{t('profileNotFound')}</Text>
        ) : (
          <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>

            {/* ── Avatar + pseudo ── */}
            <View style={s.identity}>
              <AvatarDisplay
                type={(profile.avatarType ?? 'initial') as 'initial' | 'emoji' | 'image'}
                initial={initial}
                emoji={profile.avatarEmoji ?? ''}
                image={profile.avatarImage ?? ''}
                size={88}
              />
              <Text style={s.username} numberOfLines={1}>{profile.username}</Text>
            </View>

            {/* ── Stats ── */}
            <Text style={s.sectionLabel}>{t('statsTitle')}</Text>
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

            {/* ── Envoyer du gold ── */}
            <View style={s.card}>
              <Text style={s.cardTitle}>💸 {t('sendCardTitle')}</Text>
              <GoldTransferForm targetUid={profile.uid} targetName={profile.username} />
            </View>

            {/* ── Actions ── */}
            <View style={s.actions}>
              <TouchableOpacity
                style={s.actionBtn}
                onPress={() => router.push(`/chat?friendUid=${profile.uid}&name=${encodeURIComponent(profile.username)}` as never)}
                activeOpacity={0.85}
              >
                <Text style={s.actionBtnTxt}>{t('messageBtn')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionBtnPrimary} onPress={() => setShowInvite(true)} activeOpacity={0.85}>
                <Text style={s.actionBtnPrimaryTxt}>🎮 {t('inviteToPlay')}</Text>
              </TouchableOpacity>
            </View>

          </ScrollView>
        )}
      </View>

      <InviteToPlayModal
        visible={showInvite}
        friend={friendDoc}
        onClose={() => setShowInvite(false)}
      />
    </SafeAreaView>
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
  root: { flex: 1, backgroundColor: C.table, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 460, paddingHorizontal: 18 },

  header: { paddingTop: 16, paddingBottom: 8, alignItems: 'center', gap: 6 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6 },
  backTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  title: { fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: C.bone, letterSpacing: 1, textTransform: 'uppercase' },

  empty: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff, textAlign: 'center', marginTop: 40 },

  body: { paddingVertical: 12, gap: 16, paddingBottom: 32 },

  identity: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  username: { fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: C.bone },

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

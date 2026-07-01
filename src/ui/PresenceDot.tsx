import { View, StyleSheet } from 'react-native'
import type { PresenceInfo } from '../firebase/firestore'
import type { TranslationKey } from '../i18n/translations'

const RECENT_MS = 5 * 60 * 1000  // « récemment en ligne » (< 5 min)
const GREEN = '#27AE60'
const ORANGE = '#E67E22'

/** Couleur du point de présence, ou null si hors-ligne depuis > 5 min. */
export function presenceColor(info?: PresenceInfo | null): string | null {
  if (!info) return null
  if (info.isOnline) return GREEN
  if (info.lastSeen && Date.now() - info.lastSeen.getTime() < RECENT_MS) return ORANGE
  return null
}

/** Libellé de présence localisé. `hours` : inclure « il y a X h » (profil), sinon null au-delà d'1 h. */
export function presenceLabel(
  info: PresenceInfo | null | undefined,
  t: (k: TranslationKey) => string,
  opts?: { hours?: boolean },
): string | null {
  if (!info) return null
  if (info.isOnline) return t('onlineNow')
  if (!info.lastSeen) return null
  const diffMin = Math.floor((Date.now() - info.lastSeen.getTime()) / 60000)
  if (diffMin < 1) return t('recentlyOnline')
  if (diffMin < 60) return t('lastSeenMin').replace('{n}', String(diffMin))
  const hours = Math.floor(diffMin / 60)
  if (opts?.hours) return t('lastSeenHour').replace('{n}', String(hours))
  return null
}

/** Pastille de présence, positionnée en bas à droite d'un avatar (conteneur relatif). */
export function PresenceDot({ info, size = 10, ring = '#0D0D1A' }: {
  info?: PresenceInfo | null
  size?: number
  ring?: string
}) {
  const color = presenceColor(info)
  if (!color) return null
  return (
    <View
      style={[
        s.dot,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderColor: ring },
      ]}
    />
  )
}

const s = StyleSheet.create({
  dot: { position: 'absolute', right: -1, bottom: -1, borderWidth: 2 },
})

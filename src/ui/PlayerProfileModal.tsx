import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { PlayerProfileContent } from './PlayerProfileContent'
import { useI18n } from '../i18n/useI18n'

const C = {
  table:   '#0E5C4A',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.55)',
} as const

interface Props {
  visible: boolean
  uid?:    string
  name?:   string
  onClose: () => void
}

/** Profil d'un joueur en modale (tap sur l'avatar de l'adversaire en partie). */
export function PlayerProfileModal({ visible, uid, name, onClose }: Props) {
  const { t } = useI18n()

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <View style={s.header}>
            <Text style={s.title}>{t('friendProfile')}</Text>
            <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={10}>
              <Text style={s.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* key={uid} : recharge le contenu quand on ouvre un autre profil. */}
          {visible && <PlayerProfileContent key={uid ?? 'none'} uid={uid} name={name} onNavigateAway={onClose} />}
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(6,20,15,0.86)', justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: C.table, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 18, paddingTop: 10, paddingBottom: 6,
    maxHeight: '90%',
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8,
  },
  title: { fontFamily: 'Cairo_600SemiBold', fontSize: 18, color: C.bone, letterSpacing: 1, textTransform: 'uppercase' },
  closeBtn: {
    position: 'absolute', right: 2, top: 4,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(244,236,216,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.boneOff },
})

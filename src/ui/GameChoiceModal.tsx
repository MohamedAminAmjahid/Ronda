import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native'
import { useI18n } from '../i18n/useI18n'

export type GameKey = 'ronda' | 'dijouj'

interface Props {
  visible:  boolean
  title:    string
  onChoose: (game: GameKey) => void
  onClose:  () => void
}

const C = {
  backdrop: 'rgba(0,0,0,0.88)',
  card:     '#1A0D2E',
  cardBdr:  'rgba(201,162,39,0.20)',
  ronda:    '#0E5C4A',
  rondaBdr: 'rgba(14,92,74,0.65)',
  dijouj:   '#2D0A1E',
  djAcc:    '#8B1A4A',
  djBdr:    'rgba(139,26,74,0.65)',
  brass:    '#C9A227',
  bone:     '#F4ECD8',
  boneOff:  'rgba(244,236,216,0.50)',
} as const

export function GameChoiceModal({ visible, title, onChoose, onClose }: Props) {
  const { t } = useI18n()
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>

          <Text style={s.title}>{title}</Text>

          <View style={s.buttons}>
            {/* 🃏 Ronda */}
            <TouchableOpacity
              style={[s.gameBtn, s.rondaBtn]}
              onPress={() => onChoose('ronda')}
              activeOpacity={0.85}
            >
              <Text style={s.gameEmoji}>🃏</Text>
              <Text style={[s.gameName, s.rondaName]}>RONDA</Text>
              <Text style={s.gameAr}>رُنْدة</Text>
            </TouchableOpacity>

            {/* 🎴 Di Jouj */}
            <TouchableOpacity
              style={[s.gameBtn, s.dijoujBtn]}
              onPress={() => onChoose('dijouj')}
              activeOpacity={0.85}
            >
              <Text style={s.gameEmoji}>🎴</Text>
              <Text style={[s.gameName, s.dijoujName]}>DI JOUJ</Text>
              <Text style={s.gameAr}>ديجوج</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={s.closeTxt}>{t('cancel')}</Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: C.backdrop,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 24,
    gap: 20,
    borderWidth: 1,
    borderColor: C.cardBdr,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 20,
  },
  title: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 13,
    color: C.boneOff,
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  buttons: { gap: 12 },
  gameBtn: {
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  rondaBtn: {
    backgroundColor: C.ronda,
    borderColor: C.rondaBdr,
    shadowColor: C.ronda,
  },
  dijoujBtn: {
    backgroundColor: C.dijouj,
    borderColor: C.djBdr,
    shadowColor: C.djAcc,
  },
  gameEmoji: { fontSize: 32, lineHeight: 36 },
  gameName: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 20,
    letterSpacing: 4,
  },
  rondaName: { color: C.brass },
  dijoujName: { color: C.bone },
  gameAr: {
    fontFamily: 'ReemKufi_700Bold',
    fontSize: 14,
    color: 'rgba(244,236,216,0.55)',
    marginTop: 2,
  },
  closeBtn: { alignItems: 'center', paddingVertical: 4 },
  closeTxt: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 13,
    color: C.boneOff,
    letterSpacing: 0.5,
  },
})

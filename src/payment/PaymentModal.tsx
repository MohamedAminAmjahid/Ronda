/**
 * Fallback natif — le paiement Stripe n'est disponible que sur le site web.
 * Sur iOS/Android, ce composant affiche un message d'information.
 */
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import type { PackId } from './stripe'

const C = {
  deep:    '#09402F',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.45)',
  ink:     '#1C2622',
} as const

interface Props {
  visible:    boolean
  packId:     PackId | null
  gold:       number
  priceLabel: string
  onClose:    () => void
  onSuccess:  (gold: number) => void
}

export function PaymentModal({ visible, gold, priceLabel, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <Text style={s.emoji}>💳</Text>
          <Text style={s.title}>Paiement</Text>
          <Text style={s.msg}>
            Le paiement de {priceLabel} pour 🪙 {gold} gold est disponible sur le site web :{'\n'}
            <Text style={s.link}>ronda-virid.vercel.app</Text>
          </Text>
          <TouchableOpacity style={s.btn} onPress={onClose}>
            <Text style={s.btnTxt}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(9,64,47,0.88)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  card: { width: '100%', maxWidth: 360, backgroundColor: C.deep, borderRadius: 16, padding: 24, gap: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(201,162,39,0.3)' },
  emoji: { fontSize: 40 },
  title: { fontFamily: 'Cairo_600SemiBold', fontSize: 20, color: C.bone },
  msg:   { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.boneOff, textAlign: 'center', lineHeight: 20 },
  link:  { fontFamily: 'Cairo_600SemiBold', color: C.brass },
  btn:   { backgroundColor: C.brass, borderRadius: 11, paddingVertical: 13, paddingHorizontal: 32, marginTop: 4 },
  btnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.ink },
})

import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useProfile } from '../profile/useProfile'
import { useI18n } from '../i18n/useI18n'

const C = {
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
  red:     '#E74C3C',
} as const

/** Montants de packs cadeau (identiques à la boutique). */
const GIFT_PACKS = [500, 1000, 2500, 5000] as const

interface Props {
  targetUid:  string
  targetName: string
}

/**
 * Formulaire « offrir un pack » vers un joueur déjà connu (sans recherche).
 * Cadeau = simulation illimitée : crédite le destinataire via giftGold, sans
 * débit ni quota côté émetteur. Même pattern que GoldTransferForm.
 */
export function GoldGiftForm({ targetUid, targetName }: Props) {
  const { t } = useI18n()
  const { giftGold } = useProfile()

  const [sending, setSending] = useState<number | null>(null)
  const [errMsg, setErrMsg]   = useState<string | null>(null)
  const [okMsg, setOkMsg]     = useState<string | null>(null)

  const offer = async (amount: number) => {
    if (sending !== null) return
    setSending(amount); setErrMsg(null); setOkMsg(null)
    try {
      await giftGold(targetUid, amount)
      setOkMsg(t('giftSuccess').replace('{n}', String(amount)).replace('{name}', targetName))
    } catch (e) {
      console.error('[GoldGiftForm] échec du cadeau:', e)
      setErrMsg(t('transferFailed'))
    } finally {
      setSending(null)
    }
  }

  return (
    <View style={s.wrap}>
      <View style={s.grid}>
        {GIFT_PACKS.map((amount) => (
          <View key={amount} style={s.pack}>
            <Text style={s.packCoin}>🪙</Text>
            <Text style={s.packGold}>{amount}</Text>
            <TouchableOpacity
              style={[s.giftBtn, sending !== null && s.giftBtnDisabled]}
              onPress={() => offer(amount)}
              disabled={sending !== null}
              activeOpacity={0.85}
            >
              <Text style={s.giftBtnTxt}>{sending === amount ? '…' : t('giftAction')}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {errMsg && <Text style={s.errMsg}>{errMsg}</Text>}
      {okMsg  && <Text style={s.okMsg}>{okMsg}</Text>}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  pack: {
    width: '47%', backgroundColor: 'rgba(0,0,0,0.30)', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.22)',
  },
  packCoin: { fontSize: 22 },
  packGold: { fontFamily: 'Cairo_600SemiBold', fontSize: 20, color: C.bone, marginBottom: 6 },
  giftBtn: { backgroundColor: C.brass, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 22, alignItems: 'center' },
  giftBtnDisabled: { opacity: 0.5 },
  giftBtnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.ink, letterSpacing: 0.3 },
  errMsg: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.red, textAlign: 'center' },
  okMsg:  { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.brass, textAlign: 'center', lineHeight: 20 },
})

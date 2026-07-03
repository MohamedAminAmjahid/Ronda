import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import { useProfile } from '../profile/useProfile'
import { useI18n } from '../i18n/useI18n'

const C = {
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
  red:     '#E74C3C',
} as const

/** Date du jour (YYYY-MM-DD) — pour calculer le quota quotidien côté UI. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

interface Props {
  targetUid:  string
  targetName: string
  /** Appelé après un transfert réussi (ex : rafraîchir le solde affiché). */
  onDone?:    () => void
}

/**
 * Formulaire de transfert de gold vers un joueur déjà connu (sans recherche) :
 * champ montant + quota quotidien restant + bouton « Envoyer ».
 * Réutilisé dans la boutique (après recherche) et l'écran de profil d'un ami.
 */
export function GoldTransferForm({ targetUid, targetName, onDone }: Props) {
  const { t } = useI18n()
  const {
    transferGold, dailyTransferSent, dailyTransferDate, DAILY_TRANSFER_LIMIT: LIMIT, gold,
  } = useProfile()

  const sentToday = dailyTransferDate === todayKey() ? dailyTransferSent : 0
  const remaining = Math.max(0, LIMIT - sentToday)

  const [input, setInput]     = useState('')
  const [sending, setSending] = useState(false)
  const [errMsg, setErrMsg]   = useState<string | null>(null)
  const [okMsg, setOkMsg]     = useState<string | null>(null)

  const amount = parseInt(input, 10) || 0
  const exceedsQuota   = amount > remaining
  const exceedsBalance = amount > gold

  const submit = async () => {
    if (amount <= 0 || sending || exceedsQuota || exceedsBalance) return
    setSending(true); setErrMsg(null); setOkMsg(null)
    const res = await transferGold(targetUid, amount, targetName)
    setSending(false)
    if (res.ok) {
      setOkMsg(t('sendSuccess').replace('{n}', String(amount)).replace('{name}', targetName))
      setInput('')
      onDone?.()
    } else if (res.reason === 'balance') {
      setErrMsg(t('insufficientBalance'))
    } else if (res.reason === 'quota') {
      setErrMsg(t('dailyLimitReached').replace('{max}', String(LIMIT)))
    } else {
      console.error('[GoldTransferForm] échec du transfert:', res)
      setErrMsg(t('transferFailed'))
    }
  }

  const isDisabled = remaining <= 0 || amount <= 0 || sending || exceedsQuota || exceedsBalance

  const btnLabel = () => {
    if (sending) return '…'
    if (remaining <= 0 || exceedsQuota) return t('dailyLimitReached').replace('{max}', String(LIMIT))
    if (exceedsBalance) return t('insufficientBalance')
    return t('sendAction')
  }

  return (
    <View style={s.wrap}>
      <Text style={s.quotaTxt}>
        {t('transferRemaining').replace('{n}', String(remaining)).replace('{max}', String(LIMIT))}
      </Text>
      {remaining <= 0 && (
        <Text style={s.errMsg}>{t('dailyLimitReached').replace('{max}', String(LIMIT))}</Text>
      )}
      <Text style={s.label}>{t('transferAmountLabel')}</Text>
      <View style={s.inputRow}>
        <Text style={s.coin}>🪙</Text>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={(v) => { setInput(v.replace(/[^0-9]/g, '').slice(0, 4)); setOkMsg(null); setErrMsg(null) }}
          placeholder={remaining <= 0 ? '—' : `max ${Math.min(remaining, gold)}`}
          placeholderTextColor={C.boneOff}
          keyboardType="number-pad"
          inputMode="numeric"
        />
      </View>
      <TouchableOpacity
        style={[s.btn, isDisabled && s.btnDisabled]}
        onPress={submit}
        disabled={isDisabled}
        activeOpacity={0.85}
      >
        <Text style={[s.btnTxt, isDisabled && s.btnTxtDisabled]}>
          {btnLabel()}
        </Text>
      </TouchableOpacity>

      {errMsg && <Text style={s.errMsg}>{errMsg}</Text>}
      {okMsg  && <Text style={s.okMsg}>{okMsg}</Text>}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { gap: 10 },
  quotaTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.brass },
  label: {
    fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff,
    letterSpacing: 1.2, textTransform: 'uppercase',
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.30)', borderRadius: 10, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)',
  },
  coin: { fontSize: 18 },
  input: {
    flex: 1, paddingVertical: 12, fontFamily: 'Cairo_600SemiBold', fontSize: 17, color: C.bone,
  },
  btn: { backgroundColor: C.brass, borderRadius: 11, paddingVertical: 13, alignItems: 'center' },
  btnTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.ink, letterSpacing: 0.3 },
  btnDisabled: { backgroundColor: 'rgba(244,236,216,0.12)' },
  btnTxtDisabled: { color: 'rgba(244,236,216,0.4)' },
  errMsg: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.red, textAlign: 'center' },
  okMsg:  { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.brass, textAlign: 'center', lineHeight: 20 },
})

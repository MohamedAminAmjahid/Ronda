/**
 * Modale de paiement Stripe — version web uniquement.
 * Charge Stripe.js, monte un CardElement dans un div identifié par nativeID,
 * puis confirme le paiement via le clientSecret obtenu du serveur.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import type { Stripe, StripeCardElement } from '@stripe/stripe-js'
import { getStripe, type PackId } from './stripe'
import { httpBase } from '../online/client'
import { getAuth } from 'firebase/auth'

const C = {
  deep:    '#09402F',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.45)',
  ink:     '#1C2622',
  red:     '#E74C3C',
} as const

const CARD_DIV_ID = 'ronda-stripe-card'

interface Props {
  visible:    boolean
  packId:     PackId | null
  gold:       number
  priceLabel: string
  onClose:    () => void
  onSuccess:  (gold: number) => void
}

type Phase = 'loading' | 'ready' | 'paying' | 'success' | 'error'

export function PaymentModal({ visible, packId, gold, priceLabel, onClose, onSuccess }: Props) {
  const [phase, setPhase]   = useState<Phase>('loading')
  const [errMsg, setErrMsg] = useState('')
  const stripeRef  = useRef<Stripe | null>(null)
  const cardRef    = useRef<StripeCardElement | null>(null)
  const secretRef  = useRef<string>('')

  const reset = useCallback(() => {
    setPhase('loading')
    setErrMsg('')
    secretRef.current = ''
    cardRef.current?.unmount()
    cardRef.current = null
  }, [])

  // Charge Stripe + crée le PaymentIntent quand la modale s'ouvre.
  useEffect(() => {
    if (!visible || !packId) return
    reset()
    let cancelled = false
    void (async () => {
      try {
        const [stripeInstance, token] = await Promise.all([
          getStripe(),
          getAuth().currentUser?.getIdToken() ?? Promise.resolve(null),
        ])
        if (cancelled) return
        if (!stripeInstance || !token) {
          setErrMsg('Stripe ou session indisponible.')
          setPhase('error')
          return
        }
        stripeRef.current = stripeInstance
        const res = await fetch(`${httpBase()}/payment/create-intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromToken: token, packId }),
        })
        if (cancelled) return
        const data = await res.json() as { clientSecret?: string; error?: string }
        if (!data.clientSecret) {
          setErrMsg(data.error ?? 'Erreur serveur.')
          setPhase('error')
          return
        }
        secretRef.current = data.clientSecret
        setPhase('ready')
      } catch {
        if (!cancelled) { setErrMsg('Connexion impossible.'); setPhase('error') }
      }
    })()
    return () => { cancelled = true }
  }, [visible, packId, reset])

  // Monte le CardElement dans le div une fois 'ready'.
  useEffect(() => {
    if (phase !== 'ready' || !stripeRef.current) return
    const tryMount = () => {
      const container = document.getElementById(CARD_DIV_ID)
      if (!container) return false
      const elements = stripeRef.current!.elements()
      const card = elements.create('card', {
        style: {
          base: {
            color: C.bone,
            fontFamily: 'Cairo, sans-serif',
            fontSize: '16px',
            '::placeholder': { color: 'rgba(244,236,216,0.4)' },
          },
          invalid: { color: C.red },
        },
      })
      card.mount(container)
      cardRef.current = card
      return true
    }
    if (!tryMount()) {
      const t = setTimeout(tryMount, 80)
      return () => clearTimeout(t)
    }
    return () => { cardRef.current?.unmount(); cardRef.current = null }
  }, [phase])

  // Confirmation du paiement.
  const pay = async () => {
    if (!stripeRef.current || !cardRef.current || !secretRef.current) return
    setPhase('paying')
    const { error } = await stripeRef.current.confirmCardPayment(secretRef.current, {
      payment_method: { card: cardRef.current },
    })
    if (error) {
      setErrMsg(error.message ?? 'Paiement refusé.')
      setPhase('error')
    } else {
      setPhase('success')
      onSuccess(gold)
    }
  }

  const handleClose = () => { reset(); onClose() }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <Text style={s.title}>💳 Paiement</Text>

          {phase === 'success' ? (
            <>
              <Text style={s.successEmoji}>🎉</Text>
              <Text style={s.successMsg}>
                Paiement réussi !{'\n'}🪙 +{gold} gold crédités.
              </Text>
              <TouchableOpacity style={s.btnPrimary} onPress={handleClose}>
                <Text style={s.btnPrimaryTxt}>Fermer</Text>
              </TouchableOpacity>
            </>
          ) : phase === 'error' ? (
            <>
              <Text style={s.errMsg}>{errMsg}</Text>
              <TouchableOpacity style={s.btnSecondary} onPress={handleClose}>
                <Text style={s.btnSecondaryTxt}>Fermer</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={s.packLabel}>🪙 {gold} — {priceLabel}</Text>

              {/* CardElement de Stripe monté ici via document.getElementById */}
              <View
                nativeID={CARD_DIV_ID}
                style={[s.cardInput, (phase === 'loading' || phase === 'paying') && s.cardInputDisabled]}
              />

              {phase === 'loading' && (
                <ActivityIndicator color={C.brass} style={s.loader} />
              )}

              <TouchableOpacity
                style={[s.btnPrimary, phase !== 'ready' && s.btnDisabled]}
                onPress={pay}
                disabled={phase !== 'ready'}
              >
                <Text style={[s.btnPrimaryTxt, phase !== 'ready' && s.btnDisabledTxt]}>
                  {phase === 'paying' ? 'Traitement…' : `Payer ${priceLabel}`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleClose} style={s.cancelBtn}>
                <Text style={s.cancelTxt}>Annuler</Text>
              </TouchableOpacity>

              <Text style={s.secureTxt}>🔒 Paiement sécurisé par Stripe</Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(9,64,47,0.90)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  card: {
    width: '100%', maxWidth: 380, backgroundColor: C.deep, borderRadius: 18,
    padding: 24, gap: 14, alignItems: 'stretch',
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.3)',
  },
  title: { fontFamily: 'Cairo_600SemiBold', fontSize: 20, color: C.bone, textAlign: 'center' },
  packLabel: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, color: C.brass, textAlign: 'center' },

  cardInput: {
    backgroundColor: 'rgba(0,0,0,0.30)', borderRadius: 10, padding: 14, minHeight: 48,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.30)',
  },
  cardInputDisabled: { opacity: 0.5 },
  loader: { alignSelf: 'center' },

  btnPrimary: { backgroundColor: C.brass, borderRadius: 11, paddingVertical: 14, alignItems: 'center' },
  btnPrimaryTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.ink },
  btnDisabled: { backgroundColor: 'rgba(244,236,216,0.12)' },
  btnDisabledTxt: { color: 'rgba(244,236,216,0.35)' },

  btnSecondary: { borderRadius: 11, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: C.brass },
  btnSecondaryTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.brass },

  cancelBtn: { alignItems: 'center', paddingVertical: 4 },
  cancelTxt: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: C.boneOff },

  secureTxt: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: C.boneOff, textAlign: 'center' },

  successEmoji: { fontSize: 48, textAlign: 'center' },
  successMsg: { fontFamily: 'Cairo_600SemiBold', fontSize: 17, color: C.bone, textAlign: 'center', lineHeight: 26 },

  errMsg: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: C.red, textAlign: 'center' },
})

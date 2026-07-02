import { loadStripe, type Stripe } from '@stripe/stripe-js'

const KEY = process.env.EXPO_PUBLIC_STRIPE_KEY ?? ''

let _promise: Promise<Stripe | null> | null = null

/** Singleton — charge le SDK Stripe une seule fois. */
export function getStripe(): Promise<Stripe | null> {
  if (!KEY) return Promise.resolve(null)
  if (!_promise) _promise = loadStripe(KEY)
  return _promise
}

export const STRIPE_PACKS = [
  { id: 'pack_500',  gold: 500,  label: '2,00 €',  cents: 200  },
  { id: 'pack_1000', gold: 1000, label: '3,50 €',  cents: 350  },
  { id: 'pack_2500', gold: 2500, label: '7,50 €',  cents: 750  },
  { id: 'pack_5000', gold: 5000, label: '14,00 €', cents: 1400 },
] as const

export type PackId = typeof STRIPE_PACKS[number]['id']

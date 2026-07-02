import Stripe from 'stripe'

const key = process.env.STRIPE_SECRET_KEY ?? ''

export const stripe: Stripe | null = key
  ? new Stripe(key, { apiVersion: '2026-06-24.dahlia' })
  : null

export const stripeReady = (): boolean => !!stripe

export const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ''

export const PACKS: Record<string, { gold: number; amount: number; currency: string }> = {
  pack_500:  { gold: 500,  amount: 200,  currency: 'eur' },
  pack_1000: { gold: 1000, amount: 350,  currency: 'eur' },
  pack_2500: { gold: 2500, amount: 750,  currency: 'eur' },
  pack_5000: { gold: 5000, amount: 1400, currency: 'eur' },
}

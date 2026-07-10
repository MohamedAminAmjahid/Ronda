import { getAuth } from 'firebase/auth'
import { firebaseApp } from '../firebase/config'
import { httpBase } from './client'

// Appels REST authentifiés vers le serveur Railway (gold + notifications push).
// Le serveur vérifie le token Firebase et est autoritaire sur les soldes/quotas.

/** Token d'identité Firebase de l'utilisateur courant, ou null si déconnecté. */
async function idToken(): Promise<string | null> {
  const u = getAuth(firebaseApp).currentUser
  if (!u) return null
  try { return await u.getIdToken() } catch { return null }
}

async function post(path: string, body: Record<string, unknown>): Promise<Response | null> {
  try {
    return await fetch(`${httpBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    console.error(`[serverApi] ${path} réseau:`, e)
    return null
  }
}

// ── Gold ────────────────────────────────────────────────────────────────────

export interface GiftResult { ok: boolean; gold?: number }

/** Offre un cadeau (crédite toUid). Renvoie le nouveau solde du destinataire. */
export async function apiGift(toUid: string, amount: number): Promise<GiftResult> {
  const fromToken = await idToken()
  if (!fromToken) return { ok: false }
  const res = await post('/gold/gift', { fromToken, toUid, amount })
  if (!res || !res.ok) { console.error('[apiGift] http', res?.status); return { ok: false } }
  return (await res.json()) as GiftResult
}

export interface TransferApiResult {
  ok: boolean
  reason?: 'balance' | 'quota'
  gold?: number
  remaining?: number
}

/** Transfère du gold (débite l'émetteur, plafond 200/j vérifié serveur). */
export async function apiTransfer(toUid: string, amount: number): Promise<TransferApiResult> {
  const fromToken = await idToken()
  if (!fromToken) return { ok: false }
  const res = await post('/gold/transfer', { fromToken, toUid, amount })
  if (!res || !res.ok) { console.error('[apiTransfer] http', res?.status); return { ok: false } }
  return (await res.json()) as TransferApiResult
}

// ── Notifications (fire-and-forget) ───────────────────────────────────────────

async function notify(path: string, body: Record<string, unknown>): Promise<void> {
  const fromToken = await idToken()
  if (!fromToken) return
  await post(path, { ...body, fromToken })
}

export function notifyInvite(toUid: string, game: 'ronda' | 'dijouj'): void {
  void notify('/notify/invite', { toUid, game })
}
export function notifyMessage(toUid: string): void {
  void notify('/notify/message', { toUid })
}
export function notifyFriendRequest(toUid: string): void {
  void notify('/notify/friend-request', { toUid })
}
export function notifyGold(toUid: string, amount: number, type: 'gift' | 'transfer'): void {
  void notify('/notify/gold', { toUid, amount, type })
}
export function notifyChallenge(toUid: string, stake: number): void {
  void notify('/notify/challenge', { toUid, stake })
}
export function notifyChallengeAccepted(toUid: string): void {
  void notify('/notify/challenge-accepted', { toUid })
}

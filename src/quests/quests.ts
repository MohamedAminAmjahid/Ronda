import { doc, getDoc, setDoc, getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { firebaseApp } from '../firebase/config'
import { apiGift } from '../online/serverApi'

// Quêtes quotidiennes + streak. État persisté dans Firestore quests/{uid}.
// Récompenses créditées via la route serveur /gold/gift (crédit à soi-même,
// non journalisé dans goldHistory côté serveur).

export type QuestKey = 'winGame' | 'playOnline' | 'sendGift'

export interface QuestDef { key: QuestKey; reward: number }

export const QUESTS: QuestDef[] = [
  { key: 'winGame',    reward: 50 },
  { key: 'playOnline', reward: 30 },
  { key: 'sendGift',   reward: 20 },
]
export const STREAK_STEP = 10
export const STREAK_MAX  = 100

export interface QuestState {
  date: string
  streak: number
  /** Mission accomplie (automatique). */
  completed: Record<QuestKey, boolean>
  /** Récompense réclamée par le joueur (clic « Réclamer »). */
  claimed: Record<QuestKey, boolean>
}

/** Date UTC (YYYY-MM-DD) — le reset quotidien se fait à 00:00 UTC. */
function today(): string { return new Date().toISOString().slice(0, 10) }
function yesterday(): string {
  const d = new Date(); d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}
function emptyFlags(): Record<QuestKey, boolean> {
  return { winGame: false, playOnline: false, sendGift: false }
}

const db  = () => getFirestore(firebaseApp)
const uid = () => getAuth(firebaseApp).currentUser?.uid ?? null
function questRef(u: string) { return doc(db(), 'quests', u) }

// Injection du setter de gold local (évite un cycle d'import avec profile.ts).
let applyGold: ((n: number) => void) | null = null
export function registerGoldSetter(fn: (n: number) => void): void { applyGold = fn }

// Cache + abonnement pour l'UI.
let cache: QuestState | null = null
const listeners = new Set<(s: QuestState) => void>()
function emit(): void { if (cache) for (const l of listeners) l(cache) }
export function subscribeQuests(cb: (s: QuestState) => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
export function getQuestsSnapshot(): QuestState | null { return cache }

/** Charge (ou initialise en mémoire) l'état des quêtes du jour. */
export async function loadQuests(): Promise<QuestState | null> {
  const u = uid(); if (!u) return null
  try {
    const snap = await getDoc(questRef(u))
    const data = snap.exists() ? snap.data() : null
    const storedDate   = (data?.date as string) ?? ''
    const storedStreak = (data?.streak as number) ?? 0
    if (storedDate === today()) {
      cache = {
        date: storedDate,
        streak: storedStreak,
        completed: { ...emptyFlags(), ...(data?.questsCompleted as Record<QuestKey, boolean> ?? {}) },
        claimed:   { ...emptyFlags(), ...(data?.questsClaimed   as Record<QuestKey, boolean> ?? {}) },
      }
    } else {
      // Nouveau jour (UTC) : reset local. Rien n'est écrit tant qu'aucune quête n'est validée.
      cache = { date: today(), streak: storedStreak, completed: emptyFlags(), claimed: emptyFlags() }
    }
    emit()
    return cache
  } catch (e) {
    console.error('[quests] loadQuests:', e)
    return null
  }
}

/**
 * Marque une quête comme ACCOMPLIE (idempotent par jour). Ne crédite AUCUN or :
 * la récompense n'est versée qu'au clic « Réclamer » (voir claimQuest).
 */
export async function markQuestProgress(key: QuestKey): Promise<void> {
  const u = uid(); if (!u) return
  try {
    const snap = await getDoc(questRef(u))
    const data = snap.exists() ? snap.data() : null
    const storedDate   = (data?.date as string) ?? ''
    const storedStreak = (data?.streak as number) ?? 0
    const isNewDay = storedDate !== today()

    let streak = storedStreak
    let completed = isNewDay
      ? emptyFlags()
      : { ...emptyFlags(), ...(data?.questsCompleted as Record<QuestKey, boolean> ?? {}) }
    const claimed = isNewDay
      ? emptyFlags()
      : { ...emptyFlags(), ...(data?.questsClaimed as Record<QuestKey, boolean> ?? {}) }

    // Nouveau jour → incrémente le streak de connexion (continuité, pas de crédit ici).
    if (isNewDay) streak = storedDate === yesterday() ? storedStreak + 1 : 1

    if (completed[key]) {
      cache = { date: today(), streak, completed, claimed }
      emit()
      return
    }
    completed = { ...completed, [key]: true }

    // Sur un nouveau jour, on remet aussi questsClaimed à zéro côté Firestore.
    const patch: Record<string, unknown> = { date: today(), streak, questsCompleted: completed }
    if (isNewDay) patch.questsClaimed = emptyFlags()
    await setDoc(questRef(u), patch, { merge: true })

    cache = { date: today(), streak, completed, claimed }
    emit()
  } catch (e) {
    console.error('[quests] markQuestProgress:', e)
  }
}

/**
 * Réclame la récompense d'une quête accomplie : crédite l'or (une seule fois)
 * et marque `claimed`. Sans effet si la quête n'est pas accomplie ou déjà réclamée.
 */
export async function claimQuest(key: QuestKey): Promise<void> {
  const u = uid(); if (!u) return
  const s = cache
  if (!s || !s.completed[key] || s.claimed[key]) return
  try {
    const claimed = { ...s.claimed, [key]: true }
    await setDoc(questRef(u), { date: today(), questsClaimed: claimed }, { merge: true })
    cache = { ...s, claimed }
    emit()

    const reward = QUESTS.find(q => q.key === key)?.reward ?? 0
    if (reward > 0) {
      const r = await apiGift(u, reward)  // crédit serveur (à soi-même)
      if (r.ok && typeof r.gold === 'number' && applyGold) applyGold(r.gold)
    }
  } catch (e) {
    console.error('[quests] claimQuest:', e)
  }
}

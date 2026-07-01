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
  completed: Record<QuestKey, boolean>
}

function today(): string { return new Date().toISOString().slice(0, 10) }
function yesterday(): string {
  const d = new Date(); d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}
function emptyCompleted(): Record<QuestKey, boolean> {
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
        completed: { ...emptyCompleted(), ...(data?.questsCompleted as Record<QuestKey, boolean> ?? {}) },
      }
    } else {
      // Nouveau jour : rien n'est écrit tant qu'aucune quête n'est validée.
      cache = { date: today(), streak: storedStreak, completed: emptyCompleted() }
    }
    emit()
    return cache
  } catch (e) {
    console.error('[quests] loadQuests:', e)
    return null
  }
}

/** Marque une quête comme accomplie (idempotent par jour) et crédite la récompense. */
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
      ? emptyCompleted()
      : { ...emptyCompleted(), ...(data?.questsCompleted as Record<QuestKey, boolean> ?? {}) }
    let bonus = 0

    if (isNewDay) {
      // Premier passage du jour → streak + bonus de connexion.
      streak = storedDate === yesterday() ? storedStreak + 1 : 1
      bonus = Math.min(streak * STREAK_STEP, STREAK_MAX)
    }

    if (completed[key]) {
      cache = { date: today(), streak, completed }
      emit()
      return
    }
    completed = { ...completed, [key]: true }

    await setDoc(questRef(u), { date: today(), streak, questsCompleted: completed }, { merge: true })

    const reward = (QUESTS.find(q => q.key === key)?.reward ?? 0) + bonus
    if (reward > 0) {
      const r = await apiGift(u, reward)  // crédit serveur (à soi-même)
      if (r.ok && typeof r.gold === 'number' && applyGold) applyGold(r.gold)
    }

    cache = { date: today(), streak, completed }
    emit()
  } catch (e) {
    console.error('[quests] markQuestProgress:', e)
  }
}

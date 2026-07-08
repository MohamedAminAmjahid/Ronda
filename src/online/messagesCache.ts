import {
  getUserChats, getChatMessages,
  type ChatPreview, type MessageDoc,
} from '../firebase/firestore'

// Cache mémoire partagé (même pattern que leaderboardCache/profileCache) :
// affichage instantané depuis le cache + refresh silencieux si périmé.
const CACHE_TTL_MS = 2 * 60 * 1000 // 2 minutes

// Liste des conversations (une seule par session — l'utilisateur courant).
let conversationsCache: { data: ChatPreview[]; fetchedAt: number } | null = null

// Messages par chatId.
const messagesCache = new Map<string, { data: MessageDoc[]; fetchedAt: number }>()

const listeners = new Set<() => void>()
export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
function notify(): void { for (const l of listeners) l() }

// ── Conversations ─────────────────────────────────────────────────────────────

/** Liste en cache, même périmée (affichage optimiste immédiat). */
export function getCachedConversations(): ChatPreview[] | null {
  return conversationsCache?.data ?? null
}

export function isConversationsStale(): boolean {
  if (!conversationsCache) return true
  return Date.now() - conversationsCache.fetchedAt > CACHE_TTL_MS
}

/** Refetch la liste et met à jour le cache — silencieux en cas d'échec. */
export async function refreshConversations(uid: string): Promise<void> {
  try {
    const data = await getUserChats(uid)
    conversationsCache = { data, fetchedAt: Date.now() }
    notify()
  } catch {
    // silencieux — le cache existant reste affiché
  }
}

/** Invalide le cache des conversations (après suppression, notamment). */
export function invalidateConversations(): void {
  conversationsCache = null
  notify()
}

// ── Messages d'un chat ──────────────────────────────────────────────────────

export function getCachedMessages(chatId: string): MessageDoc[] | null {
  return messagesCache.get(chatId)?.data ?? null
}

export function isMessagesStale(chatId: string): boolean {
  const entry = messagesCache.get(chatId)
  if (!entry) return true
  return Date.now() - entry.fetchedAt > CACHE_TTL_MS
}

/** Refetch les messages d'un chat — silencieux en cas d'échec. */
export async function refreshMessages(chatId: string): Promise<void> {
  try {
    const data = await getChatMessages(chatId)
    messagesCache.set(chatId, { data, fetchedAt: Date.now() })
    notify()
  } catch {
    // silencieux
  }
}

/** Écrit directement les messages en cache (flux temps réel onSnapshot). */
export function setCachedMessages(chatId: string, data: MessageDoc[]): void {
  messagesCache.set(chatId, { data, fetchedAt: Date.now() })
}

export function invalidateMessages(chatId: string): void {
  messagesCache.delete(chatId)
}

/** Préchauffe la liste des conversations en arrière-plan (voir sync.ts, au login). */
export function preloadConversations(uid: string): void {
  void refreshConversations(uid)
}

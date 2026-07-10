import { adminDb, firebaseReady } from '../firebaseAdmin'

const GLOBAL_CHAT_RETENTION = 200

/**
 * Purge global_chat au-delà des GLOBAL_CHAT_RETENTION messages les plus
 * récents. Nécessairement côté serveur (Admin SDK, qui bypasse les règles de
 * sécurité) : la règle Firestore de global_chat (voir firestore.ts, aucun
 * fichier de règles versionné dans ce dépôt — à configurer manuellement dans
 * la Console) n'autorise chacun à supprimer QUE ses propres messages
 * (`allow delete: if request.auth.uid == resource.data.uid`), ce qui rend
 * impossible un nettoyage client des messages les plus anciens d'AUTRES
 * auteurs.
 */
export async function cleanupGlobalChat(): Promise<void> {
  if (!firebaseReady()) return
  try {
    const snap = await adminDb().collection('global_chat').orderBy('createdAt', 'desc').get()
    const toDelete = snap.docs.slice(GLOBAL_CHAT_RETENTION)
    if (toDelete.length === 0) return
    await Promise.all(toDelete.map((d) => d.ref.delete()))
    console.log(`[global_chat] cleanup: ${toDelete.length} message(s) supprimé(s)`)
  } catch (e) {
    console.error('[global_chat] cleanup error:', e)
  }
}

import { adminDb, firebaseReady } from '../firebaseAdmin'

/**
 * Marque un défi comme terminé avec son vainqueur. Appelé UNIQUEMENT depuis
 * RondaRoom/DiJoujRoom.finishGame() (serveur autoritaire sur le résultat) —
 * jamais depuis une route cliente : bien que la règle Firestore donnée pour
 * `challenges` autorise déjà les deux joueurs à mettre à jour le document
 * (`allow update: if auth.uid == fromUid || auth.uid == toUid`), on ne fait
 * jamais confiance à un client pour désigner le vainqueur d'une mise réelle
 * (même principe que recordMatchWinner pour les tournois) — l'Admin SDK
 * écrit directement, en dehors de toute règle de sécurité.
 */
export async function completeChallenge(challengeId: string, winnerUid: string): Promise<void> {
  if (!firebaseReady()) return
  try {
    await adminDb().collection('challenges').doc(challengeId).update({
      status: 'completed',
      winnerUid,
    })
  } catch (e) {
    console.error('[challenges] completeChallenge error:', e)
  }
}

/**
 * Supprime les défis 'pending' dont expiresAt est dépassé (24h, voir
 * sendChallenge côté client). Nécessairement côté serveur : rien dans ce
 * projet ne rappelle périodiquement les documents Firestore pour les faire
 * expirer eux-mêmes (pas de Cloud Functions ici, seulement ce serveur
 * Express + Admin SDK) — sans ce nettoyage, un défi 'pending' périmé
 * resterait affiché indéfiniment dans « Défis en attente » (le filtre
 * expiresAt côté client ne fait que le masquer, jamais le supprimer).
 */
export async function cleanupExpiredChallenges(): Promise<void> {
  if (!firebaseReady()) return
  try {
    const snap = await adminDb().collection('challenges')
      .where('status', '==', 'pending')
      .get()
    const now = Date.now()
    const expired = snap.docs.filter((d) => {
      const exp = d.data().expiresAt as { toMillis?: () => number } | undefined
      return (exp?.toMillis?.() ?? 0) < now
    })
    if (expired.length === 0) return
    await Promise.all(expired.map((d) => d.ref.delete()))
    console.log(`[challenges] cleanup: ${expired.length} défi(s) expiré(s) supprimé(s)`)
  } catch (e) {
    console.error('[challenges] cleanup error:', e)
  }
}

import { adminDb, adminMessaging, firebaseReady } from './firebaseAdmin'

/**
 * Envoie une notification push FCM (API v1, via le Service Account admin) à un
 * utilisateur, en lisant son token FCM depuis users/{uid}.fcmToken.
 * No-op silencieux si Firebase indisponible ou si l'utilisateur n'a pas de token.
 */
export async function sendPushNotification(
  toUid: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  if (!firebaseReady()) return
  try {
    const snap = await adminDb().collection('users').doc(toUid).get()
    const token = snap.data()?.fcmToken as string | undefined
    if (!token) return
    await adminMessaging().send({
      token,
      notification: { title, body },
      data: data ?? {},
      webpush: {
        notification: { icon: '/icon.png' },
        fcmOptions: { link: 'https://ronda-virid.vercel.app' },
      },
    })
  } catch (e) {
    // Token invalide/expiré ou autre erreur : on nettoie le token périmé.
    const code = (e as { code?: string }).code
    if (code === 'messaging/registration-token-not-registered') {
      try { await adminDb().collection('users').doc(toUid).update({ fcmToken: null }) } catch { /* ignore */ }
    }
    console.error('[sendPushNotification] échec:', e)
  }
}

// ── Notifications tournoi hebdomadaire ──────────────────────────────────────
// Toutes réutilisent sendPushNotification ci-dessus (lecture fcmToken, gestion
// des tokens périmés, no-op si Firebase indisponible) plutôt que de refaire un
// appel Admin Messaging direct par fonction.

/** Notifie tous les participants qu'un bracket vient d'être généré. */
export async function notifyBracketReady(participants: string[]): Promise<void> {
  await Promise.all(participants.map((uid) =>
    sendPushNotification(
      uid,
      '🏆 Le bracket est prêt !',
      'Ton 1er match commence vendredi — prépare-toi !',
      { type: 'tournament_bracket_ready' },
    ),
  ))
}

/** Notifie un joueur que son prochain match de tournoi est prêt à être joué. */
export async function notifyYourTurn(uid: string, opponentName: string, deadline: Date): Promise<void> {
  const deadlineStr = deadline.toLocaleString('fr-FR', {
    weekday: 'long', hour: '2-digit', minute: '2-digit',
  })
  await sendPushNotification(
    uid,
    '⚔️ Ton match de tournoi !',
    `Tu affrontes ${opponentName} — joue avant ${deadlineStr}`,
    { type: 'tournament_your_turn' },
  )
}

/** Notifie le champion du tournoi (or gagné inclus dans le message). */
export async function notifyChampion(uid: string, goldWon: number): Promise<void> {
  await sendPushNotification(
    uid,
    '🏆 CHAMPION !',
    `Tu as gagné le tournoi et remporté ${goldWon} 🪙 !`,
    { type: 'tournament_champion' },
  )
}

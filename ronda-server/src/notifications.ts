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

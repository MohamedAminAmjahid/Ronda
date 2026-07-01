import { initializeApp, cert, applicationDefault, getApps, type ServiceAccount } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue as AdminFieldValue } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'

// Initialise firebase-admin à partir du Service Account.
// Fournir le JSON du compte de service via la variable d'env FIREBASE_SERVICE_ACCOUNT
// (contenu JSON brut) OU via GOOGLE_APPLICATION_CREDENTIALS (chemin du fichier).
// Sans credentials, le serveur démarre quand même : les routes gold/notif renvoient 503.

let ready = false

function init(): void {
  if (getApps().length) { ready = true; return }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  try {
    if (raw) {
      const svc = JSON.parse(raw) as ServiceAccount
      initializeApp({ credential: cert(svc) })
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      initializeApp({ credential: applicationDefault() })
    } else {
      console.warn('[firebase-admin] Aucun credential (FIREBASE_SERVICE_ACCOUNT absent) — routes Firebase désactivées.')
      return
    }
    ready = true
    console.log('[firebase-admin] initialisé.')
  } catch (e) {
    console.error('[firebase-admin] échec initialisation:', e)
  }
}

init()

export const firebaseReady = (): boolean => ready
export const adminAuth = () => getAuth()
export const adminDb = () => getFirestore()
export const adminMessaging = () => getMessaging()
export const FieldValue = AdminFieldValue

/** Lit le pseudo d'un utilisateur (fallback 'Joueur'). */
export async function getUsername(uid: string): Promise<string> {
  try {
    const snap = await adminDb().collection('users').doc(uid).get()
    return (snap.data()?.username as string) || 'Joueur'
  } catch {
    return 'Joueur'
  }
}

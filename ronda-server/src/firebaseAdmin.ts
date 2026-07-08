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
  console.log('🔥 FIREBASE_SERVICE_ACCOUNT présent:', !!raw)
  console.log('🔥 FIREBASE_SERVICE_ACCOUNT longueur:', raw?.length ?? 0)

  if (raw) {
    let svc: ServiceAccount
    try {
      const parsed = JSON.parse(raw) as { project_id?: string; client_email?: string }
      console.log('🔥 project_id:', parsed.project_id)
      console.log('🔥 client_email:', parsed.client_email)
      svc = parsed as ServiceAccount
    } catch (e) {
      // Ne JAMAIS logger `raw` en entier ici : contient private_key (secret).
      console.error('🔥 ERREUR parsing JSON FIREBASE_SERVICE_ACCOUNT:', e)
      return
    }
    try {
      initializeApp({ credential: cert(svc) })
      ready = true
      console.log('🔥 Firebase Admin initialisé avec succès')
    } catch (e) {
      console.error('🔥 ERREUR initialisation Firebase Admin:', e)
    }
    return
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      initializeApp({ credential: applicationDefault() })
      ready = true
      console.log('🔥 Firebase Admin initialisé avec succès (GOOGLE_APPLICATION_CREDENTIALS)')
    } catch (e) {
      console.error('🔥 ERREUR initialisation Firebase Admin:', e)
    }
    return
  }

  console.warn('[firebase-admin] Aucun credential (FIREBASE_SERVICE_ACCOUNT absent) — routes Firebase désactivées.')
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

/** Profil public d'un joueur (avatar + niveau) pour l'affichage en partie. */
export interface PublicProfile {
  username:    string
  avatarType:  string
  avatarEmoji: string
  avatarImage: string
  level:       number
}

/**
 * Lit le profil public d'un utilisateur depuis Firestore (avatar + niveau).
 * Renvoie des valeurs par défaut si credentials absents / uid introuvable —
 * ne lève jamais.
 */
export async function getPublicProfile(uid: string): Promise<PublicProfile> {
  const fallback: PublicProfile = {
    username: 'Joueur', avatarType: 'initial', avatarEmoji: '', avatarImage: '', level: 1,
  }
  if (!ready || !uid) return fallback
  try {
    const snap = await adminDb().collection('users').doc(uid).get()
    const d = snap.data()
    if (!d) return fallback
    return {
      username:    (d.username    as string) || fallback.username,
      avatarType:  (d.avatarType  as string) || 'initial',
      avatarEmoji: (d.avatarEmoji as string) || '',
      avatarImage: (d.avatarImage as string) || '',
      level:       typeof d.level === 'number' ? (d.level as number) : 1,
    }
  } catch {
    return fallback
  }
}

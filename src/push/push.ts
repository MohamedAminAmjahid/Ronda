import { useEffect } from 'react'
import { Platform } from 'react-native'
import { getAuth } from 'firebase/auth'
import { doc, getFirestore, setDoc } from 'firebase/firestore'
import { firebaseApp } from '../firebase/config'
import { useAuth } from '../firebase/auth'

// Enregistrement du token FCM (web). Le natif nécessiterait expo-notifications
// + un build natif configuré ; on no-op proprement dans ce cas.

const VAPID_KEY = process.env.EXPO_PUBLIC_FCM_VAPID_KEY

async function saveToken(token: string): Promise<void> {
  const uid = getAuth(firebaseApp).currentUser?.uid
  if (!uid) return
  await setDoc(doc(getFirestore(firebaseApp), 'users', uid), { fcmToken: token }, { merge: true })
}

/** Demande la permission de notification et sauvegarde le token FCM (web). */
export async function registerPush(): Promise<void> {
  if (Platform.OS !== 'web') return
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return
  if (!VAPID_KEY) { console.warn('[push] EXPO_PUBLIC_FCM_VAPID_KEY absent — push désactivé.'); return }
  try {
    const { isSupported, getMessaging, getToken } = await import('firebase/messaging')
    if (!(await isSupported())) return

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    // Scope dédié pour ne pas entrer en conflit avec le SW principal (/sw.js) qui
    // contrôle la portée racine '/'.
    let swReg: ServiceWorkerRegistration | undefined
    if ('serviceWorker' in navigator) {
      swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/firebase-cloud-messaging-push-scope',
      })
    }

    const messaging = getMessaging(firebaseApp)
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg })
    if (token) await saveToken(token)
  } catch (e) {
    console.warn('[push] indisponible:', e)
  }
}

/** Hook : enregistre le token FCM dès que l'utilisateur est connecté. */
export function usePushRegistration(): void {
  const { user } = useAuth()
  useEffect(() => {
    if (user) void registerPush()
  }, [user])
}

import { getFirestore, doc, updateDoc } from 'firebase/firestore'
import { Platform } from 'react-native'
import { firebaseApp } from './config'

// Avatar stocké en base64 compressé DANS Firestore (users/{uid}.avatarImage).
// Pas de Firebase Storage (payant). L'image est réduite (≈100×100, qualité 0.5)
// pour rester légère (~5–10 Ko) — compatible avec la limite de 1 Mo par document.

const db = getFirestore(firebaseApp)
const IS_WEB = Platform.OS === 'web'

/** Réduit une image (data URI) à `max`×`max` px en JPEG via un canvas (web only). */
async function compressWeb(dataUri: string, max = 100, quality = 0.5): Promise<string> {
  if (!IS_WEB || typeof document === 'undefined') return dataUri
  return new Promise<string>((resolve) => {
    try {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(dataUri); return }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => resolve(dataUri)
      img.src = dataUri
    } catch {
      resolve(dataUri)
    }
  })
}

/**
 * Compresse la photo (base64 brut de l'image picker) et la stocke directement
 * dans Firestore — pas de Storage. Renvoie la data URI compressée à afficher.
 */
export async function uploadAvatar(uid: string, base64: string): Promise<string> {
  const raw = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`
  const dataUri = await compressWeb(raw, 100, 0.5)
  await updateDoc(doc(db, 'users', uid), { avatarImage: dataUri })
  return dataUri
}

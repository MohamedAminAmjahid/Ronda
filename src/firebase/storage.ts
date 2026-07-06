import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage'
import { firebaseApp } from './config'

const storage = getStorage(firebaseApp)

/**
 * Upload la photo de profil (base64 JPEG brut, sans préfixe data:) dans
 * Firebase Storage à `avatars/{uid}.jpg` et renvoie l'URL HTTPS publique.
 */
export async function uploadAvatar(uid: string, base64: string): Promise<string> {
  const avatarRef = ref(storage, `avatars/${uid}.jpg`)
  await uploadString(avatarRef, base64, 'base64', { contentType: 'image/jpeg' })
  return await getDownloadURL(avatarRef)
}

/** Supprime l'avatar Storage (best-effort — ignore si absent). */
export async function deleteAvatar(uid: string): Promise<void> {
  try {
    await deleteObject(ref(storage, `avatars/${uid}.jpg`))
  } catch {
    // fichier absent ou déjà supprimé
  }
}

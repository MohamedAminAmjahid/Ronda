import { useEffect, useState } from 'react'
import { subscribePendingCount, subscribeTotalUnread } from '../firebase/firestore'

/**
 * Écoute en temps réel les badges de notification pour un utilisateur :
 * - `pending`  : demandes d'amis en attente
 * - `unread`   : messages non lus (tous chats)
 * - `total`    : somme, utilisé pour le badge BottomNav
 */
export function useNotifBadges(myUid: string | null) {
  const [pending, setPending] = useState(0)
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!myUid) { setPending(0); setUnread(0); return }
    const u1 = subscribePendingCount(myUid, setPending)
    const u2 = subscribeTotalUnread(myUid, setUnread)
    return () => { u1(); u2() }
  }, [myUid])

  return { pending, unread, total: pending + unread }
}

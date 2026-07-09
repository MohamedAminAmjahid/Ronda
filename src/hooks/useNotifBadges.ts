import { useEffect, useState } from 'react'
import { subscribePendingCount, subscribeTotalUnread } from '../firebase/firestore'
import { fetchCurrentTournament } from '../online/client'

const TOURNAMENT_POLL_MS = 5 * 60 * 1000 // 5 min

/**
 * Écoute en temps réel les badges de notification pour un utilisateur :
 * - `pending`  : demandes d'amis en attente
 * - `unread`   : messages non lus (tous chats)
 * - `total`    : somme, utilisé pour le badge BottomNav
 * - `tournamentBadge` : 1 si un match de tournoi ('ready') attend ce joueur
 */
export function useNotifBadges(myUid: string | null) {
  const [pending, setPending] = useState(0)
  const [unread, setUnread] = useState(0)
  const [tournamentBadge, setTournamentBadge] = useState(0)

  useEffect(() => {
    if (!myUid) { setPending(0); setUnread(0); return }
    const u1 = subscribePendingCount(myUid, setPending)
    const u2 = subscribeTotalUnread(myUid, setUnread)
    return () => { u1(); u2() }
  }, [myUid])

  // Pas de listener temps réel possible ici : le tournoi vit sur le serveur
  // Railway (fetchCurrentTournament), pas dans Firestore côté client — poll
  // modéré, ce badge n'a pas besoin d'être instantané.
  useEffect(() => {
    if (!myUid) { setTournamentBadge(0); return }
    let cancelled = false
    const check = async () => {
      try {
        const t = await fetchCurrentTournament()
        if (cancelled) return
        const hasReadyMatch = !!t && t.participants.includes(myUid) && t.bracket.some((r) =>
          r.matches.some((m) => m.status === 'ready' && (m.player1Uid === myUid || m.player2Uid === myUid)),
        )
        setTournamentBadge(hasReadyMatch ? 1 : 0)
      } catch {
        if (!cancelled) setTournamentBadge(0)
      }
    }
    void check()
    const id = setInterval(check, TOURNAMENT_POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [myUid])

  return { pending, unread, total: pending + unread, tournamentBadge }
}

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import {
  subscribeQuests, getQuestsSnapshot, loadQuests, markQuestProgress, claimQuest,
  type QuestState, type QuestKey,
} from './quests'

function utcDate(): string { return new Date().toISOString().slice(0, 10) }

/**
 * État réactif des quêtes du jour (charge au montage) + réclamation manuelle.
 * Vérifie chaque minute si la date UTC a changé → recharge (reset auto à 00:00 UTC).
 */
export function useDailyQuests(): { quests: QuestState | null; claim: (key: QuestKey) => void } {
  const quests = useSyncExternalStore(subscribeQuests, getQuestsSnapshot, getQuestsSnapshot)

  useEffect(() => { void loadQuests() }, [])

  // Reset automatique à 00:00 UTC : si la date UTC change, on recharge les quêtes.
  useEffect(() => {
    let current = utcDate()
    const id = setInterval(() => {
      const d = utcDate()
      if (d !== current) { current = d; void loadQuests() }
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  const claim = useCallback((key: QuestKey) => { void claimQuest(key) }, [])

  return { quests, claim }
}

/** Valide la quête « joue en ligne » une fois quand une partie démarre. */
export function usePlayOnlineQuest(isPlaying: boolean): void {
  const fired = useRef(false)
  useEffect(() => {
    if (isPlaying && !fired.current) {
      fired.current = true
      void markQuestProgress('playOnline')
    }
  }, [isPlaying])
}

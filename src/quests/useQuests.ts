import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  subscribeQuests, getQuestsSnapshot, loadQuests, markQuestProgress,
  type QuestState,
} from './quests'

/** État réactif des quêtes du jour (charge au montage). */
export function useDailyQuests(): QuestState | null {
  const state = useSyncExternalStore(subscribeQuests, getQuestsSnapshot, getQuestsSnapshot)
  useEffect(() => { void loadQuests() }, [])
  return state
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

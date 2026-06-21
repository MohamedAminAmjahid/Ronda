import { useSyncExternalStore } from 'react'
import {
  subscribe,
  getSnapshot,
  connectLobby,
  chooseTeam,
  startGame,
  leave,
  type LobbySlotView,
} from './lobby2v2'

export function useLobby2v2() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const mySlot: LobbySlotView | undefined = snap.slots.find((s) => s.key === snap.mySessionId)
  const humansConnected = snap.slots.filter((s) => !s.isBot && s.connected).length

  return {
    status: snap.status,
    code: snap.code,
    slots: snap.slots,
    error: snap.error,
    mySessionId: snap.mySessionId,
    isAdmin: mySlot?.isAdmin ?? false,
    myTeam: mySlot?.team ?? -1,
    canStart: (mySlot?.isAdmin ?? false) && humansConnected >= 2,
    // actions
    connectLobby,
    chooseTeam,
    startGame,
    leave,
  }
}

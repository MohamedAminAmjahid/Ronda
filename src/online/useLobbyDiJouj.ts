import { useSyncExternalStore, useCallback, useEffect } from 'react'
import { router } from 'expo-router'
import type { Href } from 'expo-router'
import {
  subscribe,
  getSnapshot,
  createLobby,
  joinLobbyByCode,
  setPlayerCount,
  startGame,
  leaveLobby,
  registerNavigate,
} from './lobbyDiJouj'

const DJ_ONLINE: Href = '/dijouj-online' as Href

export function useLobbyDiJouj() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // Register navigate function on mount
  useEffect(() => {
    registerNavigate((path) => router.push(path as Href))
    return () => registerNavigate(() => {})
  }, [])

  const connect = useCallback((pseudo: string) => {
    return createLobby(pseudo)
  }, [])

  const joinByCode = useCallback((pseudo: string, code: string) => {
    return joinLobbyByCode(pseudo, code)
  }, [])

  const changePlayerCount = useCallback((count: 2 | 4) => {
    setPlayerCount(count)
  }, [])

  const launch = useCallback(() => {
    startGame()
  }, [])

  const leave = useCallback(() => {
    leaveLobby()
  }, [])

  const mySlot = snap.slots.find(s => s.sessionId === snap.mySessionId)
  const isAdmin = mySlot?.isAdmin ?? false

  return {
    phase:       snap.phase,
    code:        snap.code,
    playerCount: snap.playerCount,
    slots:       snap.slots,
    mySessionId: snap.mySessionId,
    isAdmin,
    error:       snap.error,
    connect,
    joinByCode,
    setPlayerCount: changePlayerCount,
    startGame:      launch,
    leave,
  }
}

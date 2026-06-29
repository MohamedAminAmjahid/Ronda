import { useSyncExternalStore, useCallback, useEffect } from 'react'
import { router } from 'expo-router'
import type { Href } from 'expo-router'
import {
  subscribe,
  getSnapshot,
  createLobby,
  joinLobbyByCode,
  startGame,
  leaveLobby,
  registerNavigate,
} from './lobbyDiJouj'

export function useLobbyDiJouj() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    registerNavigate((path) => router.push(path as Href))
    return () => registerNavigate(() => {})
  }, [])

  const connect = useCallback((pseudo: string) => createLobby(pseudo), [])

  const joinByCode = useCallback((pseudo: string, code: string) => joinLobbyByCode(pseudo, code), [])

  const launch = useCallback(() => startGame(), [])

  const leave = useCallback(() => leaveLobby(), [])

  const mySlot = snap.slots.find(s => s.sessionId === snap.mySessionId)
  const isAdmin = mySlot?.isAdmin ?? false
  const adminSlot = snap.slots.find(s => s.isAdmin)

  return {
    phase:       snap.phase,
    code:        snap.code,
    slots:       snap.slots,
    mySessionId: snap.mySessionId,
    isAdmin,
    adminPseudo: adminSlot?.pseudo ?? '',
    error:       snap.error,
    connect,
    joinByCode,
    startGame:   launch,
    leave,
  }
}

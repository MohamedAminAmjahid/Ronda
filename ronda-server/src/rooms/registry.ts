// Registre en mémoire code de partie → { roomId, type }.
// Rempli par RondaRoom / LobbyRoom2v2 dans onCreate, vidé dans onDispose.
// Les routes HTTP /room/:code et /room/:code/type le consultent pour traduire
// un code lisible en roomId joignable (joinById) et en type de room.

export type RoomType = 'ronda' | 'ronda2v2'

interface RoomEntry {
  roomId: string
  type: RoomType
}

const codeToRoom = new Map<string, RoomEntry>()

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sans I/O/0/1 (ambigus)

/** Génère un code unique de 6 caractères alphanumériques (ex. AB3X7K). */
export function generateCode(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = ''
    for (let i = 0; i < 6; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
    }
    if (!codeToRoom.has(code)) return code
  }
  // Repli extrêmement improbable.
  return Date.now().toString(36).toUpperCase().slice(-6)
}

export function registerCode(code: string, roomId: string, type: RoomType): void {
  codeToRoom.set(code, { roomId, type })
}

export function unregisterCode(code: string): void {
  codeToRoom.delete(code)
}

/** roomId associé à un code, ou undefined si inconnu. */
export function resolveCode(code: string): string | undefined {
  return codeToRoom.get(code.toUpperCase())?.roomId
}

/** Entrée complète (roomId + type) associée à un code, ou undefined si inconnu. */
export function resolveCodeEntry(code: string): RoomEntry | undefined {
  return codeToRoom.get(code.toUpperCase())
}

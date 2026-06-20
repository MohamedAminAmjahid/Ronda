// Registre en mémoire code de partie → roomId Colyseus.
// Rempli par RondaRoom.onCreate, vidé par onDispose. La route HTTP /room/:code
// le consulte pour traduire un code lisible en roomId joignable (joinById).

const codeToRoomId = new Map<string, string>()

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sans I/O/0/1 (ambigus)

/** Génère un code unique de la forme RONDA-XXXX. */
export function generateCode(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let suffix = ''
    for (let i = 0; i < 4; i++) {
      suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
    }
    const code = `RONDA-${suffix}`
    if (!codeToRoomId.has(code)) return code
  }
  // Repli extrêmement improbable.
  return `RONDA-${Date.now().toString(36).toUpperCase().slice(-4)}`
}

export function registerCode(code: string, roomId: string): void {
  codeToRoomId.set(code, roomId)
}

export function unregisterCode(code: string): void {
  codeToRoomId.delete(code)
}

/** roomId associé à un code, ou undefined si inconnu. */
export function resolveCode(code: string): string | undefined {
  return codeToRoomId.get(code.toUpperCase())
}

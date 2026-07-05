// Repli « bot de secours » pour le matchmaking rapide.
//
// Si aucun joueur en ligne ne rejoint dans le délai imparti, la partie démarre
// contre un bot local — SANS jamais le révéler au joueur. Le bot porte un
// prénom/emoji crédible : côté UI, cela ressemble à un adversaire humain trouvé
// par le matchmaking. Utilisé par la Ronda ST et par Di Jouj.

/** Délai (secondes) avant de basculer sur un bot si aucun humain n'est trouvé. */
export const BOT_WAIT_SECS = 60

const NAMES: string[] = [
  // Filles — arabe / marocain
  'Fatima', 'Khadija', 'Nour', 'Salma', 'Hind', 'Zineb', 'Meryem', 'Yasmine',
  'Sofia', 'Imane', 'Aya', 'Lina', 'Rania', 'Douae', 'Ghita', 'Wiam',
  // Filles — français
  'Camille', 'Léa', 'Manon', 'Chloé', 'Emma', 'Juliette', 'Sarah', 'Inès',
  'Louise', 'Jade',
  // Filles — anglais
  'Emily', 'Sophie', 'Grace', 'Chloe', 'Olivia', 'Lily', 'Ava', 'Mia',
  'Ella', 'Ruby',
  // Garçons — arabe / marocain
  'Amin', 'Youssef', 'Karim', 'Omar', 'Rachid', 'Anas',
  // Garçons — français
  'Lucas', 'Hugo', 'Nathan', 'Théo',
  // Garçons — anglais
  'James', 'Oliver', 'Jack', 'Noah',
]
const EMOJIS: string[] = ['👩‍🦱', '👩🏻', '👩🏽‍🦳', '👩‍🦰', '🧑🏻', '👨🏽', '🧔🏽', '👩🏽']

/** Renvoie un prénom + emoji aléatoires pour déguiser le bot en adversaire humain. */
export function pickBot(): { name: string; emoji: string } {
  const name  = NAMES[Math.floor(Math.random() * NAMES.length)]  ?? 'Fatima'
  const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)] ?? '👤'
  return { name, emoji }
}

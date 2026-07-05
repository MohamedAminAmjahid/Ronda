// Repli « bot de secours » pour le matchmaking rapide.
//
// Si aucun joueur en ligne ne rejoint dans le délai imparti, la partie démarre
// contre un bot local — SANS jamais le révéler au joueur. Le bot porte un
// prénom/emoji crédible : côté UI, cela ressemble à un adversaire humain trouvé
// par le matchmaking. Utilisé par la Ronda ST et par Di Jouj.

/** Délai (secondes) avant de basculer sur un bot si aucun humain n'est trouvé. */
export const BOT_WAIT_SECS = 60

// Séparés par genre pour que l'emoji corresponde au prénom (arabe/marocain,
// français, anglais confondus).
const FEMALE_NAMES: string[] = [
  'Fatima', 'Khadija', 'Nour', 'Salma', 'Hind', 'Zineb', 'Meryem', 'Yasmine',
  'Sofia', 'Imane', 'Aya', 'Lina', 'Rania', 'Douae', 'Ghita', 'Wiam',
  'Camille', 'Léa', 'Manon', 'Chloé', 'Emma', 'Juliette', 'Sarah', 'Inès',
  'Louise', 'Jade',
  'Emily', 'Sophie', 'Grace', 'Olivia', 'Lily', 'Ava', 'Mia', 'Ella', 'Ruby',
]
const MALE_NAMES: string[] = [
  'Amin', 'Youssef', 'Karim', 'Omar', 'Rachid', 'Anas',
  'Lucas', 'Hugo', 'Nathan', 'Théo',
  'James', 'Oliver', 'Jack', 'Noah',
]
const FEMALE_EMOJIS: string[] = ['👩🏻', '👩🏽', '👩🏾', '👩‍🦱', '👩‍🦰', '👩🏽‍🦳', '👧🏻', '👩🏻‍🦳']
const MALE_EMOJIS:   string[] = ['👨🏻', '👨🏽', '🧔🏽', '👦🏻', '👨🏾', '🧑🏻']

function pick<T>(arr: T[], fallback: T): T {
  return arr[Math.floor(Math.random() * arr.length)] ?? fallback
}

/**
 * Renvoie un prénom + emoji aléatoires pour déguiser le bot en adversaire humain.
 * Choisit d'abord un genre (70 % fille, 30 % garçon) puis un nom et un emoji
 * cohérents avec ce genre.
 */
export function pickBot(): { name: string; emoji: string } {
  const female = Math.random() < 0.7
  const name  = female ? pick(FEMALE_NAMES, 'Fatima') : pick(MALE_NAMES, 'Amin')
  const emoji = female ? pick(FEMALE_EMOJIS, '👩🏻')   : pick(MALE_EMOJIS, '👨🏻')
  return { name, emoji }
}

import { getFirestore, doc, getDoc, setDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore'
import { firebaseApp } from '../firebase/config'

// Repli « bot de secours » pour le matchmaking rapide.
//
// Si aucun joueur en ligne ne rejoint dans le délai imparti, la partie démarre
// contre un bot local — SANS jamais le révéler au joueur. Le bot porte un
// prénom/emoji/avatar crédibles : côté UI, cela ressemble à un adversaire
// humain trouvé par le matchmaking. Utilisé par la Ronda ST et par Di Jouj.

const db = () => getFirestore(firebaseApp)

/**
 * Délai aléatoire (15–70 s) avant de basculer sur un bot si aucun humain n'est
 * trouvé. Aléatoire (et non fixe) pour qu'un joueur ne puisse pas deviner, en
 * comptant les secondes, que l'adversaire est un bot de secours. Distribution
 * pondérée plutôt qu'uniforme : la plupart des recherches durent 20–40 s
 * (typique), avec une minorité de cas rapides (15–20 s) ou longs (40–70 s)
 * pour rester crédible.
 */
export function getBotWaitSecs(): number {
  const r = Math.random()
  if (r < 0.70) {
    // 70 % → entre 20 et 40 secondes (cas typique)
    return Math.floor(Math.random() * (40 - 20 + 1)) + 20
  } else if (r < 0.85) {
    // 15 % → entre 15 et 20 secondes (rapide)
    return Math.floor(Math.random() * (20 - 15 + 1)) + 15
  } else {
    // 15 % → entre 40 et 70 secondes (long)
    return Math.floor(Math.random() * (70 - 40 + 1)) + 40
  }
}

// ── Noms ──────────────────────────────────────────────────────────────────────
// Séparés par genre pour que l'emoji corresponde au prénom (arabe/marocain,
// français, anglais confondus). FEMALE_NAMES[i] / MALE_NAMES[i] correspond à
// la photo FEMALE_AVATARS[i] / MALE_AVATARS[i] (même index).
const FEMALE_NAMES: string[] = [
  'Fatima', 'Khadija', 'Nour', 'Salma', 'Hind', 'Zineb', 'Meryem', 'Yasmine',
  'Sofia', 'Imane', 'Aya', 'Lina', 'Rania', 'Douae', 'Ghita', 'Wiam',
  'Camille', 'Léa', 'Manon', 'Chloé', 'Emma', 'Juliette', 'Sarah', 'Inès',
  'Louise', 'Jade',
  'Emily', 'Sophie', 'Grace', 'Olivia', 'Lily', 'Ava', 'Mia', 'Ella', 'Ruby',
  'Hajar', 'Houda', 'Siham', 'Sanaa', 'Nadia', 'Céline', 'Marine', 'Chloe', 'Hannah',
]
const MALE_NAMES: string[] = [
  'Amin', 'Youssef', 'Karim', 'Omar', 'Rachid', 'Anas',
  'Lucas', 'Hugo', 'Nathan', 'Théo',
  'James', 'Oliver', 'Jack', 'Noah',
  'Mehdi', 'Hamza', 'Bilal', 'Soufiane', 'Tariq', 'Walid', 'Maxime', 'Antoine', 'Thomas', 'Liam', 'Ethan',
]
const FEMALE_EMOJIS: string[] = ['👩🏻', '👩🏽', '👩🏾', '👩‍🦱', '👩‍🦰', '👩🏽‍🦳', '👧🏻', '👩🏻‍🦳']
const MALE_EMOJIS:   string[] = ['👨🏻', '👨🏽', '🧔🏽', '👦🏻', '👨🏾', '🧑🏻']

// ── Avatars ───────────────────────────────────────────────────────────────────
// URLs statiques (PAS de require()) — les photos sont servies directement
// depuis public/bot-avatars/{Women,Man}/ sans passer par le bundler Metro.
// Index i ↔ FEMALE_NAMES[i] / MALE_NAMES[i].
//
// NB : require() d'images est préfixé par Expo/Metro d'un « /assets/ »
// supplémentaire sur le web, quel que soit l'emplacement du fichier dans le
// projet (assets/ racine, src/assets/…) — ce qui cassait systématiquement
// l'URL (404). Les fichiers statiques de public/ sont servis tels quels par
// Vercel/Expo web, sans transformation ni préfixe : c'est la seule solution
// fiable pour cette liste d'images choisies dynamiquement par index.

export const FEMALE_AVATARS: string[] = [
  '/bot-avatars/Women/1.jpeg',
  '/bot-avatars/Women/10.jpeg',
  '/bot-avatars/Women/11.jpeg',
  '/bot-avatars/Women/14.jpeg',
  '/bot-avatars/Women/15.jpeg',
  '/bot-avatars/Women/16.jpeg',
  '/bot-avatars/Women/17.jpeg',
  '/bot-avatars/Women/21.jpeg',
  '/bot-avatars/Women/23.jpeg',
  '/bot-avatars/Women/24.jpeg',
  '/bot-avatars/Women/25.jpeg',
  '/bot-avatars/Women/27.jpeg',
  '/bot-avatars/Women/28.jpeg',
  '/bot-avatars/Women/29.jpeg',
  '/bot-avatars/Women/3.jpeg',
  '/bot-avatars/Women/323.jpeg',
  '/bot-avatars/Women/33.jpeg',
  '/bot-avatars/Women/35.jpeg',
  '/bot-avatars/Women/37.jpeg',
  '/bot-avatars/Women/40.jpeg',
  '/bot-avatars/Women/41.jpeg',
  '/bot-avatars/Women/43.jpeg',
  '/bot-avatars/Women/48.jpeg',
  '/bot-avatars/Women/49.jpeg',
  '/bot-avatars/Women/5.jpeg',
  '/bot-avatars/Women/50.jpg',
  '/bot-avatars/Women/51.jpg',
  '/bot-avatars/Women/52.jpg',
  '/bot-avatars/Women/53.jpg',
  '/bot-avatars/Women/54.jpg',
  '/bot-avatars/Women/55.jpg',
  '/bot-avatars/Women/56.jpg',
  '/bot-avatars/Women/57.jpg',
  '/bot-avatars/Women/58.jpg',
  '/bot-avatars/Women/59.jpg',
  '/bot-avatars/Women/60.jpg',
  '/bot-avatars/Women/61.jpg',
  '/bot-avatars/Women/62.jpg',
  '/bot-avatars/Women/8.jpeg',
  '/bot-avatars/Women/9.jpeg',
  '/bot-avatars/Women/nature1.jpg',
  '/bot-avatars/Women/nature2.jpg',
  '/bot-avatars/Women/nature3.jpg',
  '/bot-avatars/Women/nature4.jpg',
]

export const MALE_AVATARS: string[] = [
  '/bot-avatars/Man/100.jpg',
  '/bot-avatars/Man/101.jpg',
  '/bot-avatars/Man/102.jpg',
  '/bot-avatars/Man/12.jpeg',
  '/bot-avatars/Man/13.jpeg',
  '/bot-avatars/Man/18.jpeg',
  '/bot-avatars/Man/19.jpeg',
  '/bot-avatars/Man/2.jpeg',
  '/bot-avatars/Man/20.jpeg',
  '/bot-avatars/Man/22.jpeg',
  '/bot-avatars/Man/26.jpeg',
  '/bot-avatars/Man/30.jpeg',
  '/bot-avatars/Man/31.jpeg',
  '/bot-avatars/Man/34.jpeg',
  '/bot-avatars/Man/36.jpeg',
  '/bot-avatars/Man/38.jpeg',
  '/bot-avatars/Man/39.jpeg',
  '/bot-avatars/Man/4.jpeg',
  '/bot-avatars/Man/42.jpeg',
  '/bot-avatars/Man/44.jpeg',
  '/bot-avatars/Man/45.jpeg',
  '/bot-avatars/Man/46.jpeg',
  '/bot-avatars/Man/47.jpeg',
  '/bot-avatars/Man/6.jpeg',
  '/bot-avatars/Man/7.jpeg',
]

/** URL statique (fichier public/) de l'avatar du bot n°`idx` de ce genre. */
export function getBotAvatar(idx: number, female: boolean): string {
  const list = female ? FEMALE_AVATARS : MALE_AVATARS
  return list[idx] ?? list[0] ?? ''
}

function pick<T>(arr: T[], fallback: T): T {
  return arr[Math.floor(Math.random() * arr.length)] ?? fallback
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Renvoie un prénom + emoji + avatar aléatoires pour déguiser le bot en
 * adversaire humain. Choisit d'abord un genre (70 % fille, 30 % garçon), puis
 * un index qui détermine À LA FOIS le prénom et la photo (même index dans les
 * deux listes), et enfin un emoji indépendant (simple détail visuel de repli).
 */
export function pickBot(): { name: string; emoji: string; avatarIdx: number; female: boolean } {
  const female = Math.random() < 0.7
  const names  = female ? FEMALE_NAMES : MALE_NAMES
  const avatarIdx = Math.floor(Math.random() * names.length)
  const name  = names[avatarIdx] ?? (female ? 'Fatima' : 'Amin')
  const emoji = female ? pick(FEMALE_EMOJIS, '👩🏻') : pick(MALE_EMOJIS, '👨🏻')
  return { name, emoji, avatarIdx, female }
}

// ── Bots fantômes dans Firestore ─────────────────────────────────────────────
// Chaque bot de secours a un profil Firestore stable (uid déterministe à
// partir de son prénom) avec des statistiques aléatoires réalistes, pour
// tenir la fiction d'un vrai joueur si son profil est un jour consulté.

function botUid(name: string): string {
  return `bot_${name.toLowerCase()}`
}

/**
 * Crée le profil fantôme du bot dans Firestore s'il n'existe pas déjà
 * (idempotent — vérifie d'abord). Ne bloque jamais le jeu : à appeler en
 * arrière-plan (sans attendre la promesse) autour du repli bot.
 */
export async function getOrCreateBotProfile(name: string, idx: number, female: boolean): Promise<void> {
  try {
    const uid = botUid(name)
    const ref = doc(db(), 'users', uid)
    const snap = await getDoc(ref)
    if (snap.exists()) return

    const level        = randInt(3, 18)
    const gamesPlayed  = randInt(50, 250)
    const rondaPlayed  = Math.round(gamesPlayed * 0.5)
    const dijoujPlayed = gamesPlayed - rondaPlayed
    const winRate      = randInt(40, 70) / 100
    const rondaWon     = Math.round(rondaPlayed  * winRate)
    const dijoujWon    = Math.round(dijoujPlayed * winRate)
    const gold         = randInt(500, 3000)
    // URL statique réelle (voir FEMALE_AVATARS/MALE_AVATARS) — s'affiche
    // normalement via AvatarDisplay type="image", comme un vrai joueur.
    const avatarImage  = getBotAvatar(idx, female)

    await setDoc(ref, {
      username:      name,
      usernameLower: name.toLowerCase(),
      isBot:         true,
      level,
      xp:            0,
      gold,
      gamesPlayed,
      gamesWon:      rondaWon + dijoujWon,
      rondaPlayed,
      rondaWon,
      dijoujPlayed,
      dijoujWon,
      avatarType:  'image',
      avatarEmoji: '',
      avatarImage,
      avatarFrame: 'none',
      statsPublic: true,
      goldHistoryPublic: false,
      createdAt: serverTimestamp(),
      lastSeen:  serverTimestamp(),
    })
  } catch (e) {
    // Best-effort : un profil fantôme manquant ne doit jamais bloquer le jeu.
    console.error('[botFallback] getOrCreateBotProfile:', e)
  }
}

/**
 * Met à jour les stats du bot dans Firestore quand il gagne une partie misée
 * (le joueur perd) : +1 partie jouée (globale + par jeu), +1 victoire (globale
 * + par jeu), et le gold misé lui revient. Utilise increment() pour éviter
 * toute lecture préalable ; best-effort — ne bloque jamais le jeu.
 */
export async function updateBotStats(
  name: string, game: 'ronda' | 'dijouj', stakeBet: number,
): Promise<void> {
  try {
    const ref = doc(db(), 'users', botUid(name))
    const playedField = game === 'ronda' ? 'rondaPlayed' : 'dijoujPlayed'
    const wonField     = game === 'ronda' ? 'rondaWon'    : 'dijoujWon'
    await updateDoc(ref, {
      gamesPlayed: increment(1),
      gamesWon:    increment(1),
      [playedField]: increment(1),
      [wonField]:    increment(1),
      gold:        increment(Math.max(0, stakeBet)),
      lastSeen:    serverTimestamp(),
    })
  } catch (e) {
    console.error('[botFallback] updateBotStats:', e)
  }
}

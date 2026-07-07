import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { firebaseApp } from '../firebase/config'

// Repli « bot de secours » pour le matchmaking rapide.
//
// Si aucun joueur en ligne ne rejoint dans le délai imparti, la partie démarre
// contre un bot local — SANS jamais le révéler au joueur. Le bot porte un
// prénom/emoji/avatar crédibles : côté UI, cela ressemble à un adversaire
// humain trouvé par le matchmaking. Utilisé par la Ronda ST et par Di Jouj.

const db = () => getFirestore(firebaseApp)

/**
 * Délai aléatoire (25–70 s) avant de basculer sur un bot si aucun humain n'est
 * trouvé. Aléatoire (et non fixe) pour qu'un joueur ne puisse pas deviner, en
 * comptant les secondes, que l'adversaire est un bot de secours.
 */
export function getBotWaitSecs(): number {
  return Math.floor(Math.random() * (70 - 25 + 1)) + 25
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
// require() statiques (Metro l'exige) — un par fichier de assets/bot-avatars/.
// Index i ↔ FEMALE_NAMES[i] / MALE_NAMES[i].

export const FEMALE_AVATARS: number[] = [
  require('../../assets/bot-avatars/Women/1.jpeg'),
  require('../../assets/bot-avatars/Women/10.jpeg'),
  require('../../assets/bot-avatars/Women/11.jpeg'),
  require('../../assets/bot-avatars/Women/14.jpeg'),
  require('../../assets/bot-avatars/Women/15.jpeg'),
  require('../../assets/bot-avatars/Women/16.jpeg'),
  require('../../assets/bot-avatars/Women/17.jpeg'),
  require('../../assets/bot-avatars/Women/21.jpeg'),
  require('../../assets/bot-avatars/Women/23.jpeg'),
  require('../../assets/bot-avatars/Women/24.jpeg'),
  require('../../assets/bot-avatars/Women/25.jpeg'),
  require('../../assets/bot-avatars/Women/27.jpeg'),
  require('../../assets/bot-avatars/Women/28.jpeg'),
  require('../../assets/bot-avatars/Women/29.jpeg'),
  require('../../assets/bot-avatars/Women/3.jpeg'),
  require('../../assets/bot-avatars/Women/323.jpeg'),
  require('../../assets/bot-avatars/Women/33.jpeg'),
  require('../../assets/bot-avatars/Women/35.jpeg'),
  require('../../assets/bot-avatars/Women/37.jpeg'),
  require('../../assets/bot-avatars/Women/40.jpeg'),
  require('../../assets/bot-avatars/Women/41.jpeg'),
  require('../../assets/bot-avatars/Women/43.jpeg'),
  require('../../assets/bot-avatars/Women/48.jpeg'),
  require('../../assets/bot-avatars/Women/49.jpeg'),
  require('../../assets/bot-avatars/Women/5.jpeg'),
  require('../../assets/bot-avatars/Women/50.jpg'),
  require('../../assets/bot-avatars/Women/51.jpg'),
  require('../../assets/bot-avatars/Women/52.jpg'),
  require('../../assets/bot-avatars/Women/53.jpg'),
  require('../../assets/bot-avatars/Women/54.jpg'),
  require('../../assets/bot-avatars/Women/55.jpg'),
  require('../../assets/bot-avatars/Women/56.jpg'),
  require('../../assets/bot-avatars/Women/57.jpg'),
  require('../../assets/bot-avatars/Women/58.jpg'),
  require('../../assets/bot-avatars/Women/59.jpg'),
  require('../../assets/bot-avatars/Women/60.jpg'),
  require('../../assets/bot-avatars/Women/61.jpg'),
  require('../../assets/bot-avatars/Women/62.jpg'),
  require('../../assets/bot-avatars/Women/8.jpeg'),
  require('../../assets/bot-avatars/Women/9.jpeg'),
  require('../../assets/bot-avatars/Women/nature1.jpg'),
  require('../../assets/bot-avatars/Women/nature2.jpg'),
  require('../../assets/bot-avatars/Women/nature3.jpg'),
  require('../../assets/bot-avatars/Women/nature4.jpg'),
]

export const MALE_AVATARS: number[] = [
  require('../../assets/bot-avatars/Man/100.jpg'),
  require('../../assets/bot-avatars/Man/101.jpg'),
  require('../../assets/bot-avatars/Man/102.jpg'),
  require('../../assets/bot-avatars/Man/12.jpeg'),
  require('../../assets/bot-avatars/Man/13.jpeg'),
  require('../../assets/bot-avatars/Man/18.jpeg'),
  require('../../assets/bot-avatars/Man/19.jpeg'),
  require('../../assets/bot-avatars/Man/2.jpeg'),
  require('../../assets/bot-avatars/Man/20.jpeg'),
  require('../../assets/bot-avatars/Man/22.jpeg'),
  require('../../assets/bot-avatars/Man/26.jpeg'),
  require('../../assets/bot-avatars/Man/30.jpeg'),
  require('../../assets/bot-avatars/Man/31.jpeg'),
  require('../../assets/bot-avatars/Man/34.jpeg'),
  require('../../assets/bot-avatars/Man/36.jpeg'),
  require('../../assets/bot-avatars/Man/38.jpeg'),
  require('../../assets/bot-avatars/Man/39.jpeg'),
  require('../../assets/bot-avatars/Man/4.jpeg'),
  require('../../assets/bot-avatars/Man/42.jpeg'),
  require('../../assets/bot-avatars/Man/44.jpeg'),
  require('../../assets/bot-avatars/Man/45.jpeg'),
  require('../../assets/bot-avatars/Man/46.jpeg'),
  require('../../assets/bot-avatars/Man/47.jpeg'),
  require('../../assets/bot-avatars/Man/6.jpeg'),
  require('../../assets/bot-avatars/Man/7.jpeg'),
]

/** Avatar (asset local require()'d) du bot n°`idx` de ce genre. */
export function getBotAvatar(idx: number, female: boolean): number {
  const list = female ? FEMALE_AVATARS : MALE_AVATARS
  return list[idx] ?? list[0]
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
    const avatarImage  = female ? `bot_f${idx}` : `bot_m${idx}`

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

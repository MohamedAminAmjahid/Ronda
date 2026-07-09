// Miroir de src/online/botFallback.ts (client) — mêmes noms, mêmes avatars,
// même schéma d'uid (bot_<prénom minuscule>). Nécessaire pour que les bots
// ajoutés automatiquement à un tournoi (generateBracket, voir
// tournamentQueries.ts) soient strictement indiscernables des bots de repli
// du matchmaking : même déguisement, mêmes uids potentiels, donc si le MÊME
// nom a déjà été utilisé par un repli matchmaking client, ensureBotProfile()
// retrouve et réutilise ce profil existant plutôt que d'en créer un doublon.
//
// Cette liste est dupliquée (pas partagée via un package commun) — ce repo
// n'a pas d'outillage de monorepo/workspace entre le client Expo et
// ronda-server ; à resynchroniser manuellement si botFallback.ts change.

export const FEMALE_NAMES: string[] = [
  'Fatima', 'Khadija', 'Nour', 'Salma', 'Hind', 'Zineb', 'Meryem', 'Yasmine',
  'Sofia', 'Imane', 'Aya', 'Lina', 'Rania', 'Douae', 'Ghita', 'Wiam',
  'Camille', 'Léa', 'Manon', 'Chloé', 'Emma', 'Juliette', 'Sarah', 'Inès',
  'Louise', 'Jade',
  'Emily', 'Sophie', 'Grace', 'Olivia', 'Lily', 'Ava', 'Mia', 'Ella', 'Ruby',
  'Hajar', 'Houda', 'Siham', 'Sanaa', 'Nadia', 'Céline', 'Marine', 'Chloe', 'Hannah',
]
export const MALE_NAMES: string[] = [
  'Amin', 'Youssef', 'Karim', 'Omar', 'Rachid', 'Anas',
  'Lucas', 'Hugo', 'Nathan', 'Théo',
  'James', 'Oliver', 'Jack', 'Noah',
  'Mehdi', 'Hamza', 'Bilal', 'Soufiane', 'Tariq', 'Walid', 'Maxime', 'Antoine', 'Thomas', 'Liam', 'Ethan',
]

export const FEMALE_AVATARS: string[] = [
  '/bot-avatars/Women/1.jpeg', '/bot-avatars/Women/10.jpeg', '/bot-avatars/Women/11.jpeg',
  '/bot-avatars/Women/14.jpeg', '/bot-avatars/Women/15.jpeg', '/bot-avatars/Women/16.jpeg',
  '/bot-avatars/Women/17.jpeg', '/bot-avatars/Women/21.jpeg', '/bot-avatars/Women/23.jpeg',
  '/bot-avatars/Women/24.jpeg', '/bot-avatars/Women/25.jpeg', '/bot-avatars/Women/27.jpeg',
  '/bot-avatars/Women/28.jpeg', '/bot-avatars/Women/29.jpeg', '/bot-avatars/Women/3.jpeg',
  '/bot-avatars/Women/323.jpeg', '/bot-avatars/Women/33.jpeg', '/bot-avatars/Women/35.jpeg',
  '/bot-avatars/Women/37.jpeg', '/bot-avatars/Women/40.jpeg', '/bot-avatars/Women/41.jpeg',
  '/bot-avatars/Women/43.jpeg', '/bot-avatars/Women/48.jpeg', '/bot-avatars/Women/49.jpeg',
  '/bot-avatars/Women/5.jpeg', '/bot-avatars/Women/50.jpg', '/bot-avatars/Women/51.jpg',
  '/bot-avatars/Women/52.jpg', '/bot-avatars/Women/53.jpg', '/bot-avatars/Women/54.jpg',
  '/bot-avatars/Women/55.jpg', '/bot-avatars/Women/56.jpg', '/bot-avatars/Women/57.jpg',
  '/bot-avatars/Women/58.jpg', '/bot-avatars/Women/59.jpg', '/bot-avatars/Women/60.jpg',
  '/bot-avatars/Women/61.jpg', '/bot-avatars/Women/62.jpg', '/bot-avatars/Women/8.jpeg',
  '/bot-avatars/Women/9.jpeg', '/bot-avatars/Women/nature1.jpg', '/bot-avatars/Women/nature2.jpg',
  '/bot-avatars/Women/nature3.jpg', '/bot-avatars/Women/nature4.jpg',
]

export const MALE_AVATARS: string[] = [
  '/bot-avatars/Man/100.jpg', '/bot-avatars/Man/101.jpg', '/bot-avatars/Man/102.jpg',
  '/bot-avatars/Man/12.jpeg', '/bot-avatars/Man/13.jpeg', '/bot-avatars/Man/18.jpeg',
  '/bot-avatars/Man/19.jpeg', '/bot-avatars/Man/2.jpeg', '/bot-avatars/Man/20.jpeg',
  '/bot-avatars/Man/22.jpeg', '/bot-avatars/Man/26.jpeg', '/bot-avatars/Man/30.jpeg',
  '/bot-avatars/Man/31.jpeg', '/bot-avatars/Man/34.jpeg', '/bot-avatars/Man/36.jpeg',
  '/bot-avatars/Man/38.jpeg', '/bot-avatars/Man/39.jpeg', '/bot-avatars/Man/4.jpeg',
  '/bot-avatars/Man/42.jpeg', '/bot-avatars/Man/44.jpeg', '/bot-avatars/Man/45.jpeg',
  '/bot-avatars/Man/46.jpeg', '/bot-avatars/Man/47.jpeg', '/bot-avatars/Man/6.jpeg',
  '/bot-avatars/Man/7.jpeg',
]

/** URL statique (fichier public/ du client) de l'avatar du bot n°`idx` de ce genre. */
export function getBotAvatar(idx: number, female: boolean): string {
  const list = female ? FEMALE_AVATARS : MALE_AVATARS
  return list[idx] ?? list[0] ?? ''
}

export interface BotIdentity {
  uid: string
  name: string
  avatarIdx: number
  female: boolean
}

/** uid déterministe à partir du prénom — même schéma que botUid() côté
 * client (botFallback.ts) : bot_<prénom minuscule>. */
function botUid(name: string): string {
  return `bot_${name.toLowerCase()}`
}

/**
 * Roster de tous les bots potentiels (même pairing index↔prénom↔avatar que
 * pickBot() côté client). Un tournoi qui manque de joueurs humains tire au
 * hasard dans cette liste (voir generateBracket, tournamentQueries.ts).
 */
export const ALL_BOTS: BotIdentity[] = [
  ...FEMALE_NAMES.map((name, avatarIdx): BotIdentity => ({ uid: botUid(name), name, avatarIdx, female: true })),
  ...MALE_NAMES.map((name, avatarIdx): BotIdentity => ({ uid: botUid(name), name, avatarIdx, female: false })),
]

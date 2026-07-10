import type { VercelRequest, VercelResponse } from '@vercel/node'

const FIREBASE_PROJECT = 'cartestm-game'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { username } = req.query as { username: string }

  // Détecte les bots WhatsApp/Facebook/Twitter/Google/etc.
  const ua = req.headers['user-agent'] ?? ''
  const isBot = /whatsapp|facebookexternalhit|twitterbot|googlebot|linkedinbot|slackbot|discordbot|telegrambot/i.test(ua)

  if (!isBot) {
    // Utilisateur normal → redirige vers la SPA (rendu client).
    return res.redirect(302, `/profil/${username}`)
  }

  // Bot → fetch le profil depuis Firestore REST API et renvoie du HTML avec
  // les balises Open Graph (les crawlers n'exécutent pas de JS).
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/users?orderBy=usernameLower&startAt=${username.toLowerCase()}&endAt=${username.toLowerCase()}&pageSize=1`
    const firestoreRes = await fetch(url)
    const data = await firestoreRes.json()
    const doc = data.documents?.[0]?.fields

    const pseudo = doc?.username?.stringValue ?? username
    const level = doc?.level?.integerValue ?? '1'
    const gamesWon = doc?.gamesWon?.integerValue ?? '0'
    const statsPublic = doc?.statsPublic?.booleanValue !== false

    const title = `${pseudo} — Joueur Ronda · Niveau ${level}`
    const description = statsPublic
      ? `${gamesWon} victoires · Joue sur Dar Lwar9a TM`
      : `Joueur sur Dar Lwar9a TM`
    const image = `https://ronda-virid.vercel.app/icons/icon-512.png`
    const url2 = `https://ronda-virid.vercel.app/profil/${username}`

    return res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:url" content="${url2}" />
  <meta property="og:type" content="profile" />
  <meta name="twitter:card" content="summary" />
  <meta http-equiv="refresh" content="0;url=${url2}" />
</head>
<body><p>Redirection...</p></body>
</html>`)
  } catch {
    return res.redirect(302, `/profil/${username}`)
  }
}

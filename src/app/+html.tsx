import { ScrollViewStyleReset } from 'expo-router/html'
import { type PropsWithChildren } from 'react'

// Document HTML racine (web uniquement). Injecte le manifeste PWA et la couleur
// de thème. Le service worker de cache PWA (/sw.js) n'est PLUS enregistré : il
// causait des versions périmées (Ctrl+Shift+R nécessaire à chaque déploiement).
// Le /sw.js restant est un « kill switch » qui se désinstalle tout seul chez les
// utilisateurs qui l'avaient déjà. Seul firebase-messaging-sw.js (push FCM) reste
// enregistré, via src/push/push.ts.

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta name="theme-color" content="#0D0D1A" />
        <title>Dar Lwar9a TM — Ronda & Di Jouj en ligne</title>
        <meta name="description" content="Dar Lwar9a TM — Jouez à la Ronda et Di Jouj en ligne. Jeux de cartes marocains traditionnels." />
        <meta name="keywords" content="ronda, di jouj, jeux cartes marocains, lwar9a, jeu carte maroc" />
        <meta property="og:title" content="Dar Lwar9a TM" />
        <meta property="og:description" content="Jouez à la Ronda et Di Jouj en ligne" />
        <meta property="og:type" content="website" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Lwar9a" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <ScrollViewStyleReset />
        <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6001850530671722" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  )
}

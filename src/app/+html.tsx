import { ScrollViewStyleReset } from 'expo-router/html'
import { type PropsWithChildren } from 'react'

// Document HTML racine (web uniquement). Injecte le manifeste PWA, la couleur de
// thème et enregistre le service worker au chargement.
const SW_REGISTER = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function (e) {
      console.warn('[sw] enregistrement échoué', e)
    })
  })
}
`

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
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Lwar9a" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <ScrollViewStyleReset />
        <script dangerouslySetInnerHTML={{ __html: SW_REGISTER }} />
        <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6001850530671722" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  )
}

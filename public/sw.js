/* Service worker Dar Lwar9a TM — cache-first pour les assets, network-first pour l'API. */
/* global self, caches, fetch */
const CACHE = 'lwar9a-v1'
const PRECACHE = ['/', '/index.html', '/manifest.json', '/icons/icon-192.svg', '/icons/icon-512.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Chemins API (serveur Railway) → network-first.
const API_PREFIXES = ['/gold', '/notify', '/room', '/leaderboard', '/league', '/stats', '/games', '/health']

// Domaines externes à ignorer complètement (ni cache, ni interception) : le SW
// les laisse au navigateur pour éviter les erreurs CORS en console (pubs, Firebase, API).
const SKIP_DOMAINS = [
  'pagead2.googlesyndication.com',
  'googleads.g.doubleclick.net',
  'www.googletagservices.com',
  'firebase.googleapis.com',
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'rondatm.up.railway.app',
]

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (SKIP_DOMAINS.some((d) => url.hostname.includes(d))) {
    return // laisse le navigateur gérer normalement
  }

  const req = event.request
  if (req.method !== 'GET') return

  const sameOrigin = url.origin === self.location.origin
  const isApi = !sameOrigin || API_PREFIXES.some((p) => url.pathname.startsWith(p))

  if (isApi) {
    // network-first : on tente le réseau, repli sur le cache si hors-ligne.
    event.respondWith(fetch(req).catch(() => caches.match(req)))
    return
  }

  // cache-first pour les assets same-origin (repli sur /index.html pour la navigation).
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(req, clone))
          }
          return res
        })
        .catch(() => (req.mode === 'navigate' ? caches.match('/index.html') : undefined))
    }),
  )
})

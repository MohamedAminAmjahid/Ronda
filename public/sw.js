/* Service worker « kill switch » : se désinstalle et purge tout le cache PWA.
 *
 * Les navigateurs qui ont déjà enregistré /sw.js récupèrent automatiquement cette
 * version à la prochaine visite (mise à jour du SW), vident tous les caches, puis
 * rechargent les onglets ouverts. Plus aucun cache PWA → plus besoin de
 * Ctrl+Shift+R à chaque déploiement. Aucun nouvel enregistrement n'est fait
 * côté client (voir src/app/+html.tsx). */
/* global self, caches */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.matchAll({ type: 'client' }))
     .then(clients => clients.forEach(c => c.navigate(c.url)))
  )
})

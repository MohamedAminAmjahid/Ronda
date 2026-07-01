/* Service worker FCM (web) — reçoit les notifications en arrière-plan.
   Placé dans public/ pour être servi à la racine du site (web). */
/* global importScripts, firebase, self */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyDyThSXX2nLgmevXUeUSQtCWTYtqlO4nrk',
  authDomain: 'cartestm-game.firebaseapp.com',
  projectId: 'cartestm-game',
  storageBucket: 'cartestm-game.firebasestorage.app',
  messagingSenderId: '777277778143',
  appId: '1:777277778143:web:39960aac33ef67d0d1a16a',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'Dar Lwar9a'
  const body = (payload.notification && payload.notification.body) || ''
  self.registration.showNotification(title, { body, icon: '/icon.png' })
})

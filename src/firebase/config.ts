import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'

const firebaseConfig = {
  apiKey: 'AIzaSyDyThSXX2nLgmevXUeUSQtCWTYtqlO4nrk',
  authDomain: 'cartestm-game.firebaseapp.com',
  projectId: 'cartestm-game',
  storageBucket: 'cartestm-game.firebasestorage.app',
  messagingSenderId: '777277778143',
  appId: '1:777277778143:web:39960aac33ef67d0d1a16a',
}

// Initialisation idempotente (Expo recharge les modules en dev / fast refresh).
export const firebaseApp: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)

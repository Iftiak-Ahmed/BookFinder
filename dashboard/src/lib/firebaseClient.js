import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

if (!configured) {
  console.error(
    'Missing VITE_FIREBASE_* variables. Copy dashboard/.env.example to dashboard/.env, ' +
      'fill it in, and restart `npm run dev`. Running without realtime updates until then.'
  );
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? join(__dirname, '../../serviceAccountKey.json');

const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf-8'));

initializeApp({ credential: cert(serviceAccount) });

export const db = getFirestore();
export { FieldValue };

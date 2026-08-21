import { db } from '../db/firebaseAdmin.js';

const SETTINGS_DOC = 'librarySettings/config';

/** Used whenever the settings doc hasn't been created/edited yet. */
export const DEFAULT_SETTINGS = {
  borrowingDays: 14,
  graceDays: 0,
  finePerDay: 5,
  maxBooksPerStudent: 5,
  sessionTimeoutSeconds: 60,
};

let cached = { ...DEFAULT_SETTINGS };
let started = false;

/** Cached like shelfMap — one onSnapshot listener keeps every reader of
 *  getSettings() current without needing a backend restart after a change. */
export function startLibrarySettingsListener() {
  if (started) return;
  started = true;

  db.doc(SETTINGS_DOC).onSnapshot(
    (doc) => {
      cached = doc.exists ? { ...DEFAULT_SETTINGS, ...doc.data() } : { ...DEFAULT_SETTINGS };
    },
    (err) => {
      console.error('[settings] Listener error, keeping last known settings:', err.message);
    }
  );
}

export function getSettings() {
  return cached;
}

export async function updateSettings(patch) {
  const clean = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (patch[key] !== undefined && patch[key] !== null && !Number.isNaN(Number(patch[key]))) {
      clean[key] = Number(patch[key]);
    }
  }

  await db.doc(SETTINGS_DOC).set(clean, { merge: true });
  return { ...cached, ...clean };
}

import { db, FieldValue } from '../db/firebaseAdmin.js';
import { READERS } from '../readerCatalog.js';
import { raiseNotification } from './notifications.js';

/** No scan from a reader within this window flips it to offline. All 7
 *  readers share one ESP32/serial link in the current hardware, so this is a
 *  liveness heuristic (last-seen) rather than a true per-device heartbeat. */
const OFFLINE_THRESHOLD_MS = 90_000;
const SWEEP_INTERVAL_MS = 30_000;

/** Ensures every known reader has a status doc, so the Settings page's
 *  reader table is populated even before a single scan has arrived. */
export async function ensureReadersSeeded() {
  const batch = db.batch();
  for (const [readerId, info] of Object.entries(READERS)) {
    const ref = db.collection('rfidReaders').doc(readerId);
    const doc = await ref.get();
    if (!doc.exists) {
      batch.set(ref, {
        name: info.name,
        type: info.type,
        location: info.location,
        status: 'offline',
        lastActiveTime: null,
        lastUid: null,
      });
    }
  }
  await batch.commit();
}

/** Called on every accepted scan so the reader's status stays "online". */
export async function touchReader(readerId, uid) {
  const info = READERS[readerId];
  if (!info) return;

  try {
    await db.collection('rfidReaders').doc(readerId).set(
      {
        name: info.name,
        type: info.type,
        location: info.location,
        status: 'online',
        lastActiveTime: FieldValue.serverTimestamp(),
        lastUid: uid,
      },
      { merge: true }
    );
  } catch (err) {
    console.error('[readers] Failed to update reader status:', err.message);
  }
}

/** Periodic sweep: flips stale readers offline and notifies on the transition. */
export function startReaderOfflineSweep() {
  setInterval(async () => {
    try {
      const snapshot = await db.collection('rfidReaders').where('status', '==', 'online').get();
      const now = Date.now();

      for (const doc of snapshot.docs) {
        const lastActiveTime = doc.data().lastActiveTime;
        const lastMs = lastActiveTime?.toMillis ? lastActiveTime.toMillis() : 0;
        if (now - lastMs < OFFLINE_THRESHOLD_MS) continue;

        await doc.ref.update({ status: 'offline' });
        await raiseNotification({
          type: 'reader_offline',
          priority: 'high',
          message: `Reader "${doc.data().name}" (${doc.id}) has gone offline — no scans received in over ${Math.round(
            OFFLINE_THRESHOLD_MS / 1000
          )}s.`,
        });
      }
    } catch (err) {
      console.error('[readers] Offline sweep failed:', err.message);
    }
  }, SWEEP_INTERVAL_MS);
}

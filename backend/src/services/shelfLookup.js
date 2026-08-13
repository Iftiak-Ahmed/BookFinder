import { db } from '../db/firebaseAdmin.js';

export const CHECKPOINT_READER_ID = 'CHECKPOINT';

// reader_id -> shelf_label, loaded once at boot. The mapping is fixed hardware,
// so caching it keeps every shelf scan down to a single lookup.
let shelfMap = new Map();

export async function loadShelfMap() {
  const snapshot = await db.collection('shelfMap').get();

  shelfMap = new Map(snapshot.docs.map((doc) => [doc.id, doc.data().shelfLabel]));
  console.log(`[shelf] Loaded ${shelfMap.size} shelf readers:`, [...shelfMap.keys()].join(', '));
  return shelfMap;
}

/** Shelf label for a reader, or null if the reader is not a shelf reader. */
export function getShelfLabel(readerId) {
  return shelfMap.get(readerId) ?? null;
}

export function isShelfReader(readerId) {
  return shelfMap.has(readerId);
}

export function isCheckpointReader(readerId) {
  return readerId === CHECKPOINT_READER_ID;
}

export function getShelfMap() {
  return Object.fromEntries(shelfMap);
}

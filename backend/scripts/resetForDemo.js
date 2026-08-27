/**
 * Wipes activity history (scan events, transactions, access logs, placement
 * alerts, notifications, the active session) and puts every book back on its
 * correct shelf with no one checked in — a clean slate for a demo, while
 * keeping the student roster and book catalog intact.
 *
 * Usage: node scripts/resetForDemo.js
 */
import '../src/db/firebaseAdmin.js';
import { db } from '../src/db/firebaseAdmin.js';

async function wipeCollection(name) {
  const snap = await db.collection(name).get();
  if (snap.empty) {
    console.log(`${name}: already empty`);
    return;
  }

  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  console.log(`${name}: removed ${snap.size} doc(s)`);
}

for (const name of ['scanEvents', 'transactions', 'accessLogs', 'placementAlerts', 'notifications']) {
  await wipeCollection(name);
}

await db.collection('activeSession').doc('current').delete();
console.log('activeSession: cleared');

const booksSnap = await db.collection('books').get();
const bookBatch = db.batch();
booksSnap.docs.forEach((doc) => {
  const correctShelf = doc.data().correctShelf ?? null;
  bookBatch.update(doc.ref, {
    status: 'in_library',
    issuedTo: null,
    isMisplaced: false,
    currentShelf: correctShelf,
  });
});
await bookBatch.commit();
console.log(`books: reset ${booksSnap.size} book(s) to in_library on their correct shelf`);

const studentsSnap = await db.collection('students').get();
const studentBatch = db.batch();
studentsSnap.docs.forEach((doc) => {
  studentBatch.update(doc.ref, { status: 'Outside' });
});
await studentBatch.commit();
console.log(`students: reset ${studentsSnap.size} student(s) to Outside`);

console.log('Done — database is demo-ready.');
process.exit(0);

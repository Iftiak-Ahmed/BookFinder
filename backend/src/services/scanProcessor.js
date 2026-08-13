import { db, FieldValue } from '../db/firebaseAdmin.js';
import {
  getShelfLabel,
  isCheckpointReader,
  isShelfReader,
} from './shelfLookup.js';
import { sendCommand } from '../serial/serialListener.js';

/** How long a student stays "pending" at the checkpoint after tapping their card. */
const PENDING_STUDENT_WINDOW_MS = 15_000;

/**
 * RC522 readers re-read a tag many times a second while it sits on the antenna.
 * Without this, one physical tap would toggle a book's status dozens of times.
 * Same reader + same UID inside this window is ignored.
 */
const DUPLICATE_SCAN_WINDOW_MS = 3_000;

/** The student currently waiting at the checkpoint, or null. */
let pendingStudent = null; // { cardUid, name, studentId, dept, at }

/** `${readerId}|${uid}` -> timestamp of the last accepted scan. */
const lastScanAt = new Map();

/**
 * Which reader a bare "UID: ..." line is attributed to. The single-reader
 * sketch has no reader id of its own, so it is treated as the checkpoint.
 * Set DEFAULT_READER_ID=SHELF2_A in .env to test shelf logic with one reader.
 */
const DEFAULT_READER_ID = (process.env.DEFAULT_READER_ID ?? 'CHECKPOINT').toUpperCase();

/** "B0 E3 90 5C" / "b0:e3:90:5c" -> "B0E3905C" */
function normaliseUid(raw) {
  return raw.trim().toUpperCase().replace(/[\s:-]/g, '');
}

/**
 * Parse one serial line into { readerId, uid }. Two formats are accepted:
 *
 *   A) "SHELF1_A,09FF22B0"   the multi-reader protocol — carries the reader id
 *   B) "UID: B0 E3 90 5C"    the single-reader sketch — attributed to
 *                            DEFAULT_READER_ID, since it names no reader
 *
 * Everything else (the sketch's own "Book: ...", "ID - ...", separator rules,
 * boot banners) returns null and is ignored.
 */
export function parseScanLine(line) {
  if (typeof line !== 'string') return null;

  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return null;

  // Format A — reader id and uid, comma separated
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',');
    if (parts.length !== 2) return null;

    const readerId = parts[0].trim().toUpperCase();
    const uid = normaliseUid(parts[1]);

    if (!readerId || !uid) return null;
    if (!/^[0-9A-F]+$/.test(uid)) return null; // UIDs are hex
    if (!/^[A-Z0-9_]+$/.test(readerId)) return null;

    return { readerId, uid };
  }

  // Format B — "UID: xx xx xx xx" from the single-reader sketch
  const match = trimmed.match(/^UID\s*[:=]\s*([0-9A-Fa-f][0-9A-Fa-f\s:-]*)$/);
  if (match) {
    const uid = normaliseUid(match[1]);
    if (!uid || !/^[0-9A-F]+$/.test(uid)) return null;
    return { readerId: DEFAULT_READER_ID, uid };
  }

  return null;
}

function isDuplicate(readerId, uid) {
  const key = `${readerId}|${uid}`;
  const now = Date.now();
  const previous = lastScanAt.get(key);

  if (previous && now - previous < DUPLICATE_SCAN_WINDOW_MS) return true;

  lastScanAt.set(key, now);
  return false;
}

function getPendingStudent() {
  if (!pendingStudent) return null;

  if (Date.now() - pendingStudent.at > PENDING_STUDENT_WINDOW_MS) {
    pendingStudent = null;
    return null;
  }
  return pendingStudent;
}

async function insertScanEvent({
  readerId,
  uid,
  eventType,
  student = null,
  book = null,
  bookStatus = null,
  isMisplaced = null,
  detectedShelf = null,
  note = null,
}) {
  try {
    await db.collection('scanEvents').add({
      readerId,
      uid,
      eventType,
      studentId: student?.cardUid ?? null,
      studentName: student?.name ?? null,
      studentNumber: student?.studentId ?? null,
      studentDept: student?.dept ?? null,
      bookId: book?.uid ?? null,
      bookTitle: book?.title ?? null,
      bookAuthor: book?.author ?? null,
      copyNo: book?.copyNo ?? null,
      correctShelf: book?.correctShelf ?? null,
      bookStatus,
      isMisplaced,
      detectedShelf,
      note,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[scan] Failed to insert scan event:', err.message);
  }
}

/**
 * Append-only issue/return audit trail — separate from `scanEvents` (which
 * logs every raw tap) so the librarian can see just the borrow/return
 * history without the shelf-scan noise. Never updated or deleted.
 */
async function insertTransaction({ book, student, action }) {
  try {
    await db.collection('transactions').add({
      bookId: book.uid,
      bookTitle: book.title,
      copyNo: book.copyNo ?? null,
      studentId: student.cardUid,
      studentName: student.name,
      studentNumber: student.studentId ?? null,
      action, // 'ISSUE' | 'RETURN'
      remark: `${action === 'ISSUE' ? 'Issued to' : 'Returned by'} ${student.studentId ?? student.cardUid} - ${student.name}`,
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[scan] Failed to insert transaction:', err.message);
  }
}

/**
 * Every student card tap at the checkpoint also toggles their in/out
 * presence, independent of whatever book scan follows.
 */
async function logAccessEvent(student) {
  const nextStatus = student.status === 'Inside' ? 'Outside' : 'Inside';
  const event = nextStatus === 'Inside' ? 'ENTRY' : 'EXIT';

  try {
    await db.collection('students').doc(student.cardUid).update({ status: nextStatus });
  } catch (err) {
    console.error('[scan] students status update failed:', err.message);
  }

  try {
    await db.collection('accessLogs').add({
      studentId: student.cardUid,
      studentName: student.name,
      studentNumber: student.studentId ?? null,
      event,
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[scan] Failed to insert access log:', err.message);
  }
}

/**
 * A wrong-rack placement opens (or reuses) an alert the librarian has to
 * clear explicitly — the alarm on the dashboard stays active until they do.
 */
async function raisePlacementAlert({ book, detectedShelf }) {
  const existing = await db
    .collection('placementAlerts')
    .where('bookId', '==', book.uid)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (!existing.empty) {
    await existing.docs[0].ref.update({ detectedShelf, updatedAt: FieldValue.serverTimestamp() });
    return;
  }

  await db.collection('placementAlerts').add({
    bookId: book.uid,
    bookTitle: book.title,
    copyNo: book.copyNo ?? null,
    correctShelf: book.correctShelf,
    detectedShelf,
    status: 'active',
    createdAt: FieldValue.serverTimestamp(),
    resolvedAt: null,
  });
}

async function findStudentByUid(uid) {
  try {
    const doc = await db.collection('students').doc(uid).get();
    if (!doc.exists) return null;
    return { cardUid: doc.id, ...doc.data() };
  } catch (err) {
    console.error('[scan] students lookup failed:', err.message);
    return null;
  }
}

async function findBookByUid(uid) {
  try {
    const doc = await db.collection('books').doc(uid).get();
    if (!doc.exists) return null;
    return { uid: doc.id, ...doc.data() };
  } catch (err) {
    console.error('[scan] books lookup failed:', err.message);
    return null;
  }
}

/**
 * Checkpoint reader: a card tap arms a student and logs entry/exit, a book
 * tap issues or returns depending on who currently holds the book.
 */
async function handleCheckpointScan(readerId, uid) {
  const student = await findStudentByUid(uid);

  if (student) {
    pendingStudent = { ...student, at: Date.now() };
    await insertScanEvent({ readerId, uid, eventType: 'student_scan', student });
    await logAccessEvent(student);
    console.log(`[checkpoint] ${student.name} (${student.studentId}) tapped in`);
    return;
  }

  const book = await findBookByUid(uid);

  if (!book) {
    // Unregistered tag — still logged so it shows up while debugging.
    await insertScanEvent({ readerId, uid, eventType: 'book_scan' });
    console.log(`[checkpoint] Unknown UID ${uid}`);
    return;
  }

  const active = getPendingStudent();
  const isCurrentlyIssuedToActive =
    book.status === 'checked_out' && active && book.issuedTo === active.cardUid;

  // Book already out to someone else (or no student identified while it's
  // out) — do not blindly toggle state, just log what happened.
  if (book.status === 'checked_out' && !isCurrentlyIssuedToActive) {
    await insertScanEvent({
      readerId,
      uid,
      eventType: 'book_scan',
      student: active,
      book,
      bookStatus: book.status,
      note: active
        ? 'Book is checked out to a different student'
        : 'Book is checked out — no student identified at checkpoint',
    });
    console.log(
      `[checkpoint] ${book.title} Copy ${book.copyNo} is already checked out — ignoring mismatched tap`
    );
    return;
  }

  // Issuing requires a student to attribute the loan to.
  if (book.status !== 'checked_out' && !active) {
    await insertScanEvent({
      readerId,
      uid,
      eventType: 'book_scan',
      book,
      bookStatus: book.status,
      note: 'No student identified — tap a student card before the book',
    });
    console.log(`[checkpoint] ${book.title} Copy ${book.copyNo} scanned without a student — ignored`);
    return;
  }

  const nextStatus = isCurrentlyIssuedToActive ? 'in_library' : 'checked_out';
  const action = nextStatus === 'checked_out' ? 'ISSUE' : 'RETURN';

  const update = {
    status: nextStatus,
    lastSeenAt: FieldValue.serverTimestamp(),
  };

  // A book leaving the library is no longer on any shelf, so its shelf state
  // is cleared. Coming back, it waits for a shelf reader to place it again.
  if (nextStatus === 'checked_out') {
    update.currentShelf = null;
    update.isMisplaced = false;
    update.issuedTo = active.cardUid;
  } else {
    update.issuedTo = null;
  }

  try {
    await db.collection('books').doc(book.uid).update(update);
  } catch (err) {
    console.error('[scan] books update failed:', err.message);
  }

  await insertScanEvent({
    readerId,
    uid,
    eventType: 'book_scan',
    student: active,
    book,
    bookStatus: nextStatus,
  });

  await insertTransaction({ book, student: active, action });

  const who = `${active.name} (${active.studentId})`;
  const verb = nextStatus === 'checked_out' ? 'checked out' : 'returned';
  console.log(`[checkpoint] ${who} ${verb} ${book.title} Copy ${book.copyNo}`);
}

/**
 * Shelf reader: record where the book is now and whether that is where it belongs.
 */
async function handleShelfScan(readerId, uid) {
  const shelfLabel = getShelfLabel(readerId);
  const book = await findBookByUid(uid);

  if (!book) {
    await insertScanEvent({ readerId, uid, eventType: 'shelf_scan' });
    console.log(`[${shelfLabel}] Unknown UID ${uid}`);
    return;
  }

  const isMisplaced = book.correctShelf !== shelfLabel;

  try {
    await db.collection('books').doc(book.uid).update({
      currentShelf: shelfLabel,
      isMisplaced,
      status: 'in_library', // seen on a shelf means it is physically here
      lastSeenAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[scan] books update failed:', err.message);
  }

  await insertScanEvent({
    readerId,
    uid,
    eventType: 'shelf_scan',
    book,
    bookStatus: 'in_library',
    isMisplaced,
    detectedShelf: shelfLabel,
  });

  if (isMisplaced) {
    await raisePlacementAlert({ book, detectedShelf: shelfLabel });
    sendCommand('ALERT:MISPLACED');
  } else {
    sendCommand('ALERT:CLEAR');
  }

  console.log(
    isMisplaced
      ? `[${shelfLabel}] MISPLACED: ${book.title} Copy ${book.copyNo} belongs on ${book.correctShelf}`
      : `[${shelfLabel}] ${book.title} Copy ${book.copyNo} shelved correctly`
  );
}

/**
 * Entry point — call this with one raw line from the serial port.
 */
export async function processScanLine(line) {
  const parsed = parseScanLine(line);

  if (!parsed) {
    if (line.trim()) console.log(`[serial] Ignored: ${line.trim()}`);
    return;
  }

  const { readerId, uid } = parsed;

  if (isDuplicate(readerId, uid)) return;

  try {
    if (isCheckpointReader(readerId)) {
      await handleCheckpointScan(readerId, uid);
    } else if (isShelfReader(readerId)) {
      await handleShelfScan(readerId, uid);
    } else {
      // Reader ID the database has never heard of — log it so a typo in the
      // firmware or a missing shelf_map row is obvious during the demo.
      await insertScanEvent({ readerId, uid, eventType: 'shelf_scan' });
      console.warn(`[serial] Unknown reader "${readerId}" — is it missing from shelfMap?`);
    }
  } catch (err) {
    console.error('[scan] Unhandled error while processing scan:', err);
  }
}

/** Exposed for tests / manual poking. */
export function _resetState() {
  pendingStudent = null;
  lastScanAt.clear();
}

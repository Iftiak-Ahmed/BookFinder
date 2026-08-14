import { Router } from 'express';
import { db, FieldValue } from '../db/firebaseAdmin.js';
import { getShelfMap } from '../services/shelfLookup.js';

export const api = Router();

api.get('/health', (_req, res) => res.json({ ok: true }));

function toIso(ts) {
  return ts?.toDate ? ts.toDate().toISOString() : null;
}

/** Firestore book doc -> the snake_case shape the dashboard expects. */
function toBookDto(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    rfid_uid: doc.id,
    title: d.title ?? null,
    author: d.author ?? null,
    copy_no: d.copyNo ?? null,
    dept: d.dept ?? null,
    correct_shelf: d.correctShelf ?? null,
    current_shelf: d.currentShelf ?? null,
    status: d.status ?? 'in_library',
    is_misplaced: d.isMisplaced ?? false,
    issued_to: d.issuedTo ?? null,
    last_seen_at: toIso(d.lastSeenAt),
  };
}

/** GET /api/books — every book with its current status and shelf. */
api.get('/books', async (_req, res) => {
  try {
    const snapshot = await db.collection('books').get();
    const books = snapshot.docs.map(toBookDto);

    books.sort((a, b) => {
      const shelf = (a.correct_shelf ?? '').localeCompare(b.correct_shelf ?? '');
      if (shelf !== 0) return shelf;
      const title = (a.title ?? '').localeCompare(b.title ?? '');
      if (title !== 0) return title;
      return (a.copy_no ?? 0) - (b.copy_no ?? 0);
    });

    res.json(books);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/shelf-map — reader_id -> shelf_label. Served from the boot cache. */
api.get('/shelf-map', (_req, res) => {
  res.json(getShelfMap());
});

function toStudentDto(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    card_uid: doc.id,
    student_id: d.studentId,
    name: d.name,
    dept: d.dept,
    status: d.status ?? 'Outside',
  };
}

/** GET /api/students — all registered cards. */
api.get('/students', async (_req, res) => {
  try {
    const snapshot = await db.collection('students').get();
    const students = snapshot.docs.map(toStudentDto);
    students.sort((a, b) => (a.student_id ?? '').localeCompare(b.student_id ?? ''));
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/students — register a new RFID card for a student. */
api.post('/students', async (req, res) => {
  try {
    const { uid, student_id, name, dept } = req.body ?? {};

    if (!uid || !student_id || !name || !dept) {
      return res.status(400).json({ error: 'uid, student_id, name and dept are required' });
    }

    const normalisedUid = String(uid).trim().toUpperCase().replace(/[\s:-]/g, '');
    if (!/^[0-9A-F]+$/.test(normalisedUid)) {
      return res.status(400).json({ error: `"${uid}" is not a valid hex RFID UID` });
    }

    const ref = db.collection('students').doc(normalisedUid);
    if ((await ref.get()).exists) {
      return res.status(409).json({ error: `Card ${normalisedUid} is already registered` });
    }

    await ref.set({ studentId: student_id, name, dept, status: 'Outside' });
    res.status(201).json(toStudentDto(await ref.get()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** How long a book may be held before it's overdue, and the daily penalty
 *  after that. Placeholder policy — tune freely, nothing else depends on it. */
const LOAN_DAYS = 14;
const FINE_PER_DAY = 5;

/** Every book currently checked out to `cardUid`, each dated from the
 *  transactions audit trail, with a due date and any accrued fine. */
async function fetchIssuedBooks(cardUid) {
  const snapshot = await db
    .collection('books')
    .where('issuedTo', '==', cardUid)
    .where('status', '==', 'checked_out')
    .get();

  const books = await Promise.all(
    snapshot.docs.map(async (doc) => {
      const book = toBookDto(doc);

      // Equality-only filters (no orderBy on a different field), so this
      // doesn't need a composite index — the latest ISSUE is picked in JS.
      const txSnap = await db
        .collection('transactions')
        .where('bookId', '==', doc.id)
        .where('studentId', '==', cardUid)
        .where('action', '==', 'ISSUE')
        .get();

      const latest = txSnap.docs
        .map((d) => d.data().timestamp)
        .filter(Boolean)
        .sort((a, b) => b.toMillis() - a.toMillis())[0];

      const issuedAt = latest ? latest.toDate() : null;
      const dueAt = issuedAt ? new Date(issuedAt.getTime() + LOAN_DAYS * 86_400_000) : null;
      const overdueDays = dueAt ? Math.max(0, Math.floor((Date.now() - dueAt.getTime()) / 86_400_000)) : 0;

      return {
        ...book,
        issued_at: issuedAt ? issuedAt.toISOString() : null,
        due_at: dueAt ? dueAt.toISOString() : null,
        overdue_days: overdueDays,
        fine: overdueDays * FINE_PER_DAY,
      };
    })
  );

  books.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
  return books;
}

/** GET /api/students/:id/issued — the books this student currently holds
 *  (by RFID card UID — used by the librarian-facing Students page). */
api.get('/students/:id/issued', async (req, res) => {
  try {
    res.json(await fetchIssuedBooks(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/my-books/:studentId — same thing, but looked up by the student's
 * own ID number (from their login account) rather than their RFID card UID,
 * since a logged-in student doesn't know their own card's UID. `linked:
 * false` means no RFID card has been registered against that student ID yet.
 */
api.get('/my-books/:studentId', async (req, res) => {
  try {
    const cardSnap = await db
      .collection('students')
      .where('studentId', '==', req.params.studentId)
      .limit(1)
      .get();

    if (cardSnap.empty) {
      return res.json({ linked: false, books: [] });
    }

    const books = await fetchIssuedBooks(cardSnap.docs[0].id);
    res.json({ linked: true, books });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/events/recent — last 20 scans, with student name and book title. */
api.get('/events/recent', async (_req, res) => {
  try {
    const snapshot = await db
      .collection('scanEvents')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    const events = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        reader_id: d.readerId,
        uid: d.uid,
        event_type: d.eventType,
        book_status: d.bookStatus,
        student_id: d.studentId ?? null,
        book_id: d.bookId ?? null,
        is_misplaced: d.isMisplaced ?? null,
        detected_shelf: d.detectedShelf ?? null,
        correct_shelf: d.correctShelf ?? null,
        created_at: toIso(d.createdAt),
        students: d.studentName
          ? { name: d.studentName, student_id: d.studentNumber ?? null, dept: d.studentDept ?? null }
          : null,
        books: d.bookTitle
          ? {
              title: d.bookTitle,
              author: d.bookAuthor ?? null,
              copy_no: d.copyNo ?? null,
              status: d.bookStatus ?? null,
              correct_shelf: d.correctShelf ?? null,
            }
          : null,
      };
    });

    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/transactions — issue/return audit trail, newest first. */
api.get('/transactions', async (req, res) => {
  try {
    let query = db.collection('transactions').orderBy('timestamp', 'desc');

    if (req.query.studentId) query = query.where('studentId', '==', req.query.studentId);
    if (req.query.bookId) query = query.where('bookId', '==', req.query.bookId);
    if (req.query.action) query = query.where('action', '==', req.query.action);

    const snapshot = await query.get();
    const transactions = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        book_id: d.bookId,
        book_title: d.bookTitle,
        copy_no: d.copyNo ?? null,
        student_id: d.studentId,
        student_name: d.studentName,
        student_number: d.studentNumber ?? null,
        action: d.action,
        remark: d.remark,
        timestamp: toIso(d.timestamp),
      };
    });

    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/access-logs — student entry/exit events, newest first. */
api.get('/access-logs', async (req, res) => {
  try {
    let query = db.collection('accessLogs').orderBy('timestamp', 'desc');

    if (req.query.studentId) query = query.where('studentId', '==', req.query.studentId);

    const snapshot = await query.get();
    const logs = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        student_id: d.studentId,
        student_name: d.studentName,
        student_number: d.studentNumber ?? null,
        event: d.event,
        timestamp: toIso(d.timestamp),
      };
    });

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function toAlertDto(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    book_id: d.bookId,
    book_title: d.bookTitle,
    copy_no: d.copyNo ?? null,
    correct_shelf: d.correctShelf,
    detected_shelf: d.detectedShelf,
    status: d.status,
    created_at: toIso(d.createdAt),
    resolved_at: toIso(d.resolvedAt),
  };
}

/** GET /api/alerts — wrong-placement history, newest first. */
api.get('/alerts', async (_req, res) => {
  try {
    const snapshot = await db.collection('placementAlerts').orderBy('createdAt', 'desc').get();
    res.json(snapshot.docs.map(toAlertDto));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/alerts/:id/resolve — librarian confirms the book has been moved back. */
api.patch('/alerts/:id/resolve', async (req, res) => {
  try {
    const ref = db.collection('placementAlerts').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Alert not found' });

    await ref.update({ status: 'resolved', resolvedAt: FieldValue.serverTimestamp() });

    const updated = await ref.get();
    res.json(toAlertDto(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

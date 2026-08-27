import { Router } from 'express';
import { db, FieldValue } from '../db/firebaseAdmin.js';
import { getShelfMap } from '../services/shelfLookup.js';
import { getSettings, updateSettings } from '../services/librarySettings.js';
import { RACKS, getRack, rackLabel } from '../rackCatalog.js';
import { armCapture, clearCapture, getCapture } from '../services/registrationCapture.js';

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
    registered_at: toIso(d.registeredAt),
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
    clearCapture();
    res.status(201).json(toStudentDto(await ref.get()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/students/:id — edit a registered card's name/student id/dept
 *  (the UID itself, doc id, is not editable — re-register a new card instead). */
api.patch('/students/:id', async (req, res) => {
  try {
    const ref = db.collection('students').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Student not found' });

    const { student_id, name, dept } = req.body ?? {};
    const update = {};
    if (student_id !== undefined) update.studentId = String(student_id).trim();
    if (name !== undefined) update.name = String(name).trim();
    if (dept !== undefined) update.dept = String(dept).trim();

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    await ref.update(update);
    res.json(toStudentDto(await ref.get()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/students/:id — remove a registered card. Refused while the
 *  student still holds a checked-out book — otherwise the book is left
 *  `checked_out` with an `issuedTo` pointing at a card that no longer
 *  exists, and no tap can ever return or reissue it again. */
api.delete('/students/:id', async (req, res) => {
  try {
    const ref = db.collection('students').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Student not found' });

    const outstanding = await db
      .collection('books')
      .where('issuedTo', '==', req.params.id)
      .where('status', '==', 'checked_out')
      .get();

    if (!outstanding.empty) {
      const titles = outstanding.docs.map((d) => d.data().title).join(', ');
      return res.status(409).json({
        error: `Cannot remove this card — ${outstanding.size} book(s) still checked out to it (${titles}). Return them first.`,
      });
    }

    await ref.delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Every book currently checked out to `cardUid`, each dated from the
 *  transactions audit trail, with a due date and any accrued fine. Loan
 *  length, grace period and daily fine come from the configurable
 *  librarySettings (see services/librarySettings.js). */
async function fetchIssuedBooks(cardUid) {
  const { borrowingDays, graceDays, finePerDay } = getSettings();

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

      const latestDoc = txSnap.docs
        .filter((d) => d.data().timestamp)
        .sort((a, b) => b.data().timestamp.toMillis() - a.data().timestamp.toMillis())[0];

      const latest = latestDoc?.data();
      const issuedAt = latest?.timestamp ? latest.timestamp.toDate() : null;
      const dueAt = latest?.expectedReturnDate
        ? new Date(latest.expectedReturnDate)
        : issuedAt
        ? new Date(issuedAt.getTime() + borrowingDays * 86_400_000)
        : null;
      const cutoff = dueAt ? dueAt.getTime() + graceDays * 86_400_000 : null;
      const overdueDays = cutoff ? Math.max(0, Math.floor((Date.now() - cutoff) / 86_400_000)) : 0;

      return {
        ...book,
        issued_at: issuedAt ? issuedAt.toISOString() : null,
        due_at: dueAt ? dueAt.toISOString() : null,
        overdue_days: overdueDays,
        fine: overdueDays * finePerDay,
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
        expected_return_date: d.expectedReturnDate ? new Date(d.expectedReturnDate).toISOString() : null,
        overdue_days: d.overdueDays ?? null,
        fine_amount: d.fineAmount ?? null,
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

/** GET /api/books/:id/history — every scan of this book's tag, newest first
 *  (checkpoint issue/return taps and shelf sightings alike). Powers the
 *  Misplaced Books page's "movement history" expand. */
api.get('/books/:id/history', async (req, res) => {
  try {
    const snapshot = await db
      .collection('scanEvents')
      .where('bookId', '==', req.params.id)
      .limit(50)
      .get();

    const events = snapshot.docs
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          reader_id: d.readerId,
          event_type: d.eventType,
          book_status: d.bookStatus,
          is_misplaced: d.isMisplaced ?? null,
          detected_shelf: d.detectedShelf ?? null,
          correct_shelf: d.correctShelf ?? null,
          note: d.note ?? null,
          created_at: toIso(d.createdAt),
        };
      })
      .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0));

    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/settings — the configurable borrowing/fine/session rules. */
api.get('/settings', (_req, res) => {
  res.json(getSettings());
});

/** PATCH /api/settings — librarian updates borrowing duration, fine per day,
 *  max books per student, grace period, or the checkpoint session timeout. */
api.patch('/settings', async (req, res) => {
  try {
    const updated = await updateSettings(req.body ?? {});
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function toReaderDto(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    reader_id: doc.id,
    name: d.name,
    type: d.type,
    location: d.location,
    status: d.status ?? 'offline',
    last_active_time: toIso(d.lastActiveTime),
    last_uid: d.lastUid ?? null,
  };
}

/** GET /api/readers — status of all 7 RFID readers (1 entry + 6 shelf). */
api.get('/readers', async (_req, res) => {
  try {
    const snapshot = await db.collection('rfidReaders').get();
    const readers = snapshot.docs.map(toReaderDto);
    readers.sort((a, b) => a.name.localeCompare(b.name));
    res.json(readers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function toNotificationDto(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    type: d.type,
    message: d.message,
    priority: d.priority ?? 'medium',
    related_book_id: d.relatedBookId ?? null,
    related_student_id: d.relatedStudentId ?? null,
    read: d.read ?? false,
    created_at: toIso(d.createdAt),
  };
}

/** GET /api/notifications — newest first, optional ?unread=true filter. */
api.get('/notifications', async (req, res) => {
  try {
    let query = db.collection('notifications').orderBy('createdAt', 'desc').limit(100);
    if (req.query.unread === 'true') query = query.where('read', '==', false);

    const snapshot = await query.get();
    res.json(snapshot.docs.map(toNotificationDto));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/notifications/:id/read — librarian dismisses one notification. */
api.patch('/notifications/:id/read', async (req, res) => {
  try {
    const ref = db.collection('notifications').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Notification not found' });

    await ref.update({ read: true });
    res.json(toNotificationDto(await ref.get()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/session/active — the student currently "at" the checkpoint, if any. */
api.get('/session/active', async (_req, res) => {
  try {
    const doc = await db.collection('activeSession').doc('current').get();
    if (!doc.exists) return res.json(null);

    const d = doc.data();
    if (Date.now() > d.expiresAt) return res.json(null);

    res.json({
      card_uid: d.cardUid,
      name: d.name,
      student_id: d.studentId,
      dept: d.dept,
      started_at: toIso(d.startedAt),
      expires_at: d.expiresAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/session/end — librarian manually ends the active checkpoint session. */
api.post('/session/end', async (_req, res) => {
  try {
    await db.collection('activeSession').doc('current').delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/rack-status — for every shelf reader: which books belong there
 * (expected) vs. which are currently detected there (by current_shelf),
 * plus a single computed status so the dashboard doesn't duplicate this
 * comparison logic:
 *   correct           - detected set matches expected set exactly
 *   empty              - nothing currently detected on the shelf
 *   misplaced          - a detected book doesn't belong on this shelf
 *   unknown_detected   - an unregistered tag was last seen here (from scanEvents)
 */
api.get('/rack-status', async (_req, res) => {
  try {
    const [booksSnap, shelfMapSnap] = await Promise.all([
      db.collection('books').get(),
      db.collection('shelfMap').get(),
    ]);

    const books = booksSnap.docs.map(toBookDto);

    const rows = await Promise.all(
      shelfMapSnap.docs.map(async (doc) => {
        const shelfLabel = doc.data().shelfLabel;
        // Some shelfMap docs only ever stored shelfLabel (older seed runs),
        // so dept/position/subject are read from the static rack catalog by
        // reader id rather than trusted to be on the Firestore doc.
        const rack = getRack(doc.id) ?? {};

        const expected = books.filter((b) => b.correct_shelf === shelfLabel);
        const detected = books.filter((b) => b.current_shelf === shelfLabel);
        const misplacedHere = detected.filter((b) => b.correct_shelf !== shelfLabel);

        let unknownDetected = false;
        if (detected.length === 0) {
          // Equality-only filters (no orderBy on a different field), so this
          // doesn't need a composite index — existence is all that's needed.
          const recentUnknown = await db
            .collection('scanEvents')
            .where('readerId', '==', doc.id)
            .where('bookId', '==', null)
            .limit(1)
            .get();
          unknownDetected = !recentUnknown.empty;
        }

        // Fewer detected than expected is not itself a problem — the missing
        // copies may simply be checked out. Only a book that doesn't belong
        // here (misplacedHere) counts as a shelf-level problem.
        let status = 'correct';
        if (detected.length === 0) status = unknownDetected ? 'unknown_detected' : 'empty';
        else if (misplacedHere.length > 0) status = 'misplaced';

        return {
          reader_id: doc.id,
          dept: rack.dept ?? 'Unassigned',
          position: rack.position ?? null,
          subject: rack.subject ?? null,
          shelf_label: shelfLabel,
          expected_books: expected.map((b) => ({ id: b.id, title: b.title, copy_no: b.copy_no })),
          detected_books: detected.map((b) => ({
            id: b.id,
            title: b.title,
            copy_no: b.copy_no,
            is_misplaced: b.is_misplaced,
          })),
          status,
        };
      })
    );

    rows.sort((a, b) => a.shelf_label.localeCompare(b.shelf_label));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================  register book  ============================== */

// "Rack 1/2/3" (Settings -> Register Book dropdown) maps to the same
// departments the rest of the system already uses, so a book registered
// here lines up exactly with the existing shelf readers / rackCatalog.js.
const RACK_CHOICE_TO_DEPT = {
  'Rack 1': 'CSE',
  'Rack 2': 'EEE',
  'Rack 3': 'Science & Humanities',
};

function resolveReaderId(rackChoice, shelfChoice) {
  const dept = RACK_CHOICE_TO_DEPT[rackChoice];
  const position = shelfChoice === 'Upper' || shelfChoice === 'Lower' ? shelfChoice : null;
  if (!dept || !position) return null;

  const entry = Object.entries(RACKS).find(([, r]) => r.dept === dept && r.position === position);
  return entry ? entry[0] : null;
}

/** POST /api/register-book/arm-scan — "Scan the Book" button: the next
 *  checkpoint tap is captured as a new UID instead of processed normally. */
api.post('/register-book/arm-scan', (_req, res) => {
  armCapture();
  res.json({ armed: true });
});

/** GET /api/register-book/scan-status — polled by the Register Book form
 *  while armed, to pick up the captured UID the instant it arrives. */
api.get('/register-book/scan-status', (_req, res) => {
  const c = getCapture();
  res.json({
    armed: c.armed,
    uid: c.uid,
    armed_at: c.armedAt ? new Date(c.armedAt).toISOString() : null,
    captured_at: c.capturedAt ? new Date(c.capturedAt).toISOString() : null,
  });
});

/** POST /api/register-book/cancel-scan — librarian cancels/leaves the form. */
api.post('/register-book/cancel-scan', (_req, res) => {
  clearCapture();
  res.json({ ok: true });
});

/**
 * Same "arm the next tap, poll for it" capture used by Register Book above
 * (registrationCapture.js is a single generic slot, not book-specific) —
 * exposed under its own path so the Add Student "Scan the Card" flow reads
 * clearly in the network tab instead of hitting a book-named endpoint.
 */
api.post('/register-student/arm-scan', (_req, res) => {
  armCapture();
  res.json({ armed: true });
});

api.get('/register-student/scan-status', (_req, res) => {
  const c = getCapture();
  res.json({
    armed: c.armed,
    uid: c.uid,
    armed_at: c.armedAt ? new Date(c.armedAt).toISOString() : null,
    captured_at: c.capturedAt ? new Date(c.capturedAt).toISOString() : null,
  });
});

api.post('/register-student/cancel-scan', (_req, res) => {
  clearCapture();
  res.json({ ok: true });
});

/**
 * POST /api/books/register — the Register Book form's submit. Mirrors
 * scripts/registerBook.js (same book doc shape, same rackCatalog source of
 * truth) but reachable from the dashboard with UI-side duplicate checks.
 */
api.post('/books/register', async (req, res) => {
  try {
    const { uid, title, author, rack, shelf, copy_no } = req.body ?? {};

    if (!uid || !title || !author || !rack || !shelf || !copy_no) {
      return res
        .status(400)
        .json({ error: 'RFID Card No, Book Name, Writer, Rack, Shelf and Copy are all required' });
    }

    const normalisedUid = String(uid).trim().toUpperCase().replace(/[\s:-]/g, '');
    if (!/^[0-9A-F]+$/.test(normalisedUid)) {
      return res.status(400).json({ error: `"${uid}" is not a valid hex RFID UID` });
    }

    const copyNo = Number(copy_no);
    if (!Number.isFinite(copyNo) || copyNo < 1) {
      return res.status(400).json({ error: 'Copy must be a positive number' });
    }

    const readerId = resolveReaderId(rack, shelf);
    if (!readerId) {
      return res.status(400).json({ error: `Unknown rack/shelf combination: ${rack} / ${shelf}` });
    }

    const bookName = String(title).trim();
    const writer = String(author).trim();

    // Same book + writer + copy already registered — equality-only filters,
    // no composite index needed.
    const dupCopy = await db
      .collection('books')
      .where('title', '==', bookName)
      .where('author', '==', writer)
      .where('copyNo', '==', copyNo)
      .limit(1)
      .get();

    if (!dupCopy.empty) {
      return res.status(409).json({
        error: 'This copy already exists in the database.',
        existing: toBookDto(dupCopy.docs[0]),
      });
    }

    // The RFID UID namespace is shared between books and students — the
    // same physical tag can never be registered as both.
    const [bookByUid, studentByUid] = await Promise.all([
      db.collection('books').doc(normalisedUid).get(),
      db.collection('students').doc(normalisedUid).get(),
    ]);

    if (bookByUid.exists) {
      return res.status(409).json({
        error: 'This RFID card is already registered in the system.',
        existing: toBookDto(bookByUid),
      });
    }
    if (studentByUid.exists) {
      return res.status(409).json({
        error: 'This RFID card is already registered in the system.',
        existing: { type: 'student', ...toStudentDto(studentByUid) },
      });
    }

    const rackInfo = getRack(readerId);
    const correctShelf = rackLabel(readerId);

    await db.collection('books').doc(normalisedUid).set({
      title: bookName,
      author: writer,
      copyNo,
      dept: rackInfo.dept,
      correctShelf,
      currentShelf: null,
      status: 'in_library',
      isMisplaced: false,
      issuedTo: null,
      lastSeenAt: null,
      registeredAt: FieldValue.serverTimestamp(),
    });

    clearCapture();

    const created = await db.collection('books').doc(normalisedUid).get();
    res.status(201).json(toBookDto(created));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

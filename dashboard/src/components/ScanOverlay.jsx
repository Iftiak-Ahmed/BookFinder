import { useEffect, useState } from 'react';
import { clockTime } from '../lib/format.js';
import { AlertIcon, BookIcon, CheckIcon, OutIcon, ScanIcon, UserIcon } from './Icons.jsx';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

/** Formats a stored UID back into the spaced form the Serial Monitor shows. */
function spacedUid(uid) {
  return (uid.match(/.{1,2}/g) ?? [uid]).join(' ');
}

function IssuedBooks({ studentId }) {
  const [books, setBooks] = useState(null);

  useEffect(() => {
    let active = true;
    setBooks(null);

    if (!studentId) {
      setBooks([]);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/students/${studentId}/issued`);
        const data = await res.json();
        if (active) setBooks(Array.isArray(data) ? data : []);
      } catch {
        if (active) setBooks([]);
      }
    })();

    return () => {
      active = false;
    };
  }, [studentId]);

  if (books === null) {
    return <div className="skeleton" style={{ height: 56 }} />;
  }

  if (books.length === 0) {
    return <p className="overlay-empty">No books currently issued to this student.</p>;
  }

  return (
    <ul className="issued-list">
      {books.map((book) => (
        <li className="issued-item" key={book.id}>
          <span className="issued-icon">
            <BookIcon size={13} />
          </span>
          <span className="issued-body">
            <span className="issued-title">
              {book.title} <span className="issued-copy">Copy {book.copy_no}</span>
            </span>
            {book.author && <span className="issued-author">{book.author}</span>}
          </span>
          <span className="issued-shelf">{book.correct_shelf}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Full-screen "Card Inserted" panel. Driven by the newest scan_event, so it
 * fires the moment a tag touches the reader.
 */
export default function ScanOverlay({ scan, onClose }) {
  // Restart the auto-dismiss timer whenever a different card is presented.
  useEffect(() => {
    if (!scan) return;
    const t = setTimeout(onClose, 12000);
    return () => clearTimeout(t);
  }, [scan, onClose]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!scan) return null;

  const student = scan.students;
  const book = scan.books;
  const isStudent = scan.event_type === 'student_scan' || Boolean(student && !book);
  const known = Boolean(student || book);

  const tone = !known ? 'critical' : isStudent ? 'accent' : 'good';

  return (
    <div className="overlay-backdrop" onClick={onClose} role="presentation">
      <div
        className={`overlay-card tone-${tone}`}
        role="dialog"
        aria-modal="true"
        aria-label="Card inserted"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overlay-head">
          <span className="overlay-pulse">
            <ScanIcon size={18} />
          </span>
          <div>
            <h2 className="overlay-title">Card Inserted</h2>
            <p className="overlay-time">Scanned at {clockTime(scan.created_at)}</p>
          </div>
          <button type="button" className="overlay-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="overlay-body">
          <div className="overlay-uid">
            <span className="overlay-uid-label">Card UID</span>
            <span className="overlay-uid-value">{spacedUid(scan.uid)}</span>
          </div>

          {/* --- registered student card --- */}
          {isStudent && student && (
            <>
              <div className="overlay-identity">
                <span className="identity-avatar">
                  <UserIcon size={22} />
                </span>
                <div>
                  <p className="identity-name">{student.name}</p>
                  <p className="identity-meta">
                    ID {student.student_id}
                    {student.dept ? ` · ${student.dept}` : ''}
                  </p>
                </div>
                <span className="identity-badge">
                  <CheckIcon size={12} />
                  Student
                </span>
              </div>

              <div className="overlay-section">
                <h3 className="overlay-section-title">Issued books</h3>
                <IssuedBooks studentId={scan.student_id} />
              </div>
            </>
          )}

          {/* --- registered book tag --- */}
          {book && (
            <>
              <div className="overlay-identity">
                <span className="identity-avatar">
                  <BookIcon size={22} />
                </span>
                <div>
                  <p className="identity-name">{book.title}</p>
                  <p className="identity-meta">
                    Copy {book.copy_no}
                    {book.author ? ` · ${book.author}` : ''}
                  </p>
                </div>
                <span className="identity-badge">
                  <BookIcon size={12} />
                  Book
                </span>
              </div>

              <div className="overlay-facts">
                <div className="fact">
                  <span className="fact-label">Belongs on</span>
                  <span className="fact-value">{book.correct_shelf}</span>
                </div>
                <div className="fact">
                  <span className="fact-label">Status</span>
                  <span className="fact-value">
                    {(scan.book_status ?? book.status) === 'checked_out' ? (
                      <>
                        <OutIcon size={12} /> Checked out
                      </>
                    ) : (
                      <>
                        <CheckIcon size={12} /> In library
                      </>
                    )}
                  </span>
                </div>
                {student && (
                  <div className="fact">
                    <span className="fact-label">Handled by</span>
                    <span className="fact-value">{student.name}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* --- unregistered tag --- */}
          {!known && (
            <div className="overlay-unknown">
              <AlertIcon size={20} />
              <div>
                <p className="identity-name">Unknown card</p>
                <p className="identity-meta">
                  This tag is not registered yet. Run <code>node scripts/registerBook.js</code> or{' '}
                  <code>node scripts/registerStudent.js</code> in the <code>backend</code> folder to give
                  it a name.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { AlertIcon, BookIcon, UserIcon } from './Icons.jsx';
import { clockTime } from '../lib/format.js';

function dateLabel(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

function StudentRow({ student, fetchIssuedBooks }) {
  const [expanded, setExpanded] = useState(false);
  const [issued, setIssued] = useState(null);
  const [loadingIssued, setLoadingIssued] = useState(false);

  async function toggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (issued !== null) return;

    setLoadingIssued(true);
    try {
      const books = await fetchIssuedBooks(student.card_uid);
      setIssued(books);
    } catch {
      setIssued([]);
    } finally {
      setLoadingIssued(false);
    }
  }

  return (
    <>
      <tr>
        <td>{student.student_id}</td>
        <td>{student.name}</td>
        <td>{student.dept}</td>
        <td>
          <span className={`pill${student.status === 'Inside' ? ' is-good' : ' is-muted'}`}>
            {student.status}
          </span>
        </td>
        <td>
          <button type="button" className="text-btn" onClick={toggle}>
            {expanded ? 'Hide issued books' : 'Show issued books'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5}>
            {loadingIssued ? (
              <span className="empty-hint">Loading…</span>
            ) : issued && issued.length > 0 ? (
              <table className="issued-table">
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>Issued on</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {issued.map((b) => (
                    <tr key={b.id}>
                      <td>
                        {b.title} {b.copy_no ? `(Copy ${b.copy_no})` : ''}
                      </td>
                      <td>{dateLabel(b.issued_at)}</td>
                      <td>{clockTime(b.issued_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <span className="empty-hint">No books currently issued.</span>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function StudentsPage({ students, loading, error, fetchIssuedBooks, onBack }) {
  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <UserIcon size={17} />
          </span>
          <div>
            <h1>Students</h1>
            <p className="brand-sub">Registered RFID cards</p>
          </div>
        </div>

        <div className="header-tools">
          <button type="button" className="text-btn" onClick={onBack}>
            Back to dashboard
          </button>
        </div>
      </header>

      <main className="content">
        {error && (
          <div className="banner" role="alert">
            <AlertIcon size={15} />
            <span>Cannot reach the backend ({error}).</span>
          </div>
        )}

        <section className="panel">
          <div className="panel-head">
            <div className="panel-title">
              <h2>Roster</h2>
              <span className="panel-count">{students.length} students</span>
            </div>
          </div>

          <div className="panel-body">
            {loading ? (
              <div className="skeleton" style={{ height: 220 }} />
            ) : students.length === 0 ? (
              <div className="empty">
                <span className="empty-icon">
                  <BookIcon size={18} />
                </span>
                <span className="empty-title">No students registered</span>
                <span className="empty-hint">Run registerStudent.js in the backend to add a card.</span>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Student ID</th>
                      <th>Name</th>
                      <th>Dept</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <StudentRow key={s.id} student={s} fetchIssuedBooks={fetchIssuedBooks} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

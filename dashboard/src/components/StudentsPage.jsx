import { useMemo, useState } from 'react';
import { AlertIcon, BookIcon, UserIcon } from './Icons.jsx';
import { clockTime } from '../lib/format.js';

function dateLabel(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

function StudentRow({ student, fetchIssuedBooks, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [issued, setIssued] = useState(null);
  const [loadingIssued, setLoadingIssued] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ student_id: student.student_id, name: student.name, dept: student.dept });
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState(null);

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

  async function saveEdit() {
    setBusy(true);
    setRowError(null);
    try {
      await onEdit(student.card_uid, form);
      setEditing(false);
    } catch (err) {
      setRowError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Remove ${student.name}'s card? This cannot be undone.`)) return;
    setBusy(true);
    setRowError(null);
    try {
      await onDelete(student.card_uid);
    } catch (err) {
      setRowError(err.message);
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <tr>
        <td>
          <input
            className="field-input"
            value={form.student_id}
            onChange={(e) => setForm((f) => ({ ...f, student_id: e.target.value }))}
          />
        </td>
        <td>
          <input
            className="field-input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </td>
        <td>
          <input
            className="field-input"
            value={form.dept}
            onChange={(e) => setForm((f) => ({ ...f, dept: e.target.value }))}
          />
        </td>
        <td>
          <span className={`pill${student.status === 'Inside' ? ' is-good' : ' is-muted'}`}>{student.status}</span>
        </td>
        <td colSpan={2}>
          <button type="button" className="text-btn" onClick={saveEdit} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="text-btn" onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </button>
          {rowError && <span className="field-hint" style={{ color: 'var(--critical)' }}>{rowError}</span>}
        </td>
      </tr>
    );
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
        <td>
          <button type="button" className="text-btn" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button type="button" className="text-btn" onClick={handleDelete} disabled={busy}>
            Delete
          </button>
        </td>
      </tr>
      {rowError && !editing && (
        <tr>
          <td colSpan={6} style={{ color: 'var(--critical)' }}>
            {rowError}
          </td>
        </tr>
      )}
      {expanded && (
        <tr>
          <td colSpan={6}>
            {loadingIssued ? (
              <span className="empty-hint">Loading…</span>
            ) : issued && issued.length > 0 ? (
              <table className="issued-table">
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>Issued on</th>
                    <th>Time</th>
                    <th>Fine</th>
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
                      <td>{b.fine > 0 ? `${b.fine} Taka (${b.overdue_days}d overdue)` : '—'}</td>
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

const EMPTY_FORM = { uid: '', student_id: '', name: '', dept: '' };

function AddStudentForm({ onAdd }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onAdd(form);
      setForm(EMPTY_FORM);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        Add Student
      </button>
    );
  }

  return (
    <form className="add-student-form" onSubmit={submit}>
      <input
        className="field-input"
        placeholder="Card RFID UID"
        value={form.uid}
        onChange={(e) => setForm((f) => ({ ...f, uid: e.target.value }))}
        required
      />
      <input
        className="field-input"
        placeholder="Student ID"
        value={form.student_id}
        onChange={(e) => setForm((f) => ({ ...f, student_id: e.target.value }))}
        required
      />
      <input
        className="field-input"
        placeholder="Name"
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        required
      />
      <input
        className="field-input"
        placeholder="Department"
        value={form.dept}
        onChange={(e) => setForm((f) => ({ ...f, dept: e.target.value }))}
        required
      />
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Adding…' : 'Save'}
      </button>
      <button type="button" className="text-btn" onClick={() => setOpen(false)} disabled={busy}>
        Cancel
      </button>
      {error && <span className="field-hint" style={{ color: 'var(--critical)' }}>{error}</span>}
    </form>
  );
}

export default function StudentsPage({
  students,
  loading,
  error,
  fetchIssuedBooks,
  onAddStudent,
  onEditStudent,
  onDeleteStudent,
  onBack,
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query) return students;
    const q = query.toLowerCase();
    return students.filter((s) =>
      [s.student_id, s.name, s.dept, s.card_uid].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [students, query]);

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
              <span className="panel-count">{filtered.length} students</span>
            </div>

            <input
              type="search"
              className="search-input"
              placeholder="Search name, ID, dept, UID..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search students"
            />

            <AddStudentForm onAdd={onAddStudent} />
          </div>

          <div className="panel-body">
            {loading ? (
              <div className="skeleton" style={{ height: 220 }} />
            ) : filtered.length === 0 ? (
              <div className="empty">
                <span className="empty-icon">
                  <BookIcon size={18} />
                </span>
                <span className="empty-title">No students registered</span>
                <span className="empty-hint">Use "Add Student" above, or run registerStudent.js in the backend.</span>
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
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => (
                      <StudentRow
                        key={s.id}
                        student={s}
                        fetchIssuedBooks={fetchIssuedBooks}
                        onEdit={onEditStudent}
                        onDelete={onDeleteStudent}
                      />
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

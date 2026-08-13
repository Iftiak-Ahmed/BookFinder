import { useState } from 'react';
import { AlertIcon, BookIcon, UserIcon } from './Icons.jsx';

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
              <ul className="issued-list">
                {issued.map((b) => (
                  <li key={b.id}>
                    {b.title} {b.copy_no ? `(Copy ${b.copy_no})` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="empty-hint">No books currently issued.</span>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function AddStudentForm({ registerStudent }) {
  const [form, setForm] = useState({ uid: '', student_id: '', name: '', dept: '' });
  const [status, setStatus] = useState(null); // { kind: 'error'|'success', message }
  const [submitting, setSubmitting] = useState(false);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      await registerStudent(form);
      setStatus({ kind: 'success', message: `Registered ${form.name}.` });
      setForm({ uid: '', student_id: '', name: '', dept: '' });
    } catch (err) {
      setStatus({ kind: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="add-student-form" onSubmit={submit}>
      <label className="field">
        <span className="field-label">Card UID</span>
        <input type="text" value={form.uid} onChange={set('uid')} placeholder="B0 AB 4F 5C" required />
      </label>
      <label className="field">
        <span className="field-label">Student ID</span>
        <input
          type="text"
          value={form.student_id}
          onChange={set('student_id')}
          placeholder="202114202"
          required
        />
      </label>
      <label className="field">
        <span className="field-label">Name</span>
        <input type="text" value={form.name} onChange={set('name')} placeholder="Lt Iftiak" required />
      </label>
      <label className="field">
        <span className="field-label">Department</span>
        <input type="text" value={form.dept} onChange={set('dept')} placeholder="CSE" required />
      </label>
      <button type="submit" className="text-btn" disabled={submitting}>
        {submitting ? 'Registering…' : 'Register card'}
      </button>
      {status && (
        <p className={status.kind === 'error' ? 'form-error' : 'form-success'}>{status.message}</p>
      )}
    </form>
  );
}

export default function StudentsPage({ students, loading, error, fetchIssuedBooks, registerStudent, onBack }) {
  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <UserIcon size={17} />
          </span>
          <div>
            <h1>Students</h1>
            <p className="brand-sub">Registered RFID cards · CSE-406 · MIST</p>
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
              <h2>Register a card</h2>
            </div>
          </div>
          <div className="panel-body">
            <AddStudentForm registerStudent={registerStudent} />
          </div>
        </section>

        <section className="panel" style={{ marginTop: 16 }}>
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
                <span className="empty-hint">Register a card above, or run registerStudent.js in the backend.</span>
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

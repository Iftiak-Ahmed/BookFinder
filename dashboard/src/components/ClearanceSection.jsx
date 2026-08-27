import { useState } from 'react';
import { AlertIcon, BookIcon, CheckIcon, UserIcon } from './Icons.jsx';
import { DEPARTMENTS } from '../lib/accountOptions.js';

function dateLabel(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

function ClearanceApplyForm({ account, onApply, onDone }) {
  const [form, setForm] = useState({
    full_name: account.name ?? '',
    student_id: account.studentId ?? '',
    session: '',
    department: account.department ?? '',
  });
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function submit(e) {
    e.preventDefault();
    setStatus(null);

    if (!form.full_name.trim() || !form.student_id.trim() || !form.session.trim() || !form.department) {
      setStatus({ kind: 'error', message: 'All fields are required.' });
      return;
    }

    setSubmitting(true);
    try {
      await onApply(form);
      onDone();
    } catch (err) {
      setStatus({ kind: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="profile-form" onSubmit={submit} autoComplete="off" noValidate>
      <label className="profile-field">
        <span className="profile-label">Full Name</span>
        <input
          className="profile-input"
          type="text"
          value={form.full_name}
          onChange={set('full_name')}
          autoComplete="off"
        />
      </label>

      <label className="profile-field">
        <span className="profile-label">Student ID</span>
        <input
          className="profile-input"
          type="text"
          value={form.student_id}
          onChange={set('student_id')}
          autoComplete="off"
        />
      </label>

      <label className="profile-field">
        <span className="profile-label">Session</span>
        <input
          className="profile-input"
          type="text"
          placeholder="e.g. 2022-23"
          value={form.session}
          onChange={set('session')}
          autoComplete="off"
        />
      </label>

      <label className="profile-field">
        <span className="profile-label">Department</span>
        <select className="profile-input" value={form.department} onChange={set('department')}>
          <option value="" disabled>
            Select Dept
          </option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" className="text-btn" disabled={submitting} style={{ alignSelf: 'flex-start' }}>
        {submitting ? 'Submitting…' : 'Submit Application'}
      </button>

      {status && <p className={status.kind === 'error' ? 'form-error' : 'form-success'}>{status.message}</p>}
    </form>
  );
}

function ClearanceStatusView({ clearance, onApply }) {
  const latest = clearance.latest;

  if (clearance.error) {
    return (
      <div className="banner" role="alert">
        <AlertIcon size={15} />
        <span>Cannot reach the backend ({clearance.error}).</span>
      </div>
    );
  }

  if (clearance.loading) {
    return <div className="skeleton" style={{ height: 100 }} />;
  }

  if (!latest) {
    return (
      <div className="empty">
        <span className="empty-icon">
          <BookIcon size={18} />
        </span>
        <span className="empty-title">No clearance request yet</span>
        <span className="empty-hint">
          Apply once you have no books issued and no dues — a librarian will review it.
        </span>
        <button type="button" className="btn-primary" onClick={onApply} style={{ marginTop: 10 }}>
          Apply for Clearance
        </button>
      </div>
    );
  }

  if (latest.status === 'pending') {
    return (
      <div className="empty">
        <span className="empty-icon">
          <UserIcon size={18} />
        </span>
        <span className="empty-title">Pending librarian review</span>
        <span className="empty-hint">Applied on {dateLabel(latest.created_at)}.</span>
      </div>
    );
  }

  if (latest.status === 'rejected') {
    return (
      <div className="empty">
        <span className="empty-icon">
          <AlertIcon size={18} />
        </span>
        <span className="empty-title">Application rejected</span>
        <span className="empty-hint">{latest.rejection_reason}</span>
        <button type="button" className="btn-primary" onClick={onApply} style={{ marginTop: 10 }}>
          Apply Again
        </button>
      </div>
    );
  }

  return (
    <div className="empty">
      <span className="empty-icon">
        <CheckIcon size={18} />
      </span>
      <span className="empty-title">Clearance approved</span>
      <span className="empty-hint">
        Certificate No: {latest.certificate_number} · Approved {dateLabel(latest.decided_at)}
      </span>
      <a className="btn-primary" href={clearance.certificateUrl(latest.id)} download style={{ marginTop: 10 }}>
        Download Certificate
      </a>
    </div>
  );
}

/** Reached from a header button (not the main dashboard body) — a single
 *  overlay that shows the student's clearance status, and swaps in the
 *  application form in place when they apply/re-apply. */
export default function ClearanceOverlay({ account, clearance, onClose }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div
        className="overlay-card tone-accent"
        role="dialog"
        aria-modal="true"
        aria-label="Library clearance"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overlay-head">
          <span className="overlay-pulse">
            <CheckIcon size={18} />
          </span>
          <div>
            <h2 className="overlay-title">Library Clearance</h2>
            <p className="overlay-time">{showForm ? 'Apply for a certificate' : 'Certificate status'}</p>
          </div>
          <button type="button" className="overlay-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="overlay-body">
          {showForm ? (
            <ClearanceApplyForm account={account} onApply={clearance.apply} onDone={() => setShowForm(false)} />
          ) : (
            <ClearanceStatusView clearance={clearance} onApply={() => setShowForm(true)} />
          )}
        </div>
      </div>
    </div>
  );
}

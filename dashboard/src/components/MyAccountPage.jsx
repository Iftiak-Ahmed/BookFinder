import { useState } from 'react';
import { AlertIcon, BookIcon, CheckIcon, UserIcon } from './Icons.jsx';
import ClearanceOverlay from './ClearanceSection.jsx';
import { clockTime } from '../lib/format.js';
import { DEPARTMENTS, DESIGNATIONS } from '../lib/accountOptions.js';

function dateLabel(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

function IssuedBooksSection({ role, linked, books, loading, error }) {
  if (role !== 'student') {
    return (
      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <h2>Issued Books</h2>
          </div>
        </div>
        <div className="panel-body">
          <div className="empty">
            <span className="empty-icon">
              <BookIcon size={18} />
            </span>
            <span className="empty-title">Not applicable</span>
            <span className="empty-hint">Book borrowing is tracked for students only.</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">
          <h2>Issued Books</h2>
          <span className="panel-count">{books.length} out</span>
        </div>
      </div>
      <div className="panel-body">
        {error && (
          <div className="banner" role="alert">
            <AlertIcon size={15} />
            <span>Cannot reach the backend ({error}).</span>
          </div>
        )}

        {loading ? (
          <div className="skeleton" style={{ height: 160 }} />
        ) : !linked ? (
          <div className="empty">
            <span className="empty-icon">
              <AlertIcon size={18} />
            </span>
            <span className="empty-title">No RFID card linked</span>
            <span className="empty-hint">
              Your Student ID isn't matched to a library card yet — ask the librarian to register it.
            </span>
          </div>
        ) : books.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">
              <BookIcon size={18} />
            </span>
            <span className="empty-title">No books issued</span>
            <span className="empty-hint">Nothing currently checked out to you.</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Issued</th>
                  <th>Due</th>
                  <th>Fine</th>
                </tr>
              </thead>
              <tbody>
                {books.map((b) => (
                  <tr key={b.id} className={b.overdue_days > 0 ? 'is-active-row' : ''}>
                    <td>
                      {b.title} {b.copy_no ? `(Copy ${b.copy_no})` : ''}
                    </td>
                    <td>
                      {dateLabel(b.issued_at)} {clockTime(b.issued_at)}
                    </td>
                    <td>{dateLabel(b.due_at)}</td>
                    <td>
                      {b.fine > 0 ? (
                        <span className="pill is-critical">৳{b.fine} · {b.overdue_days}d late</span>
                      ) : (
                        <span className="pill is-good">On time</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function ProfileSection({ user, updateProfile, onProfileSaved }) {
  const [form, setForm] = useState({
    name: user.name ?? '',
    mobile: user.mobile ?? '',
    email: user.email ?? '',
    department: user.department ?? '',
    designation: user.designation ?? DESIGNATIONS[0],
  });
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function submit(e) {
    e.preventDefault();
    setStatus(null);

    if (!form.name.trim()) {
      setStatus({ kind: 'error', message: 'Name is required.' });
      return;
    }
    if ((user.role === 'student' || user.role === 'faculty') && (!form.department || !form.mobile || !form.email)) {
      setStatus({ kind: 'error', message: 'Department, mobile and email are required.' });
      return;
    }

    setSubmitting(true);
    try {
      const updated = await updateProfile(form);
      setStatus({ kind: 'success', message: 'Profile updated.' });
      onProfileSaved(updated);
    } catch (err) {
      setStatus({ kind: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="overlay-body">
        <form className="profile-form" onSubmit={submit} autoComplete="off" noValidate>
          <label className="profile-field">
            <span className="profile-label">Username</span>
            <input className="profile-input" type="text" value={user.username} disabled />
          </label>

          <label className="profile-field">
            <span className="profile-label">Role</span>
            <input className="profile-input" type="text" value={user.role} disabled style={{ textTransform: 'capitalize' }} />
          </label>

          {user.role === 'student' && (
            <label className="profile-field">
              <span className="profile-label">Student ID</span>
              <input className="profile-input" type="text" value={user.studentId ?? ''} disabled />
            </label>
          )}

          <label className="profile-field">
            <span className="profile-label">Name</span>
            <input className="profile-input" type="text" value={form.name} onChange={set('name')} autoComplete="off" />
          </label>

          <label className="profile-field">
            <span className="profile-label">Mobile</span>
            <input className="profile-input" type="tel" value={form.mobile} onChange={set('mobile')} autoComplete="off" />
          </label>

          {(user.role === 'student' || user.role === 'faculty') && (
            <>
              <label className="profile-field">
                <span className="profile-label">Email</span>
                <input className="profile-input" type="email" value={form.email} onChange={set('email')} autoComplete="off" />
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
            </>
          )}

          {user.role === 'faculty' && (
            <label className="profile-field">
              <span className="profile-label">Designation</span>
              <select className="profile-input" value={form.designation} onChange={set('designation')}>
                {DESIGNATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )}

          <button type="submit" className="text-btn" disabled={submitting} style={{ alignSelf: 'flex-start' }}>
            {submitting ? 'Saving…' : 'Save changes'}
          </button>

          {status && (
            <p className={status.kind === 'error' ? 'form-error' : 'form-success'}>{status.message}</p>
          )}
        </form>
    </div>
  );
}

function ProfileOverlay({ account, updateProfile, onProfileSaved, onClose }) {
  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div
        className="overlay-card tone-accent"
        role="dialog"
        aria-modal="true"
        aria-label="Profile"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overlay-head">
          <span className="overlay-pulse">
            <UserIcon size={18} />
          </span>
          <div>
            <h2 className="overlay-title">Profile</h2>
            <p className="overlay-time">{account.name}</p>
          </div>
          <button type="button" className="overlay-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <ProfileSection user={account} updateProfile={updateProfile} onProfileSaved={onProfileSaved} />
      </div>
    </div>
  );
}

export default function MyAccountPage({ myAccount, myClearance, account, onLogout, onUpdateAccount }) {
  const [showProfile, setShowProfile] = useState(false);
  const [showClearance, setShowClearance] = useState(false);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <BookIcon size={17} />
          </span>
          <div>
            <h1>My Account</h1>
            <p className="brand-sub">Issued books &amp; profile</p>
          </div>
        </div>

        <div className="header-tools">
          {account.role === 'student' && (
            <button type="button" className="text-btn" onClick={() => setShowClearance(true)}>
              <CheckIcon size={12} /> Certificate
            </button>
          )}
          <button type="button" className="user-chip user-chip-btn" onClick={() => setShowProfile(true)}>
            <UserIcon size={12} />
            {account.name} · {account.role}
          </button>
          <button type="button" className="text-btn" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <main className="content">
        <IssuedBooksSection
          role={account.role}
          linked={myAccount.linked}
          books={myAccount.books}
          loading={myAccount.loading}
          error={myAccount.error}
        />
      </main>

      {showProfile && (
        <ProfileOverlay
          account={account}
          updateProfile={myAccount.updateProfile}
          onProfileSaved={(updated) => {
            onUpdateAccount(updated);
            setShowProfile(false);
          }}
          onClose={() => setShowProfile(false)}
        />
      )}

      {showClearance && (
        <ClearanceOverlay account={account} clearance={myClearance} onClose={() => setShowClearance(false)} />
      )}
    </div>
  );
}

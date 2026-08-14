import { useState } from 'react';
import { AlertIcon, BookIcon, CheckIcon } from './Icons.jsx';
import LibraryScene from './LibraryScene.jsx';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

/**
 * Name + email identify the account (not username — that's what a locked-out
 * user is trying to recover in the first place). Always shows the same
 * generic confirmation, whether or not a match was found.
 */
export default function ForgotPasswordPage({ onGoToLogin }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim()) {
      setError('Please fill in: Name, Email');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);

      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login">
      <LibraryScene />

      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark login-mark">
            <BookIcon size={20} />
          </span>
          <h1>Forgot password</h1>
          <p className="login-tagline">Enter your name and email to get a reset link</p>
        </div>

        {sent ? (
          <div className="login-form">
            <div className="login-sent">
              <CheckIcon size={16} />
              <span>If that name and email match an account, a reset link has been emailed to you.</span>
            </div>
            <button type="button" className="login-btn" onClick={onGoToLogin}>
              Back to sign in
            </button>
          </div>
        ) : (
          <form className="login-form" onSubmit={submit} autoComplete="off" noValidate>
            {error && (
              <div className="login-error" role="alert">
                <AlertIcon size={13} />
                <span>{error}</span>
              </div>
            )}

            <label className="field">
              <span className="field-label">Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                placeholder="Full name"
                required
              />
            </label>

            <label className="field">
              <span className="field-label">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                placeholder="you@example.com"
                required
              />
            </label>

            <button type="submit" className="login-btn" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>

            <p className="login-note">
              <button type="button" className="login-link" onClick={onGoToLogin}>
                Back to sign in
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

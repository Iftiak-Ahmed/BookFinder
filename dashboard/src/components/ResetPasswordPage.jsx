import { useState } from 'react';
import { AlertIcon, BookIcon, CheckIcon, EyeIcon, EyeOffIcon } from './Icons.jsx';
import LibraryScene from './LibraryScene.jsx';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

/** The reset link is "#/reset-password?token=...&username=...". */
function paramsFromHash(hash) {
  const query = hash.split('?')[1] ?? '';
  return new URLSearchParams(query);
}

export default function ResetPasswordPage({ hash, onGoToLogin }) {
  const params = paramsFromHash(hash);
  const token = params.get('token') ?? '';
  const username = params.get('username') ?? '';

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);

    if (password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, token, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);

      setDone(true);
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
          <h1>Set a new password</h1>
          <p className="login-tagline">{username || 'Reset link'}</p>
        </div>

        {!token || !username ? (
          <div className="login-form">
            <div className="login-error" role="alert">
              <AlertIcon size={13} />
              <span>This reset link is missing or malformed. Request a new one.</span>
            </div>
            <button type="button" className="login-btn" onClick={onGoToLogin}>
              Back to sign in
            </button>
          </div>
        ) : done ? (
          <div className="login-form">
            <div className="login-sent">
              <CheckIcon size={16} />
              <span>Password updated — sign in with your new password.</span>
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
              <span className="field-label">New password</span>
              <div className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="bf-reset-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••"
                  required
                  minLength={4}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </label>

            <button type="submit" className="login-btn" disabled={submitting}>
              {submitting ? 'Saving…' : 'Set new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

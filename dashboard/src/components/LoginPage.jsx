import { useState } from 'react';
import { AlertIcon, BookIcon, EyeIcon, EyeOffIcon } from './Icons.jsx';
import LibraryScene from './LibraryScene.jsx';
import { primeAudio } from '../lib/buzzer.js';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

/**
 * Sign-in screen. Authenticates against POST /api/auth/login — the account
 * has to exist (created via the sign-up screen) and the password has to match.
 */
export default function LoginPage({ onLogin, onGoToSignup, onGoToForgotPassword }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Login failed (${res.status})`);

      // Browsers only allow audio to start from a user gesture — this click is
      // the one we have, so the misplacement alarm primes here, well before
      // any alert actually needs to sound.
      primeAudio();
      onLogin(body);
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
          <h1>BookFinder</h1>
          <p className="login-tagline">Sign in to the library dashboard</p>
        </div>

        <form className="login-form" onSubmit={submit} autoComplete="off">
          {error && (
            <div className="login-error" role="alert">
              <AlertIcon size={13} />
              <span>{error}</span>
            </div>
          )}

          <label className="field">
            <span className="field-label">Username</span>
            <input
              type="text"
              name="bf-login-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              placeholder="username"
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                name="bf-login-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="••••••"
                required
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

          <p className="login-forgot">
            <button type="button" className="login-link" onClick={onGoToForgotPassword}>
              Forgot password?
            </button>
          </p>

          <button type="submit" className="login-btn" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Login'}
          </button>

          <p className="login-note">
            No account yet?{' '}
            <button type="button" className="login-link" onClick={onGoToSignup}>
              Sign up
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}

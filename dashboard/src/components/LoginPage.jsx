import { useState } from 'react';
import { BookIcon, ScanIcon, ShelfIcon, UserIcon } from './Icons.jsx';
import { primeAudio } from '../lib/buzzer.js';

/**
 * Welcome / sign-in screen. The fields are deliberately not validated — this
 * is a demo gate, so any value (including empty) gets you in.
 */
export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('librarian');
  const [password, setPassword] = useState('demo');

  function submit(e) {
    e.preventDefault();
    // Browsers only allow audio to start from a user gesture — this click is
    // the one we have, so the misplacement alarm primes here, well before
    // any alert actually needs to sound.
    primeAudio();
    onLogin();
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark login-mark">
            <BookIcon size={26} />
          </span>
          <h1>BookFinder</h1>
          <p className="login-tagline">RFID Library Shelf Tracking System</p>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label className="field">
            <span className="field-label">Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="librarian"
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••"
            />
          </label>

          <button type="submit" className="login-btn">
            Login
          </button>

          <p className="login-note">Demo mode — no credentials are checked.</p>
        </form>

        <div className="login-features">
          <div className="login-feature">
            <ShelfIcon size={15} />
            <span>Live shelf inventory</span>
          </div>
          <div className="login-feature">
            <ScanIcon size={15} />
            <span>Instant card detection</span>
          </div>
          <div className="login-feature">
            <UserIcon size={15} />
            <span>Per-student issued books</span>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { AlertIcon, BookIcon, EyeIcon, EyeOffIcon } from './Icons.jsx';
import LibraryScene from './LibraryScene.jsx';
import { DEPARTMENTS, DESIGNATIONS } from '../lib/accountOptions.js';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

const ROLES = [
  { id: 'librarian', label: 'Librarian' },
  { id: 'student', label: 'Student' },
  { id: 'faculty', label: 'Faculty' },
];

const EMPTY_FORM = {
  name: '',
  username: '',
  password: '',
  mobile: '',
  email: '',
  studentId: '',
  department: '',
  designation: DESIGNATIONS[0],
};

/**
 * Account creation screen. Fields shown depend on the selected role — a
 * librarian only needs name/username/password, students and faculty also
 * give contact + affiliation details. Posts to POST /api/auth/signup.
 */
export default function SignupPage({ onSignedUp, onGoToLogin }) {
  const [role, setRole] = useState('librarian');
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  /** Which fields are required for the currently selected role, label-first
   *  so a missing-field message reads naturally. */
  function requiredFields() {
    const common = [
      ['Name', form.name],
      ['Username', form.username],
      ['Password', form.password],
    ];
    if (role === 'librarian') {
      return [...common, ['Email', form.email]];
    }
    if (role === 'student') {
      return [
        ...common,
        ['Student ID', form.studentId],
        ['Department', form.department],
        ['Mobile', form.mobile],
        ['Email', form.email],
      ];
    }
    if (role === 'faculty') {
      return [
        ...common,
        ['Department', form.department],
        ['Mobile', form.mobile],
        ['Email', form.email],
      ];
    }
    return common;
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);

    const missing = requiredFields()
      .filter(([, value]) => !String(value ?? '').trim())
      .map(([label]) => label);

    if (missing.length > 0) {
      setError(`Please fill in: ${missing.join(', ')}`);
      return;
    }

    setSubmitting(true);

    const payload = { role, name: form.name, username: form.username, password: form.password };
    if (role === 'librarian') {
      payload.email = form.email;
    } else if (role === 'student') {
      Object.assign(payload, {
        studentId: form.studentId,
        department: form.department,
        mobile: form.mobile,
        email: form.email,
      });
    } else if (role === 'faculty') {
      Object.assign(payload, {
        department: form.department,
        designation: form.designation,
        mobile: form.mobile,
        email: form.email,
      });
    }

    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Sign up failed (${res.status})`);

      onSignedUp(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login">
      <LibraryScene />

      <div className="login-card signup-card">
        <div className="login-brand">
          <span className="brand-mark login-mark">
            <BookIcon size={20} />
          </span>
          <h1>Create an account</h1>
          <p className="login-tagline">Register for the BookFinder dashboard</p>
        </div>

        <form className="login-form" onSubmit={submit} autoComplete="off" noValidate>
          {error && (
            <div className="login-error" role="alert">
              <AlertIcon size={13} />
              <span>{error}</span>
            </div>
          )}

          <div className="role-select" role="group" aria-label="Account type">
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                className="role-btn"
                aria-pressed={role === r.id}
                onClick={() => setRole(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>

          <label className="field">
            <span className="field-label">Name</span>
            <input
              type="text"
              value={form.name}
              onChange={set('name')}
              autoComplete="off"
              placeholder="Full name"
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Username</span>
            <input
              type="text"
              name="bf-new-username"
              value={form.username}
              onChange={set('username')}
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
                name="bf-new-password"
                value={form.password}
                onChange={set('password')}
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

          {role === 'librarian' && (
            <label className="field">
              <span className="field-label">Email</span>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                autoComplete="off"
                placeholder="you@example.com"
                required
              />
            </label>
          )}

          {role === 'student' && (
            <>
              <label className="field">
                <span className="field-label">Student ID</span>
                <input
                  type="text"
                  value={form.studentId}
                  onChange={set('studentId')}
                  autoComplete="off"
                  placeholder="Enter Student ID"
                  required
                />
              </label>
              <label className="field">
                <span className="field-label">Department</span>
                <select className="select-input" value={form.department} onChange={set('department')} required>
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
              <label className="field">
                <span className="field-label">Mobile</span>
                <input
                  type="tel"
                  value={form.mobile}
                  onChange={set('mobile')}
                  autoComplete="off"
                  placeholder="01XXXXXXXXX"
                  required
                />
              </label>
              <label className="field">
                <span className="field-label">Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  autoComplete="off"
                  placeholder="you@example.com"
                  required
                />
              </label>
            </>
          )}

          {role === 'faculty' && (
            <>
              <label className="field">
                <span className="field-label">Department</span>
                <select className="select-input" value={form.department} onChange={set('department')} required>
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
              <label className="field">
                <span className="field-label">Designation</span>
                <select className="select-input" value={form.designation} onChange={set('designation')}>
                  {DESIGNATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Mobile</span>
                <input
                  type="tel"
                  value={form.mobile}
                  onChange={set('mobile')}
                  autoComplete="off"
                  placeholder="01XXXXXXXXX"
                  required
                />
              </label>
              <label className="field">
                <span className="field-label">Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  autoComplete="off"
                  placeholder="you@example.com"
                  required
                />
              </label>
            </>
          )}

          <button type="submit" className="login-btn" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Sign up'}
          </button>

          <p className="login-note">
            Already have an account?{' '}
            <button type="button" className="login-link" onClick={onGoToLogin}>
              Sign in
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';
// A book can be issued to this student by a checkpoint scan at any moment
// while this page sits open, so poll instead of fetching once on load.
const POLL_MS = 15_000;

/** Owns the signed-in student/faculty's own issued-books list + profile edits.
 *  `user` may be null (signed out) — callers can call this unconditionally,
 *  before the auth check, without breaking the rules of hooks. */
export function useMyAccount(user) {
  const [books, setBooks] = useState([]);
  const [linked, setLinked] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const role = user?.role;
  const studentId = user?.studentId;

  useEffect(() => {
    let active = true;

    if (role !== 'student' || !studentId) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/my-books/${encodeURIComponent(studentId)}`);
        if (!res.ok) throw new Error(`API responded ${res.status}`);

        const data = await res.json();
        if (!active) return;
        setBooks(Array.isArray(data.books) ? data.books : []);
        setLinked(data.linked !== false);
        setError(null);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    setLoading(true);
    load();
    const interval = setInterval(load, POLL_MS);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [role, studentId]);

  async function updateProfile(fields) {
    const res = await fetch(`${API_BASE}/api/auth/profile/${encodeURIComponent(user.username)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `API responded ${res.status}`);
    return body;
  }

  return { books, linked, loading, error, updateProfile };
}

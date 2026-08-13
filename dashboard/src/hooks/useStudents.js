import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

/** Owns the student roster: list + per-student issued-books lookup + registration. */
export function useStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/students`);
        if (!res.ok) throw new Error(`API responded ${res.status}`);

        const data = await res.json();
        if (!active) return;
        setStudents(Array.isArray(data) ? data : []);
        setError(null);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [reloadToken]);

  function reload() {
    setReloadToken((t) => t + 1);
  }

  async function fetchIssuedBooks(cardUid) {
    const res = await fetch(`${API_BASE}/api/students/${cardUid}/issued`);
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return res.json();
  }

  async function registerStudent({ uid, student_id, name, dept }) {
    const res = await fetch(`${API_BASE}/api/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, student_id, name, dept }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `API responded ${res.status}`);

    reload();
    return body;
  }

  return { students, loading, error, reload, fetchIssuedBooks, registerStudent };
}

import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

// The `students` collection is intentionally not client-readable (Firestore
// rule: allow read: if false — it holds card UIDs tied to real names, so
// reads are only ever mediated by the backend API). REST + light polling
// gives near-live updates (entry/exit toggles, roster edits) without
// bypassing that boundary the way a direct onSnapshot listener would.
const POLL_MS = 15_000;

/** Owns the student roster: list + per-student issued-books lookup, plus
 *  add/edit/delete. */
export function useStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
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
    }

    load();
    const interval = setInterval(load, POLL_MS);

    return () => {
      active = false;
      clearInterval(interval);
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

  async function addStudent({ uid, student_id, name, dept }) {
    const res = await fetch(`${API_BASE}/api/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, student_id, name, dept }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `API responded ${res.status}`);
    reload();
    return data;
  }

  async function editStudent(cardUid, patch) {
    const res = await fetch(`${API_BASE}/api/students/${cardUid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `API responded ${res.status}`);
    reload();
    return data;
  }

  async function deleteStudent(cardUid) {
    const res = await fetch(`${API_BASE}/api/students/${cardUid}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `API responded ${res.status}`);
    }
    reload();
  }

  return { students, loading, error, reload, fetchIssuedBooks, addStudent, editStudent, deleteStudent };
}

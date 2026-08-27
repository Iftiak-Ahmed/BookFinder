import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebaseClient.js';
import { clearanceRequestFromDoc } from '../lib/firestoreMappers.js';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

/** Owns the signed-in student's clearance-certificate application: their
 *  request history (newest first) plus the apply action. `user` may be null
 *  (signed out) — callers can call this unconditionally, before the auth
 *  check, without breaking the rules of hooks. */
export function useMyClearance(user) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const role = user?.role;
  const username = user?.username;

  useEffect(() => {
    let active = true;

    if (role !== 'student' || !username) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/clearance/requests/mine/${encodeURIComponent(username)}`);
        if (!res.ok) throw new Error(`API responded ${res.status}`);

        const data = await res.json();
        if (!active) return;
        setRequests(Array.isArray(data) ? data : []);
        setError(null);
      } catch (err) {
        // The realtime listener below may still connect and recover this —
        // not fatal, but the caller should be able to show it meanwhile.
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();

    const q = query(collection(db, 'clearanceRequests'), where('studentUsername', '==', username));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!active) return;
      const rows = snapshot.docs
        .map(clearanceRequestFromDoc)
        .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0));
      setRequests(rows);
      setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [role, username]);

  async function apply(form) {
    const res = await fetch(`${API_BASE}/api/clearance/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, ...form }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `API responded ${res.status}`);
    return body;
  }

  function certificateUrl(id) {
    return `${API_BASE}/api/clearance/requests/${id}/certificate.pdf`;
  }

  return { requests, latest: requests[0] ?? null, loading, error, apply, certificateUrl };
}

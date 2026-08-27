import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebaseClient.js';
import { clearanceRequestFromDoc } from '../lib/firestoreMappers.js';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

/**
 * Owns the full clearance-request queue (pending + decided) for the
 * librarian dashboard. One realtime listener drives both the nav badge and
 * the Clearance page, so the two never fall out of sync — same shape as
 * usePlacementAlerts.
 */
export function useClearanceRequests(enabled = true) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let active = true;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/clearance/requests`);
        if (!res.ok) throw new Error(`API responded ${res.status}`);

        const data = await res.json();
        if (!active) return;
        setRequests(Array.isArray(data) ? data : []);
        setError(null);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();

    const unsubscribe = onSnapshot(collection(db, 'clearanceRequests'), (snapshot) => {
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
  }, [enabled]);

  const pendingRequests = useMemo(() => requests.filter((r) => r.status === 'pending'), [requests]);

  async function approve(id, reviewedBy) {
    const res = await fetch(`${API_BASE}/api/clearance/requests/${id}/approve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewed_by: reviewedBy }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `API responded ${res.status}`);
    return body;
  }

  async function reject(id, reason, reviewedBy) {
    const res = await fetch(`${API_BASE}/api/clearance/requests/${id}/reject`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, reviewed_by: reviewedBy }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `API responded ${res.status}`);
    return body;
  }

  function certificateUrl(id) {
    return `${API_BASE}/api/clearance/requests/${id}/certificate.pdf`;
  }

  return { requests, pendingRequests, loading, error, approve, reject, certificateUrl };
}

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebaseClient.js';
import { alertFromDoc } from '../lib/firestoreMappers.js';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

/**
 * Owns the full misplacement-alert history (active + resolved). One realtime
 * listener drives both the header's "Active Alerts" badge and the History page,
 * so the two never fall out of sync.
 */
export function usePlacementAlerts(enabled = true) {
  const [alerts, setAlerts] = useState([]);
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
        const res = await fetch(`${API_BASE}/api/alerts`);
        if (!res.ok) throw new Error(`API responded ${res.status}`);

        const data = await res.json();
        if (!active) return;
        setAlerts(Array.isArray(data) ? data : []);
        setError(null);
      } catch (err) {
        // The realtime listener below may still connect and recover this —
        // not fatal, but the caller should be able to show it meanwhile.
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();

    const unsubscribe = onSnapshot(collection(db, 'placementAlerts'), (snapshot) => {
      if (!active) return;
      const rows = snapshot.docs
        .map(alertFromDoc)
        .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0));
      setAlerts(rows);
      setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [enabled]);

  const activeAlerts = useMemo(() => alerts.filter((a) => a.status === 'active'), [alerts]);

  async function resolve(id) {
    try {
      const res = await fetch(`${API_BASE}/api/alerts/${id}/resolve`, { method: 'PATCH' });
      if (!res.ok) throw new Error(`API responded ${res.status}`);
      return true;
    } catch (err) {
      console.error('Failed to resolve alert:', err.message);
      setError(`Could not resolve alert: ${err.message}`);
      return false;
    }
  }

  return { alerts, activeAlerts, loading, error, resolve };
}

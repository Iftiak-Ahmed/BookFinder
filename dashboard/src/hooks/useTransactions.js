import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

// `transactions` (like `students`) has no client-read Firestore rule — it's
// an audit trail meant to be read only through the backend API, not a public
// realtime collection like books/scanEvents/placementAlerts. REST + light
// polling keeps the stat tiles reasonably fresh without an onSnapshot
// listener that Firestore would simply reject with permission-denied.
const POLL_MS = 15_000;

/** Owns the issue/return transaction history — the audit trail distinct from
 *  the raw checkpoint feed and the misplacement history. */
export function useTransactions(enabled = true) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let active = true;

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/transactions`);
        if (!res.ok) throw new Error(`API responded ${res.status}`);

        const data = await res.json();
        if (!active) return;
        setTransactions(Array.isArray(data) ? data : []);
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
  }, [enabled, reloadToken]);

  return { transactions, loading, error, reload: () => setReloadToken((t) => t + 1) };
}

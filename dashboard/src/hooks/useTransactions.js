import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

/** Owns the issue/return transaction history — the audit trail distinct from
 *  the raw checkpoint feed and the misplacement history. */
export function useTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);

    (async () => {
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
    })();

    return () => {
      active = false;
    };
  }, [reloadToken]);

  return { transactions, loading, error, reload: () => setReloadToken((t) => t + 1) };
}

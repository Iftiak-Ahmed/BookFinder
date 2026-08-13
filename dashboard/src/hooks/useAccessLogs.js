import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

/** Owns the student entry/exit log — independent of book issue/return. */
export function useAccessLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/access-logs`);
        if (!res.ok) throw new Error(`API responded ${res.status}`);

        const data = await res.json();
        if (!active) return;
        setLogs(Array.isArray(data) ? data : []);
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

  return { logs, loading, error, reload: () => setReloadToken((t) => t + 1) };
}

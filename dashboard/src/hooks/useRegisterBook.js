import { useCallback, useEffect, useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';
const POLL_MS = 1000;

/** Drives the "Scan the Book" capture: arm it, poll while armed, hand back
 *  the captured UID the moment it lands. REST-only (no Firestore listener —
 *  this is single-session, in-memory backend state, not a shared collection). */
export function useRegisterBook() {
  const [armed, setArmed] = useState(false);
  const [scannedUid, setScannedUid] = useState(null);
  const [registering, setRegistering] = useState(false);
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const armScan = useCallback(async () => {
    setScannedUid(null);
    await fetch(`${API_BASE}/api/register-book/arm-scan`, { method: 'POST' });
    setArmed(true);

    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/register-book/scan-status`);
        const data = await res.json();
        if (!data.armed && data.uid) {
          setScannedUid(data.uid);
          setArmed(false);
          stopPolling();
        }
      } catch {
        // transient — keep polling
      }
    }, POLL_MS);
  }, [stopPolling]);

  const cancelScan = useCallback(async () => {
    stopPolling();
    setArmed(false);
    await fetch(`${API_BASE}/api/register-book/cancel-scan`, { method: 'POST' });
  }, [stopPolling]);

  const setManualUid = useCallback((uid) => setScannedUid(uid), []);

  const registerBook = useCallback(async (payload) => {
    setRegistering(true);
    try {
      const res = await fetch(`${API_BASE}/api/books/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const err = new Error(data.error ?? `API responded ${res.status}`);
        err.existing = data.existing ?? null;
        throw err;
      }
      return data;
    } finally {
      setRegistering(false);
    }
  }, []);

  return { armed, scannedUid, registering, armScan, cancelScan, setManualUid, registerBook };
}

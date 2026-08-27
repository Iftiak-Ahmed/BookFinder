import { useCallback, useEffect, useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';
const POLL_MS = 1000;

/** Drives the "Scan the Card" capture on Add Student — arm it, poll while
 *  armed, hand back the captured UID the moment it lands. Same arm/poll
 *  shape as useRegisterBook, against the /register-student endpoints. */
export function useRegisterStudentCard() {
  const [armed, setArmed] = useState(false);
  const [scannedUid, setScannedUid] = useState(null);
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
    await fetch(`${API_BASE}/api/register-student/arm-scan`, { method: 'POST' });
    setArmed(true);

    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/register-student/scan-status`);
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
    await fetch(`${API_BASE}/api/register-student/cancel-scan`, { method: 'POST' });
  }, [stopPolling]);

  const setManualUid = useCallback((uid) => setScannedUid(uid), []);

  return { armed, scannedUid, armScan, cancelScan, setManualUid };
}

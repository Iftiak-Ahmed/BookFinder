import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebaseClient.js';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

const DEFAULTS = {
  borrowingDays: 14,
  graceDays: 0,
  finePerDay: 5,
  maxBooksPerStudent: 5,
  sessionTimeoutSeconds: 60,
};

/** Borrowing/fine/session policy — one REST load for the first paint, one
 *  Firestore listener so a change from the Settings page shows up live
 *  everywhere else (stat tiles, overdue calculations) without a refresh. */
export function useSettings(enabled = true) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let active = true;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/settings`);
        if (!res.ok) throw new Error(`API responded ${res.status}`);
        const data = await res.json();
        if (active) setSettings({ ...DEFAULTS, ...data });
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();

    const unsubscribe = onSnapshot(doc(db, 'librarySettings', 'config'), (snap) => {
      if (!active || !snap.exists()) return;
      setSettings({ ...DEFAULTS, ...snap.data() });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [enabled]);

  async function save(patch) {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`API responded ${res.status}`);
      const data = await res.json();
      setSettings({ ...DEFAULTS, ...data });
      setError(null);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { settings, loading, error, saving, save };
}

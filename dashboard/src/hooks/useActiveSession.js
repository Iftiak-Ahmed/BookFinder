import { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebaseClient.js';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

function fromSnap(snap) {
  if (!snap.exists()) return null;
  const d = snap.data();
  if (Date.now() > d.expiresAt) return null;

  return {
    card_uid: d.cardUid,
    name: d.name,
    student_id: d.studentId,
    dept: d.dept,
    started_at: d.startedAt?.toDate ? d.startedAt.toDate().toISOString() : null,
    expires_at: d.expiresAt,
  };
}

/** The student currently "at" the checkpoint — armed by a card tap, cleared
 *  by a timeout, another card, or the librarian ending it manually. */
export function useActiveSession(enabled = true) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let active = true;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/session/active`);
        if (res.ok) {
          const data = await res.json();
          if (active) setSession(data);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    const unsubscribe = onSnapshot(doc(db, 'activeSession', 'current'), (snap) => {
      if (!active) return;
      setSession(fromSnap(snap));
      setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [enabled]);

  const endSession = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/session/end`, { method: 'POST' });
      return true;
    } catch (err) {
      console.error('Failed to end session:', err.message);
      return false;
    }
  }, []);

  return { session, loading, endSession };
}

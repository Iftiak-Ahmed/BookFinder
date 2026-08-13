import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebaseClient.js';
import { bookFromDoc } from '../lib/firestoreMappers.js';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';
const FLASH_MS = 1600;

/**
 * Owns the books table for the whole app: one REST load for the first paint,
 * one Firestore realtime listener for everything after. Lifted out of ShelfGrid
 * so the stat tiles read the same array instead of subscribing a second time.
 *
 * `flashed` holds ids that changed in the last moment, so a card can pulse and
 * the audience can see which book just moved.
 */
export function useBooks() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const [flashed, setFlashed] = useState(() => new Set());

  const timers = useRef(new Map());
  const isFirstSnapshot = useRef(true);

  const flash = useCallback((id) => {
    setFlashed((prev) => new Set(prev).add(id));

    clearTimeout(timers.current.get(id));
    timers.current.set(
      id,
      setTimeout(() => {
        setFlashed((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        timers.current.delete(id);
      }, FLASH_MS)
    );
  }, []);

  useEffect(() => {
    let active = true;
    const pending = timers.current;
    isFirstSnapshot.current = true;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/books`);
        if (!res.ok) throw new Error(`API responded ${res.status}`);

        const data = await res.json();
        if (!active) return;

        setBooks(Array.isArray(data) ? data : []);
        setError(null);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();

    const unsubscribe = onSnapshot(
      collection(db, 'books'),
      (snapshot) => {
        if (!active) return;
        setConnected(true);

        // The REST call above already seeded the initial list — only apply
        // the diffs from here, otherwise every book would "flash" on load.
        if (isFirstSnapshot.current) {
          isFirstSnapshot.current = false;
          return;
        }

        for (const change of snapshot.docChanges()) {
          if (change.type === 'removed') {
            setBooks((prev) => prev.filter((b) => b.id !== change.doc.id));
            continue;
          }

          const row = bookFromDoc(change.doc);

          setBooks((prev) => {
            const index = prev.findIndex((b) => b.id === row.id);
            if (index === -1) return [...prev, row];

            const next = [...prev];
            next[index] = { ...next[index], ...row };
            return next;
          });

          flash(row.id);
        }
      },
      () => {
        if (active) setConnected(false);
      }
    );

    return () => {
      active = false;
      unsubscribe();
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
    };
  }, [flash]);

  return { books, loading, error, connected, flashed };
}

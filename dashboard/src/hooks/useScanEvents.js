import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebaseClient.js';
import { eventFromDoc } from '../lib/firestoreMappers.js';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';
const MAX_EVENTS = 25;

export function useScanEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  // ids that arrived live, so only those animate in — not the initial 20
  const [liveIds, setLiveIds] = useState(() => new Set());
  // the newest LIVE scan — drives the "Card Inserted" overlay. Deliberately
  // not seeded from the initial fetch, or the overlay would fire on page load.
  const [latestScan, setLatestScan] = useState(null);

  useEffect(() => {
    let active = true;
    let isFirstSnapshot = true;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/events/recent`);
        if (!res.ok) throw new Error(`API responded ${res.status}`);

        const data = await res.json();
        if (!active) return;

        setEvents(
          Array.isArray(data)
            ? data.filter((e) => e.event_type !== 'shelf_scan').slice(0, MAX_EVENTS)
            : []
        );
        setError(null);
      } catch (err) {
        // The realtime listener may still connect and recover this panel, so
        // this isn't fatal — but the caller should be able to show it.
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();

    // The REST load above already seeded the initial 20 events, so this
    // listener only needs to watch the single newest doc for live arrivals.
    const q = query(collection(db, 'scanEvents'), orderBy('createdAt', 'desc'), limit(1));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!active) return;
        setConnected(true);

        if (isFirstSnapshot) {
          isFirstSnapshot = false;
          return;
        }

        if (snapshot.empty) return;

        const full = eventFromDoc(snapshot.docs[0]);

        // The overlay fires for EVERY card, including shelf reads...
        setLatestScan(full);

        // ...but the checkpoint feed only lists checkpoint traffic.
        if (full.event_type === 'shelf_scan') return;

        setEvents((prev) => [full, ...prev.filter((e) => e.id !== full.id)].slice(0, MAX_EVENTS));
        setLiveIds((prev) => new Set(prev).add(full.id));
      },
      () => {
        if (active) setConnected(false);
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return {
    events,
    loading,
    error,
    connected,
    liveIds,
    latestScan,
    clearLatestScan: () => setLatestScan(null),
  };
}

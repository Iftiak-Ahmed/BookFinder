import { EVENT_TONE, TONE_VAR, clockTime, describeEvent } from '../lib/format.js';
import { AlertIcon, InIcon, OutIcon, ScanIcon, UserIcon } from './Icons.jsx';

const KIND_ICON = {
  checkout: OutIcon,
  return: InIcon,
  student: UserIcon,
  unknown: AlertIcon,
};

export default function CheckpointFeed({ events, loading, liveIds }) {
  return (
    <section className="panel feed-panel">
      <div className="panel-head">
        <div className="panel-title">
          <h2>Checkpoint</h2>
          <span className="panel-count">Live activity</span>
        </div>
      </div>

      <div className="panel-body">
        {loading ? (
          <div className="feed">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 46 }} />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">
              <ScanIcon size={18} />
            </span>
            <span className="empty-title">Waiting for the first scan</span>
            <span className="empty-hint">
              Tap a student card on the checkpoint reader, then tap a book.
            </span>
          </div>
        ) : (
          <ul className="feed" aria-live="polite" aria-label="Checkpoint scan activity">
            {events.map((event) => {
              const { kind, parts } = describeEvent(event);
              const tone = TONE_VAR[EVENT_TONE[kind]];
              const Icon = KIND_ICON[kind];

              return (
                <li
                  key={event.id}
                  className={`feed-item${liveIds.has(event.id) ? ' is-new' : ''}`}
                  style={{ '--feed-tone': tone.tone, '--feed-wash': tone.wash }}
                >
                  <span className="feed-icon">
                    <Icon size={13} />
                  </span>
                  <div className="feed-body">
                    <p className="feed-text">
                      {parts.map((part, i) =>
                        part.strong ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>
                      )}
                    </p>
                    <p className="feed-time">{clockTime(event.created_at)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

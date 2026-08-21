import { useEffect, useState } from 'react';
import { UserIcon } from './Icons.jsx';

function secondsLeft(expiresAt) {
  return Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
}

/**
 * The student currently "at" the checkpoint — armed by a card tap, visible
 * here so the librarian always knows who a following book scan will apply
 * to. Ends on timeout, another card, or the button below.
 */
export default function ActiveSessionBanner({ session, onEndSession }) {
  const [remaining, setRemaining] = useState(() => (session ? secondsLeft(session.expires_at) : 0));

  useEffect(() => {
    if (!session) return;
    setRemaining(secondsLeft(session.expires_at));
    const t = setInterval(() => setRemaining(secondsLeft(session.expires_at)), 1000);
    return () => clearInterval(t);
  }, [session]);

  if (!session) return null;

  return (
    <div className="session-banner">
      <span className="session-icon">
        <UserIcon size={16} />
      </span>
      <div className="session-body">
        <p className="session-title">
          Active session — <strong>{session.name}</strong>
          {session.student_id ? ` (${session.student_id})` : ''}
          {session.dept ? ` · ${session.dept}` : ''}
        </p>
        <p className="session-hint">Scan a book to issue or return it. Session ends in {remaining}s.</p>
      </div>
      <button type="button" className="text-btn" onClick={onEndSession}>
        End session
      </button>
    </div>
  );
}

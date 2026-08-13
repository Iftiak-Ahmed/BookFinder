import { useEffect } from 'react';
import { AlertIcon, CheckIcon } from './Icons.jsx';

const AUTO_DISMISS_MS = 8000;

/**
 * Fires the instant a shelf reader reports a scan. Correct placement is a
 * quiet green confirmation; a wrong placement is a loud red warning — the
 * alarm itself is driven separately (see useAlarm in App.jsx) so it keeps
 * sounding after this toast has auto-dismissed.
 */
export default function PlacementToast({ scan, onDismiss }) {
  useEffect(() => {
    if (!scan) return;
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [scan, onDismiss]);

  if (!scan) return null;

  const wrong = Boolean(scan.is_misplaced);
  const title = scan.books?.title ?? 'Unknown book';

  return (
    <div className={`placement-toast ${wrong ? 'is-critical' : 'is-good'}`} role="alert">
      <span className="placement-toast-icon">
        {wrong ? <AlertIcon size={17} /> : <CheckIcon size={17} />}
      </span>

      <div className="placement-toast-body">
        {wrong ? (
          <>
            <p className="placement-toast-title">WRONG BOOK PLACEMENT!</p>
            <p className="placement-toast-line">
              Book: <strong>{title}</strong>
            </p>
            <p className="placement-toast-line">Detected Location: {scan.detected_shelf}</p>
            <p className="placement-toast-line">Correct Location: {scan.correct_shelf}</p>
            <p className="placement-toast-alarm">🔊 ALARM ACTIVE</p>
          </>
        ) : (
          <>
            <p className="placement-toast-title">✓ Book Placed Correctly</p>
            <p className="placement-toast-line">
              <strong>{title}</strong> → {scan.detected_shelf}
            </p>
          </>
        )}
      </div>

      <button type="button" className="placement-toast-close" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

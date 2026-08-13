import { useMemo } from 'react';
import { STATE, TONE_VAR, bookState } from '../lib/format.js';
import { AlertIcon, BookIcon, CheckIcon, OutIcon } from './Icons.jsx';

/** Stat tile: label in sentence case, value in proportional figures, colour
 *  carried by the rail and icon rather than by the number itself. */
function Stat({ label, value, hint, tone, Icon, alert = false }) {
  return (
    <div
      className={`stat${alert ? ' is-alert' : ''}`}
      style={{ '--stat-tone': TONE_VAR[tone].tone }}
    >
      <div className="stat-label">
        <Icon size={13} />
        {label}
      </div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export default function StatBar({ books }) {
  const counts = useMemo(() => {
    const tally = { shelved: 0, misplaced: 0, checked_out: 0, unseen: 0 };
    for (const book of books) tally[bookState(book)] += 1;
    return tally;
  }, [books]);

  const total = books.length;

  return (
    <div className="stat-row">
      <Stat
        label="Books tracked"
        value={total}
        hint={counts.unseen ? `${counts.unseen} not yet scanned` : 'All tags seen'}
        tone="muted"
        Icon={BookIcon}
      />
      <Stat
        label="Correctly shelved"
        value={counts.shelved}
        hint={total ? `${Math.round((counts.shelved / total) * 100)}% of collection` : '—'}
        tone="good"
        Icon={CheckIcon}
      />
      <Stat
        label="Checked out"
        value={counts.checked_out}
        hint={counts.checked_out ? 'Currently outside the library' : 'Nothing borrowed'}
        tone="warning"
        Icon={OutIcon}
      />
      <Stat
        label="Misplaced"
        value={counts.misplaced}
        hint={counts.misplaced ? 'Needs re-shelving' : 'Every book on its shelf'}
        tone={counts.misplaced ? 'critical' : 'muted'}
        Icon={AlertIcon}
        alert={counts.misplaced > 0}
      />
    </div>
  );
}

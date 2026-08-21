import { useMemo } from 'react';
import { STATE, TONE_VAR, bookState } from '../lib/format.js';
import { AlertIcon, BookIcon, CheckIcon, ClockIcon, OutIcon } from './Icons.jsx';

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

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  );
}

/**
 * The 6 Library Overview tiles, in a 3-up/3-down grid: Total Books,
 * Available Books, Issued Books, Returned Today, Misplaced Books, Overdue
 * Books. Everything is derived from data the app already loads at the top
 * level (books, transactions, settings) — no extra network calls.
 */
export default function StatBar({ books, transactions = [], settings }) {
  const counts = useMemo(() => {
    const tally = { shelved: 0, misplaced: 0, checked_out: 0, unseen: 0 };
    for (const book of books) tally[bookState(book)] += 1;
    return tally;
  }, [books]);

  const total = books.length;
  const available = total - counts.checked_out;

  const returnedToday = useMemo(
    () => transactions.filter((t) => t.action === 'RETURN' && isToday(t.timestamp)).length,
    [transactions]
  );

  const overdueCount = useMemo(() => {
    if (!settings) return 0;
    const borrowingDays = settings.borrowingDays ?? 14;
    const graceDays = settings.graceDays ?? 0;

    // Latest ISSUE transaction per currently-checked-out book, so we don't
    // need a second network round trip just for the stat tile.
    const latestIssueByBook = new Map();
    for (const t of transactions) {
      if (t.action !== 'ISSUE') continue;
      const existing = latestIssueByBook.get(t.book_id);
      if (!existing || new Date(t.timestamp) > new Date(existing.timestamp)) {
        latestIssueByBook.set(t.book_id, t);
      }
    }

    let overdue = 0;
    for (const book of books) {
      if (book.status !== 'checked_out') continue;
      const issue = latestIssueByBook.get(book.id);
      const dueAt = issue?.expected_return_date
        ? new Date(issue.expected_return_date)
        : issue?.timestamp
        ? new Date(new Date(issue.timestamp).getTime() + borrowingDays * 86_400_000)
        : null;
      if (!dueAt) continue;
      const cutoff = dueAt.getTime() + graceDays * 86_400_000;
      if (Date.now() > cutoff) overdue += 1;
    }
    return overdue;
  }, [books, transactions, settings]);

  return (
    <div className="stat-row">
      <Stat label="Total books" value={total} hint="Tracked collection" tone="muted" Icon={BookIcon} />
      <Stat
        label="Available books"
        value={available}
        hint={total ? `${Math.round((counts.shelved / total) * 100)}% correctly shelved` : '—'}
        tone="good"
        Icon={CheckIcon}
      />
      <Stat
        label="Issued books"
        value={counts.checked_out}
        hint={counts.checked_out ? 'Currently outside the library' : 'Nothing borrowed'}
        tone="warning"
        Icon={OutIcon}
      />
      <Stat
        label="Returned today"
        value={returnedToday}
        hint="Since midnight"
        tone="muted"
        Icon={ClockIcon}
      />
      <Stat
        label="Misplaced books"
        value={counts.misplaced}
        hint={counts.misplaced ? 'Needs re-shelving' : 'Every book on its shelf'}
        tone={counts.misplaced ? 'critical' : 'muted'}
        Icon={AlertIcon}
        alert={counts.misplaced > 0}
      />
      <Stat
        label="Overdue books"
        value={overdueCount}
        hint={overdueCount ? 'Past the borrowing deadline' : 'Nothing overdue'}
        tone={overdueCount ? 'critical' : 'muted'}
        Icon={AlertIcon}
        alert={overdueCount > 0}
      />
    </div>
  );
}

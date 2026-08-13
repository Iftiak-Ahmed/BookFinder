/**
 * One source of truth for how a book row becomes a display state.
 * Every component derives its colour, icon and label from bookState() so the
 * stat tiles, the shelf meters and the cards can never disagree.
 */

export const STATE = {
  SHELVED: 'shelved',
  MISPLACED: 'misplaced',
  OUT: 'checked_out',
  UNSEEN: 'unseen',
};

export function bookState(book) {
  if (book.status === 'checked_out') return STATE.OUT;
  if (book.is_misplaced) return STATE.MISPLACED;
  if (!book.current_shelf) return STATE.UNSEEN;
  return STATE.SHELVED;
}

/** tone -> CSS custom property pair. 'unseen' is absence of data, so it is
 *  deliberately grey rather than a fourth status hue. */
export const TONE_VAR = {
  good: { tone: 'var(--good)', wash: 'var(--good-wash)' },
  warning: { tone: 'var(--warning)', wash: 'var(--warning-wash)' },
  critical: { tone: 'var(--critical)', wash: 'var(--critical-wash)' },
  muted: { tone: 'var(--text-muted)', wash: 'var(--surface-2)' },
};

export const STATE_TONE = {
  [STATE.SHELVED]: 'good',
  [STATE.MISPLACED]: 'critical',
  [STATE.OUT]: 'warning',
  [STATE.UNSEEN]: 'muted',
};

export const STATE_LABEL = {
  [STATE.SHELVED]: 'On shelf',
  [STATE.MISPLACED]: 'Misplaced',
  [STATE.OUT]: 'Checked out',
  [STATE.UNSEEN]: 'Not scanned',
};

/** Clock time — a demo audience matches this against the wall clock. */
export function clockTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** "just now" / "4m ago" / "2h ago" — for last_seen_at, where age is the point. */
export function relativeTime(iso) {
  if (!iso) return 'never';

  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);

  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Turn a scan_events row into the sentence shown in the checkpoint feed.
 * Returns segments so the component can bold the names without dangerouslySetInnerHTML.
 */
export function describeEvent(event) {
  const student = event.students;
  const book = event.books;

  if (event.event_type === 'student_scan') {
    if (!student) {
      return { kind: 'unknown', parts: [{ text: `Unregistered card ${event.uid}` }, { text: ' scanned at the checkpoint' }] };
    }
    return {
      kind: 'student',
      parts: [
        { text: student.name, strong: true },
        { text: `, ID ${student.student_id}, ` },
        { text: 'is at the checkpoint' },
      ],
    };
  }

  if (!book) {
    return {
      kind: 'unknown',
      parts: [{ text: `Unregistered tag ${event.uid}`, strong: true }, { text: ' scanned at the checkpoint' }],
    };
  }

  const title = `${book.title} Copy ${book.copy_no}`;

  // book_status is the status this scan PRODUCED. books.status is only a
  // fallback for rows written before that column existed — using it alone
  // would relabel a past checkout as a return once the book came back.
  const statusAtScan = event.book_status ?? book.status;
  const returning = statusAtScan !== 'checked_out';

  return {
    kind: returning ? 'return' : 'checkout',
    parts: [
      { text: student ? student.name : 'Unknown student', strong: true },
      { text: student ? `, ID ${student.student_id}, ` : ' ' },
      { text: returning ? 'returned ' : 'checked out ' },
      { text: title, strong: true },
    ],
  };
}

export const EVENT_TONE = {
  checkout: 'warning',
  return: 'good',
  student: 'muted',
  unknown: 'critical',
};

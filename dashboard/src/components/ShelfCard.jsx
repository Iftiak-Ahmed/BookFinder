import { STATE, STATE_TONE, TONE_VAR, bookState, relativeTime } from '../lib/format.js';
import { AlertIcon } from './Icons.jsx';
import StatusPill from './StatusPill.jsx';

export default function ShelfCard({ book, flashing = false }) {
  const state = bookState(book);
  const tone = TONE_VAR[STATE_TONE[state]];

  const className = [
    'book',
    state === STATE.MISPLACED && 'is-misplaced',
    state === STATE.OUT && 'is-out',
    flashing && 'is-flash',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={className} style={{ '--book-tone': tone.tone }}>
      <h4 className="book-title">{book.title}</h4>
      <p className="book-meta">
        Copy {book.copy_no}
        {book.category ? ` · ${book.category}` : ''}
      </p>

      {state === STATE.MISPLACED && (
        <p className="misplace-note">
          <AlertIcon size={13} />
          <span>
            Currently on <strong>{book.current_shelf ?? 'an unknown shelf'}</strong>, belongs on{' '}
            <strong>{book.correct_shelf}</strong>
          </span>
        </p>
      )}

      <div className="book-foot">
        <StatusPill state={state} />
        {book.last_seen_at && <span className="book-seen">{relativeTime(book.last_seen_at)}</span>}
      </div>
    </article>
  );
}

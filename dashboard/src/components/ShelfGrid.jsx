import { useMemo, useState } from 'react';
import { STATE, TONE_VAR, bookState, rackTone } from '../lib/format.js';
import { ShelfIcon } from './Icons.jsx';
import ShelfCard from './ShelfCard.jsx';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: STATE.MISPLACED, label: 'Misplaced' },
  { id: STATE.OUT, label: 'Checked out' },
  { id: STATE.SHELVED, label: 'On shelf' },
];

/** Fill colour follows the worst state on the shelf; the track is a wash of
 *  the same hue, so the whole bar reads as one severity. */
function shelfTone(books) {
  if (books.some((b) => bookState(b) === STATE.MISPLACED)) return 'critical';
  if (books.some((b) => bookState(b) === STATE.OUT)) return 'warning';
  return 'good';
}

/** "CSE · Upper Rack · Operating System" -> "Upper Rack · Operating System". */
function rackSubLabel(correctShelf) {
  const parts = (correctShelf ?? '').split(' · ');
  return parts.length >= 3 ? parts.slice(1).join(' · ') : correctShelf ?? 'Unassigned';
}

/** Upper vs Lower rack gets its own identity color — separate from the book's
 *  status color (good/warning/critical), so both signals stay visible at once. */
function rackPositionTone(rackTitle) {
  if (rackTitle.startsWith('Upper')) return '#0ea5e9';
  if (rackTitle.startsWith('Lower')) return '#8b5cf6';
  return null;
}

/** Splits a department's books into its Upper/Lower rack sub-groups, in a stable order. */
function racks(books) {
  const grouped = new Map();
  for (const book of books) {
    const rack = rackSubLabel(book.correct_shelf);
    if (!grouped.has(rack)) grouped.set(rack, []);
    grouped.get(rack).push(book);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** Case-insensitive substring match against the fields a librarian would search by. */
function matchesSearch(book, query) {
  if (!query) return true;
  const haystack = [book.title, book.author, book.id, book.rfid_uid, book.dept]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export default function ShelfGrid({ books, loading, flashed }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const searched = useMemo(() => books.filter((b) => matchesSearch(b, search)), [books, search]);

  const tallies = useMemo(() => {
    const t = { all: searched.length, [STATE.MISPLACED]: 0, [STATE.OUT]: 0, [STATE.SHELVED]: 0 };
    for (const book of searched) {
      const state = bookState(book);
      if (state in t) t[state] += 1;
    }
    return t;
  }, [searched]);

  // One panel per DEPARTMENT (3 shelves), each holding its Upper + Lower rack
  // books together. Grouped by where a book BELONGS, not where it is — so a
  // misplaced book stays under its home shelf and the mismatch is visible in
  // context. `dept` is set at registration; older rows fall back to parsing
  // it from the correct_shelf label.
  const shelves = useMemo(() => {
    const grouped = new Map();

    for (const book of searched) {
      const dept = book.dept ?? (book.correct_shelf ?? 'Unassigned').split(' · ')[0];
      if (!grouped.has(dept)) grouped.set(dept, []);
      grouped.get(dept).push(book);
    }

    for (const list of grouped.values()) {
      list.sort((a, b) => {
        // misplaced books float to the top of their shelf
        const aBad = bookState(a) === STATE.MISPLACED ? 0 : 1;
        const bBad = bookState(b) === STATE.MISPLACED ? 0 : 1;
        return (
          aBad - bBad ||
          (a.correct_shelf ?? '').localeCompare(b.correct_shelf ?? '') ||
          (a.title ?? '').localeCompare(b.title ?? '') ||
          (a.copy_no ?? 0) - (b.copy_no ?? 0)
        );
      });
    }

    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [searched]);

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <h2>Shelves</h2>
          </div>
        </div>
        <div className="panel-body">
          <div className="shelves">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ height: 210 }} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">
          <h2>Shelves</h2>
          <span className="panel-count">{shelves.length} shelves</span>
        </div>

        <input
          type="search"
          className="search-input"
          placeholder="Search title, author, dept, UID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search books"
        />

        <div className="filters" role="group" aria-label="Filter books by state">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="filter-btn"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span className="filter-tally">{tallies[f.id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel-body">
        {shelves.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">
              <ShelfIcon size={18} />
            </span>
            <span className="empty-title">No books yet</span>
            <span className="empty-hint">
              Register books with <code>node scripts/registerBook.js</code> in the{' '}
              <code>backend</code> folder to load the collection.
            </span>
          </div>
        ) : (
          <div className="shelves">
            {shelves.map(([label, shelfBooks]) => {
              const present = shelfBooks.filter((b) => bookState(b) === STATE.SHELVED).length;
              const tone = shelfTone(shelfBooks);
              const visible =
                filter === 'all' ? shelfBooks : shelfBooks.filter((b) => bookState(b) === filter);

              return (
                <div className="shelf" key={label} style={{ '--rack-tone': rackTone(label) }}>
                  <div className="shelf-head">
                    <div className="shelf-title-row">
                      <span className="shelf-title-group">
                        <span className="rack-dot" aria-hidden="true" />
                        <span className="shelf-title">{label}</span>
                      </span>
                      <span className="shelf-tally">
                        {present}/{shelfBooks.length} in place
                      </span>
                    </div>
                    <div
                      className="meter"
                      style={{ '--meter-tone': TONE_VAR[tone].tone }}
                      role="img"
                      aria-label={`${present} of ${shelfBooks.length} books correctly on ${label}`}
                    >
                      <div
                        className="meter-fill"
                        style={{ width: `${(present / shelfBooks.length) * 100}%` }}
                      />
                    </div>
                  </div>

                  {visible.length === 0 ? (
                    <p className="book-seen" style={{ padding: '6px 2px' }}>
                      Nothing matches this filter.
                    </p>
                  ) : (
                    racks(visible).map(([rackTitle, rackBooks]) => (
                      <div
                        className="rack-group"
                        key={rackTitle}
                        style={{ '--position-tone': rackPositionTone(rackTitle) }}
                      >
                        <p className="rack-group-title">{rackTitle}</p>
                        <div className="shelf-books">
                          {rackBooks.map((book) => (
                            <ShelfCard key={book.id} book={book} flashing={flashed.has(book.id)} />
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

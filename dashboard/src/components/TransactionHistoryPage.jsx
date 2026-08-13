import { useMemo, useState } from 'react';
import { AlertIcon, BookIcon, ClockIcon } from './Icons.jsx';
import { clockTime } from '../lib/format.js';

function dateLabel(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

const ACTIONS = [
  { id: 'all', label: 'All' },
  { id: 'ISSUE', label: 'Issued' },
  { id: 'RETURN', label: 'Returned' },
];

export default function TransactionHistoryPage({ transactions, loading, error, onBack }) {
  const [action, setAction] = useState('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (action !== 'all' && t.action !== action) return false;
      if (!query) return true;
      const haystack = `${t.book_title} ${t.student_name} ${t.student_number}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    });
  }, [transactions, action, query]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <ClockIcon size={17} />
          </span>
          <div>
            <h1>Transaction History</h1>
            <p className="brand-sub">Issue / return audit trail · CSE-406 · MIST</p>
          </div>
        </div>

        <div className="header-tools">
          <button type="button" className="text-btn" onClick={onBack}>
            Back to dashboard
          </button>
        </div>
      </header>

      <main className="content">
        {error && (
          <div className="banner" role="alert">
            <AlertIcon size={15} />
            <span>Cannot reach the backend ({error}).</span>
          </div>
        )}

        <section className="panel">
          <div className="panel-head">
            <div className="panel-title">
              <h2>History</h2>
              <span className="panel-count">{filtered.length} transactions</span>
            </div>

            <input
              type="search"
              className="search-input"
              placeholder="Search student or book..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search transactions"
            />

            <div className="filters" role="group" aria-label="Filter by action">
              {ACTIONS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="filter-btn"
                  aria-pressed={action === a.id}
                  onClick={() => setAction(a.id)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="panel-body">
            {loading ? (
              <div className="skeleton" style={{ height: 220 }} />
            ) : filtered.length === 0 ? (
              <div className="empty">
                <span className="empty-icon">
                  <BookIcon size={18} />
                </span>
                <span className="empty-title">No transactions recorded</span>
                <span className="empty-hint">
                  Tap a student card then a book at the checkpoint reader to issue or return one.
                </span>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Book</th>
                      <th>Action</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => (
                      <tr key={t.id}>
                        <td>
                          {t.student_name}
                          {t.student_number ? ` (${t.student_number})` : ''}
                        </td>
                        <td>
                          {t.book_title}
                          {t.copy_no ? ` (Copy ${t.copy_no})` : ''}
                        </td>
                        <td>
                          <span className={`pill${t.action === 'ISSUE' ? ' is-muted' : ' is-good'}`}>
                            {t.action === 'ISSUE' ? 'Issued' : 'Returned'}
                          </span>
                        </td>
                        <td>{dateLabel(t.timestamp)}</td>
                        <td>{clockTime(t.timestamp)}</td>
                        <td>{t.remark}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

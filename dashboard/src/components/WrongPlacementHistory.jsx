import { useState } from 'react';
import { AlertIcon, BookIcon, CheckIcon } from './Icons.jsx';
import { clockTime } from '../lib/format.js';

function dateLabel(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

export default function WrongPlacementHistory({ alerts, activeCount, loading, onResolve, onBack }) {
  const [resolveError, setResolveError] = useState(null);

  async function handleResolve(id) {
    setResolveError(null);
    const ok = await onResolve(id);
    if (!ok) setResolveError('Could not resolve that alert — check the connection and try again.');
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <BookIcon size={17} />
          </span>
          <div>
            <h1>Wrong Placement History</h1>
            <p className="brand-sub">Misplacement alerts · CSE-406 · MIST</p>
          </div>
        </div>

        <div className="header-tools">
          <span className={`pill alert-count-pill${activeCount > 0 ? ' is-critical' : ''}`}>
            <AlertIcon size={12} />
            Active Alerts: {activeCount}
          </span>
          <button type="button" className="text-btn" onClick={onBack}>
            Back to dashboard
          </button>
        </div>
      </header>

      <main className="content">
        {resolveError && (
          <div className="banner" role="alert">
            <AlertIcon size={15} />
            <span>{resolveError}</span>
          </div>
        )}

        <section className="panel">
          <div className="panel-head">
            <div className="panel-title">
              <h2>History</h2>
              <span className="panel-count">{alerts.length} incidents</span>
            </div>
          </div>

          <div className="panel-body">
            {loading ? (
              <div className="skeleton" style={{ height: 220 }} />
            ) : alerts.length === 0 ? (
              <div className="empty">
                <span className="empty-icon">
                  <CheckIcon size={18} />
                </span>
                <span className="empty-title">No misplacements recorded</span>
                <span className="empty-hint">Every scanned book has landed on its correct rack so far.</span>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Book</th>
                      <th>Correct Location</th>
                      <th>Detected Location</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((a) => (
                      <tr key={a.id} className={a.status === 'active' ? 'is-active-row' : ''}>
                        <td>
                          {a.book_title}
                          {a.copy_no ? ` (Copy ${a.copy_no})` : ''}
                        </td>
                        <td>{a.correct_shelf}</td>
                        <td>{a.detected_shelf}</td>
                        <td>{dateLabel(a.created_at)}</td>
                        <td>{clockTime(a.created_at)}</td>
                        <td>
                          <span className={`pill${a.status === 'active' ? ' is-critical' : ' is-good'}`}>
                            {a.status === 'active' ? <AlertIcon size={11} /> : <CheckIcon size={11} />}
                            {a.status === 'active' ? 'Active' : 'Resolved'}
                          </span>
                        </td>
                        <td>
                          {a.status === 'active' && (
                            <button type="button" className="text-btn" onClick={() => handleResolve(a.id)}>
                              Mark as Resolved
                            </button>
                          )}
                        </td>
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

import { AlertIcon, InIcon, OutIcon, UserIcon } from './Icons.jsx';
import { clockTime } from '../lib/format.js';

function dateLabel(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

export default function AccessLogPage({ logs, loading, error, onBack }) {
  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <UserIcon size={17} />
          </span>
          <div>
            <h1>Entry / Exit Log</h1>
            <p className="brand-sub">Student checkpoint activity</p>
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
              <h2>Activity</h2>
              <span className="panel-count">{logs.length} events</span>
            </div>
          </div>

          <div className="panel-body">
            {loading ? (
              <div className="skeleton" style={{ height: 220 }} />
            ) : logs.length === 0 ? (
              <div className="empty">
                <span className="empty-icon">
                  <UserIcon size={18} />
                </span>
                <span className="empty-title">No activity recorded</span>
                <span className="empty-hint">Entry/exit events appear here when a student taps their card.</span>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Event</th>
                      <th>Date</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((l) => (
                      <tr key={l.id}>
                        <td>
                          {l.student_name}
                          {l.student_number ? ` (${l.student_number})` : ''}
                        </td>
                        <td>
                          <span className={`pill${l.event === 'ENTRY' ? ' is-good' : ' is-muted'}`}>
                            {l.event === 'ENTRY' ? <InIcon size={11} /> : <OutIcon size={11} />}
                            {l.event === 'ENTRY' ? 'Entry' : 'Exit'}
                          </span>
                        </td>
                        <td>{dateLabel(l.timestamp)}</td>
                        <td>{clockTime(l.timestamp)}</td>
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

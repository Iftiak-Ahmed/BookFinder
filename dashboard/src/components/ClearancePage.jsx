import { useMemo, useState } from 'react';
import { AlertIcon, BookIcon, CheckIcon } from './Icons.jsx';

function dateLabel(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

const FILTERS = ['pending', 'approved', 'rejected', 'all'];

function ClearanceRow({ request, reviewer, onApprove, onReject, certificateUrl }) {
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState(null);

  async function handleApprove() {
    setBusy(true);
    setRowError(null);
    try {
      await onApprove(request.id, reviewer);
    } catch (err) {
      setRowError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    const reason = window.prompt(`Reason for rejecting ${request.full_name}'s application:`);
    if (!reason || !reason.trim()) return;

    setBusy(true);
    setRowError(null);
    try {
      await onReject(request.id, reason.trim(), reviewer);
    } catch (err) {
      setRowError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr>
        <td>{request.student_id}</td>
        <td>{request.full_name}</td>
        <td>{request.department}</td>
        <td>{request.session}</td>
        <td>
          <span
            className={`pill${
              request.status === 'approved'
                ? ' is-good'
                : request.status === 'rejected'
                ? ' is-critical'
                : ' is-muted'
            }`}
          >
            {request.status}
          </span>
        </td>
        <td>{dateLabel(request.created_at)}</td>
        <td>
          {request.status === 'pending' ? (
            <>
              <button type="button" className="text-btn" onClick={handleApprove} disabled={busy}>
                {busy ? 'Working…' : 'Approve'}
              </button>
              <button type="button" className="text-btn" onClick={handleReject} disabled={busy}>
                Reject
              </button>
            </>
          ) : request.status === 'approved' ? (
            <a className="text-btn" href={certificateUrl(request.id)} target="_blank" rel="noreferrer">
              View PDF
            </a>
          ) : (
            <span className="empty-hint">{request.rejection_reason}</span>
          )}
        </td>
      </tr>
      {rowError && (
        <tr>
          <td colSpan={7} style={{ color: 'var(--critical)' }}>
            {rowError}
          </td>
        </tr>
      )}
    </>
  );
}

export default function ClearancePage({
  requests,
  loading,
  error,
  reviewer,
  onApprove,
  onReject,
  certificateUrl,
  onBack,
}) {
  const [filter, setFilter] = useState('pending');

  const filtered = useMemo(() => {
    if (filter === 'all') return requests;
    return requests.filter((r) => r.status === filter);
  }, [requests, filter]);

  return (
    <div className="app librarian-theme">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <CheckIcon size={17} />
          </span>
          <div>
            <h1>Library Clearance</h1>
            <p className="brand-sub">Student clearance requests</p>
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
              <h2>Requests</h2>
              <span className="panel-count">{filtered.length} shown</span>
            </div>

            <div className="header-tools">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className="text-btn"
                  onClick={() => setFilter(f)}
                  style={{ textTransform: 'capitalize', fontWeight: filter === f ? 700 : 400 }}
                >
                  {f}
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
                <span className="empty-title">No requests</span>
                <span className="empty-hint">Nothing to show for this filter.</span>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Student ID</th>
                      <th>Name</th>
                      <th>Dept</th>
                      <th>Session</th>
                      <th>Status</th>
                      <th>Applied</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <ClearanceRow
                        key={r.id}
                        request={r}
                        reviewer={reviewer}
                        onApprove={onApprove}
                        onReject={onReject}
                        certificateUrl={certificateUrl}
                      />
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

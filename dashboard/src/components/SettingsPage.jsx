import { useEffect, useState } from 'react';
import { AlertIcon, CheckIcon, GearIcon } from './Icons.jsx';
import RegisterBookForm from './RegisterBookForm.jsx';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

/** Wipes the checkpoint feed and transaction log — books, students and
 *  shelf state are untouched. Separate from the borrowing-rules form since
 *  it's a destructive action on different data, not a setting to save. */
function ClearHistorySection({ onCleared }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function handleClear() {
    if (
      !window.confirm(
        'Clear all checkpoint scan activity and transaction history? This cannot be undone. Books, students and shelf placements are not affected.'
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/history`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `API responded ${res.status}`);

      setMessage({
        kind: 'success',
        text: `Cleared ${data.events_removed} checkpoint event(s) and ${data.transactions_removed} transaction(s).`,
      });
      onCleared?.();
    } catch (err) {
      setMessage({ kind: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">
          <h2>Clear History</h2>
        </div>
      </div>
      <div className="panel-body">
        <div className="form-field">
          <span className="settings-field-label">Checkpoint feed &amp; transaction log</span>
          <span className="field-hint">
            Permanently deletes the checkpoint scan activity and issue/return transaction history.
            Books, students and current shelf placements are not affected.
          </span>
          <button
            type="button"
            className="btn-primary"
            style={{ background: 'var(--critical)', marginTop: 8, alignSelf: 'flex-start' }}
            onClick={handleClear}
            disabled={busy}
          >
            {busy ? 'Clearing…' : 'Clear Checkpoint & Transaction History'}
          </button>
        </div>

        {message && (
          <p className={message.kind === 'error' ? 'form-error' : 'form-success'}>{message.text}</p>
        )}
      </div>
    </section>
  );
}

function NumberField({ label, hint, value, onChange, min = 0, suffix }) {
  return (
    <label className="form-field">
      <span className="settings-field-label">{label}</span>
      <div className="field-input-row">
        <input
          type="number"
          min={min}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="field-input"
        />
        {suffix && <span className="field-suffix">{suffix}</span>}
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export default function SettingsPage({ settings, saving, error, onSave, onBack, onHistoryCleared }) {
  const [form, setForm] = useState(settings);
  const [savedMessage, setSavedMessage] = useState(null);

  useEffect(() => setForm(settings), [settings]);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSavedMessage(null);
    const ok = await onSave(form);
    if (ok) setSavedMessage('Settings saved.');
  }

  return (
    <div className="app librarian-theme">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <GearIcon size={17} />
          </span>
          <div>
            <h1>Settings</h1>
            <p className="brand-sub">Register books, borrowing rules &amp; fines</p>
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
            <span>{error}</span>
          </div>
        )}

        {savedMessage && (
          <div className="banner is-good-banner" role="status">
            <CheckIcon size={15} />
            <span>{savedMessage}</span>
          </div>
        )}

        <RegisterBookForm />

        <form onSubmit={handleSave}>
          <section className="panel">
            <div className="panel-head">
              <div className="panel-title">
                <h2>Borrowing Rules</h2>
              </div>
            </div>
            <div className="panel-body settings-fields">
              <NumberField
                label="Maximum borrowing duration"
                hint="Expected return date = issue date + this many days"
                value={form.borrowingDays}
                onChange={(v) => set('borrowingDays', v)}
                min={1}
                suffix="days"
              />
              <NumberField
                label="Grace period"
                hint="Extra days allowed before a fine starts accruing"
                value={form.graceDays}
                onChange={(v) => set('graceDays', v)}
                suffix="days"
              />
              <NumberField
                label="Maximum books per student"
                hint="Checkpoint refuses to issue a new book past this limit"
                value={form.maxBooksPerStudent}
                onChange={(v) => set('maxBooksPerStudent', v)}
                min={1}
                suffix="books"
              />
              <NumberField
                label="Checkpoint session timeout"
                hint="How long a tapped student card stays active for the next book scan"
                value={form.sessionTimeoutSeconds}
                onChange={(v) => set('sessionTimeoutSeconds', v)}
                min={5}
                suffix="seconds"
              />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div className="panel-title">
                <h2>Fine Management</h2>
              </div>
            </div>
            <div className="panel-body settings-fields">
              <NumberField
                label="Fine per day"
                hint="Charged for every day past the grace-adjusted return deadline"
                value={form.finePerDay}
                onChange={(v) => set('finePerDay', v)}
                suffix="Taka / day"
              />
            </div>
          </section>

          <div className="settings-save-row">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </form>

        <ClearHistorySection onCleared={onHistoryCleared} />
      </main>
    </div>
  );
}

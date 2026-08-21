import { useEffect, useState } from 'react';
import { AlertIcon, CheckIcon, ScanIcon } from './Icons.jsx';
import { useRegisterBook } from '../hooks/useRegisterBook.js';

const RACK_OPTIONS = ['Rack 1', 'Rack 2', 'Rack 3'];
const SHELF_OPTIONS = ['Upper', 'Lower'];

const EMPTY_FORM = { uid: '', title: '', author: '', rack: '', shelf: '', copy_no: '' };

function ExistingRecord({ existing }) {
  if (!existing) return null;

  if (existing.type === 'student') {
    return (
      <p className="field-hint">
        That RFID UID is already registered to student <strong>{existing.name}</strong> (
        {existing.student_id}, {existing.dept}).
      </p>
    );
  }

  return (
    <p className="field-hint">
      Existing record — <strong>{existing.title}</strong> by {existing.author}, Copy {existing.copy_no},
      RFID {existing.rfid_uid}, {existing.correct_shelf}, status: {existing.status}.
    </p>
  );
}

export default function RegisterBookForm() {
  const { armed, scannedUid, registering, armScan, cancelScan, setManualUid, registerBook } =
    useRegisterBook();
  const [form, setForm] = useState(EMPTY_FORM);
  const [validationError, setValidationError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [existing, setExisting] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (scannedUid) {
      setForm((f) => ({ ...f, uid: scannedUid }));
      setValidationError(null);
    }
  }, [scannedUid]);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleScanClick() {
    setSuccess(null);
    setSubmitError(null);
    setExisting(null);
    await armScan();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSuccess(null);
    setSubmitError(null);
    setExisting(null);

    const { uid, title, author, rack, shelf, copy_no } = form;
    if (!uid || !title || !author || !rack || !shelf || !copy_no) {
      setValidationError('RFID Card No, Book Name, Writer, Rack, Shelf and Copy are all required.');
      return;
    }
    setValidationError(null);

    try {
      const created = await registerBook({ uid, title, author, rack, shelf, copy_no });
      setSuccess(`Book registered successfully — "${created.title}" (Copy ${created.copy_no}).`);
      setForm(EMPTY_FORM);
    } catch (err) {
      setSubmitError(err.message);
      setExisting(err.existing ?? null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">
          <h2>Register Book</h2>
        </div>
      </div>

      <div className="panel-body">
        {armed && (
          <div className="banner is-accent-banner" role="status">
            <ScanIcon size={15} />
            <span>Please scan the RFID card/tag of the book.</span>
          </div>
        )}

        {!armed && scannedUid && form.uid === scannedUid && (
          <div className="banner is-good-banner" role="status">
            <CheckIcon size={15} />
            <span>RFID card scanned successfully.</span>
          </div>
        )}

        {validationError && (
          <div className="banner" role="alert">
            <AlertIcon size={15} />
            <span>{validationError}</span>
          </div>
        )}

        {submitError && (
          <div className="banner" role="alert">
            <AlertIcon size={15} />
            <div>
              <span>{submitError}</span>
              <ExistingRecord existing={existing} />
            </div>
          </div>
        )}

        {success && (
          <div className="banner is-good-banner" role="status">
            <CheckIcon size={15} />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="settings-fields register-book-form">
          <label className="form-field">
            <span className="settings-field-label">RFID Card No</span>
            <div className="field-input-row">
              <input
                className="field-input"
                placeholder="Scan or type UID"
                value={form.uid}
                onChange={(e) => {
                  set('uid', e.target.value);
                  setManualUid(null);
                }}
              />
              <button type="button" className="btn-primary" onClick={handleScanClick} disabled={armed}>
                {armed ? 'Waiting for scan…' : 'Scan the Book'}
              </button>
              {armed && (
                <button type="button" className="text-btn" onClick={cancelScan}>
                  Cancel
                </button>
              )}
            </div>
          </label>

          <label className="form-field">
            <span className="settings-field-label">Book Name</span>
            <input
              className="field-input"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Artificial Intelligence"
            />
          </label>

          <label className="form-field">
            <span className="settings-field-label">Writer</span>
            <input
              className="field-input"
              value={form.author}
              onChange={(e) => set('author', e.target.value)}
              placeholder="e.g. Stuart Russell"
            />
          </label>

          <label className="form-field">
            <span className="settings-field-label">Rack</span>
            <select className="field-input" value={form.rack} onChange={(e) => set('rack', e.target.value)}>
              <option value="">Select rack…</option>
              {RACK_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span className="settings-field-label">Shelf</span>
            <select className="field-input" value={form.shelf} onChange={(e) => set('shelf', e.target.value)}>
              <option value="">Select shelf…</option>
              {SHELF_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span className="settings-field-label">Copy</span>
            <input
              type="number"
              min="1"
              className="field-input"
              value={form.copy_no}
              onChange={(e) => set('copy_no', e.target.value)}
              placeholder="e.g. 1"
            />
          </label>
        </form>

        <div className="settings-save-row">
          <button type="button" className="btn-primary" onClick={handleSubmit} disabled={registering}>
            {registering ? 'Registering…' : 'Register Book'}
          </button>
        </div>
      </div>
    </section>
  );
}

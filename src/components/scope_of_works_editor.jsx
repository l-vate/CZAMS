import { useState } from 'react';
import { addScopeLine, updateScopeLine, removeScopeLine } from '../services/bookingService';
import { attempt } from '../services/apiClient';
import { formatPeso } from '../utils/bookingPricing';
import { BOOKING_STATUS } from '../constants/bookingStatus';
import scopeConstants from '../../server/constants/scopeLines.json';

const { kinds: KINDS, presets: PRESETS, serviceKinds: SERVICE_KINDS, limits: LIMITS } = scopeConstants;
const EDITABLE = [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS];
const EMPTY = { kind: 'installation', description: '', quantity: '1', unitLabel: '', unitRate: '' };

const amountOf = (draft) => {
  const total = Number(draft.quantity) * Number(draft.unitRate);
  return Number.isFinite(total) ? Math.round(total * 100) / 100 : 0;
};

// The admin's scope of works for one booking: dismantling, installation, excess pipe, distance and other lines, each with a quantity, a
// unit and a rate. Adding a line is one form with a preset for each kind; changing or removing a line asks for a short reason, which goes
// on the audit trail. The customer is told what changed and the new total. Lines only move the remaining balance, never the down
// payment already requested or paid. Dismantling, installation, excess pipe and other lines take the Senior/PWD discount; a distance
// line never does. The server enforces all of it; this only shows it.
function ScopeOfWorksEditor({ booking, onUpdated }) {
  const lines = booking.scopeLines || [];
  const canEdit = EDITABLE.includes(booking.status) && !booking.isBackJob;
  const [draft, setDraft] = useState(EMPTY);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // { id, draft, reason }
  const [removing, setRemoving] = useState(null); // { id, reason }
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (booking.isBackJob) return null;

  const run = async (call, onDone) => {
    setSaving(true);
    setError('');
    try {
      const result = await attempt(call(), 'Could not save the change.');
      if (result.error) { setError(result.error); return; }
      onUpdated?.(result.data);
      onDone();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const chooseKind = (setter, current, kind) => setter({ ...current, kind, description: kind === 'other' ? '' : PRESETS[kind].description, unitLabel: PRESETS[kind].unitLabel });

  const lineForm = (value, setValue, idPrefix) => (
    <div className="scope-form">
      <label>
        Kind
        <select className="ma-input" value={value.kind} onChange={(e) => chooseKind(setValue, value, e.target.value)} id={`${idPrefix}-kind`}>
          {/* an Installation service already includes the installation, so a new Installation line would charge it twice (an old one stays editable) */}
          {KINDS.filter((k) => !(k === 'installation' && booking.service?.serviceType === 'Installation' && value.kind !== 'installation')).map((k) => <option key={k} value={k}>{PRESETS[k].label}</option>)}
        </select>
      </label>
      <label className="scope-form-wide">
        Description
        <input
          className="ma-input" type="text" maxLength={LIMITS.description} value={value.description}
          placeholder={value.kind === 'other' ? 'Describe the work' : PRESETS[value.kind].description}
          onChange={(e) => setValue({ ...value, description: e.target.value })}
        />
      </label>
      <label>
        Quantity
        <input className="ma-input" type="number" min="0" step="any" value={value.quantity} onChange={(e) => setValue({ ...value, quantity: e.target.value })} />
      </label>
      <label>
        Unit
        <input className="ma-input" type="text" maxLength={LIMITS.unitLabel} value={value.unitLabel} placeholder={PRESETS[value.kind].unitLabel} onChange={(e) => setValue({ ...value, unitLabel: e.target.value })} />
      </label>
      <label>
        Rate (₱)
        <input className="ma-input" type="number" min="0" step="any" value={value.unitRate} onChange={(e) => setValue({ ...value, unitRate: e.target.value })} />
      </label>
      <p className="scope-form-amount">Amount: <strong>{formatPeso(amountOf(value))}</strong>
        {value.kind === 'distance' ? ' (never discounted)' : ''}
      </p>
    </div>
  );

  return (
    <section className="scope-editor" aria-label="Scope of works">
      <h5 className="sdm-col-heading">SCOPE OF WORKS</h5>
      {lines.length === 0 && <p className="sdm-muted">No lines yet. Add the work this quotation covers.</p>}

      <ul className="scope-lines">
        {lines.map((l) => {
          const id = String(l._id);
          const isEditing = editing?.id === id;
          const isRemoving = removing?.id === id;
          return (
            <li key={id} className="scope-line">
              {isEditing ? (
                <>
                  {lineForm(editing.draft, (d) => setEditing({ ...editing, draft: d }), `edit-${id}`)}
                  <label className="scope-form-wide">
                    Reason for the change (required)
                    <input className="ma-input" type="text" maxLength={LIMITS.reason} value={editing.reason} onChange={(e) => setEditing({ ...editing, reason: e.target.value })} />
                  </label>
                  <div className="scope-actions">
                    <button type="button" className="sdm-btn sdm-btn-outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
                    <button
                      type="button" className="sdm-btn sdm-btn-primary" disabled={saving}
                      onClick={() => run(
                        () => updateScopeLine(booking.bookingId, id, { ...editing.draft, reason: editing.reason }),
                        () => setEditing(null),
                      )}
                    >Save change</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="scope-line-main">
                    <span>
                      <strong>{l.description}</strong>
                      <span className="sdm-muted"> {l.quantity} {l.unitLabel} at {formatPeso(l.unitRate)}{SERVICE_KINDS.includes(l.kind) ? '' : ' (not discounted)'}</span>
                    </span>
                    <span className="sdm-list-value">{formatPeso(l.amount)}</span>
                  </div>
                  {canEdit && !isRemoving && (
                    <div className="scope-actions">
                      <button
                        type="button" className="sdm-btn sdm-btn-outline"
                        onClick={() => { setRemoving(null); setEditing({ id, reason: '', draft: { kind: l.kind, description: l.description, quantity: String(l.quantity), unitLabel: l.unitLabel || '', unitRate: String(l.unitRate) } }); }}
                      >Edit</button>
                      <button type="button" className="sdm-btn sdm-btn-outline" onClick={() => { setEditing(null); setRemoving({ id, reason: '' }); }}>Remove</button>
                    </div>
                  )}
                  {isRemoving && (
                    <div className="scope-form">
                      <label className="scope-form-wide">
                        Reason for removing it (required)
                        <input className="ma-input" type="text" maxLength={LIMITS.reason} value={removing.reason} onChange={(e) => setRemoving({ ...removing, reason: e.target.value })} />
                      </label>
                      <div className="scope-actions">
                        <button type="button" className="sdm-btn sdm-btn-outline" onClick={() => setRemoving(null)} disabled={saving}>Keep it</button>
                        <button
                          type="button" className="sdm-btn sdm-btn-danger" disabled={saving}
                          onClick={() => run(() => removeScopeLine(booking.bookingId, id, removing.reason), () => setRemoving(null))}
                        >Remove line</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {error && <p className="ma-form-error" role="alert">{error}</p>}

      {canEdit ? (
        adding ? (
          <div className="scope-add">
            {lineForm(draft, setDraft, 'add')}
            <div className="scope-actions">
              <button type="button" className="sdm-btn sdm-btn-outline" onClick={() => { setAdding(false); setDraft(EMPTY); }} disabled={saving}>Cancel</button>
              <button
                type="button" className="sdm-btn sdm-btn-primary" disabled={saving}
                onClick={() => run(() => addScopeLine(booking.bookingId, draft), () => { setAdding(false); setDraft(EMPTY); })}
              >Add line</button>
            </div>
          </div>
        ) : (
          <button type="button" className="sdm-btn sdm-btn-outline" onClick={() => { setAdding(true); chooseKind(setDraft, EMPTY, booking.service?.serviceType === 'Installation' ? 'dismantling' : 'installation'); }}>+ Add line</button>
        )
      ) : (
        <p className="sdm-muted">The scope of works can only be changed while a booking is Pending, Approved or In Progress.</p>
      )}
    </section>
  );
}

export default ScopeOfWorksEditor;

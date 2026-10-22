import { useEffect, useState } from 'react';
import { listSuppliedUnits, resolveUnitRequest } from '../services/suppliedUnitService';
import { attempt } from '../services/apiClient';
import { formatPeso } from '../utils/bookingPricing';
import { matchingUnits, unitLabel } from '../utils/suppliedUnitChoice';
import { BOOKING_STATUS } from '../constants/bookingStatus';

// "Unit needs owner confirmation": the unit entries of a booking where the customer asked for a unit that is not in the catalog. The owner
// settles each one here: pick a catalog unit that fits, enter a unit price with a short note, or decline with a reason. Until every request
// is settled the booking cannot be approved. The customer is told in the app. The server enforces all of it.
function UnitRequestPanel({ booking, onUpdated }) {
  const entries = (booking.units || []).map((unit, index) => ({ unit, index })).filter(({ unit }) => unit.supplied?.source === 'requested');
  const [catalog, setCatalog] = useState([]);
  const [open, setOpen] = useState(null); // { index, mode: 'catalog' | 'price' | 'decline', catalogId, price, note, reason }
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (entries.length === 0) return undefined;
    let cancelled = false;
    listSuppliedUnits().then((items) => { if (!cancelled) setCatalog(Array.isArray(items) ? items : []); }).catch(() => {});
    return () => { cancelled = true; };
  }, [entries.length]);

  if (entries.length === 0) return null;
  const canSettle = booking.status === BOOKING_STATUS.PENDING;

  const settle = async (index, body) => {
    setSaving(true);
    setError('');
    try {
      const result = await attempt(resolveUnitRequest(booking.bookingId, index, body), 'Could not save.');
      if (result.error) { setError(result.error); return; }
      setOpen(null);
      onUpdated?.(result.data);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="unit-request-panel" aria-label="Unit needs owner confirmation">
      <h5 className="sdm-col-heading">UNIT NEEDS OWNER CONFIRMATION</h5>
      {entries.map(({ unit, index }) => {
        const s = unit.supplied;
        const request = s.request || {};
        const declined = s.status === 'Declined';
        const fits = catalog.filter((c) => matchingUnits([c], unit).length > 0);
        return (
          <div key={index} className="unit-request">
            <p className="unit-request-title">
              {unit.quantity}× {unit.type}{unit.hp ? `, ${unit.hp} HP` : ''}
              <span className={`unit-request-flag${declined ? ' is-declined' : ''}`}>{declined ? 'Declined' : 'Needs confirmation'}</span>
            </p>
            <p className="sdm-muted">
              Customer asked for: {request.brand || 'no brand given'}{request.notes ? `. Notes: ${request.notes}` : ''}
            </p>
            {declined && <p className="sdm-muted">Declined: {s.declineReason}</p>}

            {canSettle && open?.index !== index && (
              <div className="scope-actions">
                <button type="button" className="sdm-btn sdm-btn-outline" onClick={() => setOpen({ index, mode: 'catalog', catalogId: '', price: '', note: '', reason: '' })}>Settle this request</button>
              </div>
            )}

            {open?.index === index && (
              <div className="unit-request-form">
                <div className="time-toggle" role="group" aria-label="How to settle it">
                  {[['catalog', 'Pick a catalog unit'], ['price', 'Enter a unit price'], ['decline', 'Decline']].map(([mode, label]) => (
                    <button key={mode} type="button" className={`time-btn ${open.mode === mode ? 'selected' : ''}`} onClick={() => setOpen({ ...open, mode })}>{label}</button>
                  ))}
                </div>
                {open.mode === 'catalog' && (
                  fits.length === 0 ? (
                    <p className="sdm-muted">No active catalog unit matches {unit.type} at {unit.hp || '?'} HP. Enter a unit price instead, or decline.</p>
                  ) : (
                    <label className="scope-form-wide">
                      Catalog unit
                      <select className="ma-input" value={open.catalogId} onChange={(e) => setOpen({ ...open, catalogId: e.target.value })}>
                        <option value="">Choose a unit</option>
                        {fits.map((c) => <option key={c._id} value={c._id}>{unitLabel(c)}, {formatPeso(c.price)} each</option>)}
                      </select>
                    </label>
                  )
                )}
                {open.mode === 'price' && (
                  <div className="scope-form">
                    <label>
                      Price of one unit (₱)
                      <input className="ma-input" type="number" min="0" step="any" value={open.price} onChange={(e) => setOpen({ ...open, price: e.target.value })} />
                    </label>
                    <label className="scope-form-wide">
                      Short note about this price (required)
                      <input className="ma-input" type="text" maxLength={200} value={open.note} onChange={(e) => setOpen({ ...open, note: e.target.value })} />
                    </label>
                  </div>
                )}
                {open.mode === 'decline' && (
                  <label className="scope-form-wide">
                    Reason for declining (the customer is told)
                    <input className="ma-input" type="text" maxLength={200} value={open.reason} onChange={(e) => setOpen({ ...open, reason: e.target.value })} />
                  </label>
                )}
                <div className="scope-actions">
                  <button type="button" className="sdm-btn sdm-btn-outline" onClick={() => setOpen(null)} disabled={saving}>Cancel</button>
                  <button
                    type="button" className={`sdm-btn ${open.mode === 'decline' ? 'sdm-btn-danger' : 'sdm-btn-primary'}`} disabled={saving}
                    onClick={() => settle(index, open.mode === 'catalog' ? { catalogId: open.catalogId }
                      : open.mode === 'price' ? { price: open.price, note: open.note } : { decline: true, reason: open.reason })}
                  >{open.mode === 'decline' ? 'Decline request' : 'Confirm'}</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {error && <p className="ma-form-error" role="alert">{error}</p>}
    </section>
  );
}

export default UnitRequestPanel;

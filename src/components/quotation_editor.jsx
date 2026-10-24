import { useState } from 'react';
import { updateQuotation } from '../services/bookingService';
import { attempt } from '../services/apiClient';
import { BOOKING_STATUS } from '../constants/bookingStatus';
import { SERVICE_TYPE } from '../constants/serviceTypes';
import { formatDays, formatMonths } from '../utils/quotationTerms';

const OPEN = [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS];

const draftOf = (booking) => {
  const t = booking.quotationTerms;
  return {
    daysMin: t?.estimatedDays ? String(t.estimatedDays.min) : '',
    daysMax: t?.estimatedDays ? String(t.estimatedDays.max) : '',
    exclusions: (t?.exclusions || []).join('\n'),
    warrantyMonths: t?.warranty?.workmanshipCustom ? String(t.warranty.workmanshipMonths) : '',
    unitWarrantyText: t?.warranty?.unitTextCustom ? t.warranty.unitText : '',
    taxInclusive: !!booking.taxInclusive,
    building: booking.site?.building || '',
    floorRoom: booking.site?.floorRoom || '',
    attention: booking.site?.attention || '',
  };
};

// The admin's quotation details for one booking: the estimated duration, what the price does not cover, the warranty terms, whether the
// quoted prices already include VAT, and the site details. An installation has them all; any other booking only has the site details.
// A warranty box left empty keeps the standard terms. Every change is recorded in the audit log and a change to the terms is told to the
// customer. The server checks everything; this only fills the form in.
function QuotationEditor({ booking, onUpdated }) {
  const isInstallation = booking.service?.serviceType === SERVICE_TYPE.INSTALLATION;
  const terms = booking.quotationTerms;
  const canEdit = OPEN.includes(booking.status) && !booking.isBackJob;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => draftOf(booking));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (booking.isBackJob) return null;

  const save = async () => {
    const body = { site: { building: draft.building, floorRoom: draft.floorRoom, attention: draft.attention } };
    if (isInstallation) {
      body.estimatedDays = draft.daysMin === '' ? null : { min: Number(draft.daysMin), max: draft.daysMax === '' ? Number(draft.daysMin) : Number(draft.daysMax) };
      body.exclusions = draft.exclusions.split('\n').map((l) => l.trim()).filter(Boolean);
      body.warrantyMonths = draft.warrantyMonths === '' ? null : Number(draft.warrantyMonths);
      body.unitWarrantyText = draft.unitWarrantyText.trim() === '' ? null : draft.unitWarrantyText;
      body.taxInclusive = draft.taxInclusive;
    }
    setSaving(true);
    setError('');
    try {
      const result = await attempt(updateQuotation(booking.bookingId, body), 'Could not save the quotation details.');
      if (result.error) { setError(result.error); return; }
      onUpdated?.(result.data);
      setEditing(false);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const set = (field) => (e) => setDraft({ ...draft, [field]: e.target.value });
  const siteText = [booking.site?.building, booking.site?.floorRoom, booking.site?.attention && `Attention: ${booking.site.attention}`].filter(Boolean).join(' / ');

  return (
    <section className="scope-editor" aria-label="Quotation details">
      <h5 className="sdm-col-heading">QUOTATION DETAILS</h5>

      {!editing ? (
        <>
          <ul className="quotation-summary">
            {isInstallation && <li><strong>Estimated time:</strong> {formatDays(terms?.estimatedDays) || 'Not set'}</li>}
            {isInstallation && <li><strong>Not included:</strong> {terms?.exclusions ? terms.exclusions.join(', ') : 'Not set'}</li>}
            {isInstallation && terms && (
              <li>
                <strong>Warranty:</strong> workmanship {formatMonths(terms.warranty.workmanshipMonths)}{terms.warranty.workmanshipCustom ? ' (set for this booking)' : ' (standard)'}
                {terms.warranty.unitText ? `; unit: ${terms.warranty.unitText}${terms.warranty.unitTextCustom ? ' (set for this booking)' : ''}` : '; no unit warranty (own unit)'}
              </li>
            )}
            {isInstallation && <li><strong>Prices:</strong> {booking.taxInclusive ? 'include VAT' : booking.isCommercial ? 'VAT (12%) is added on top' : 'no VAT charged'}</li>}
            <li><strong>Site:</strong> {siteText || 'Not given'}</li>
          </ul>
          {canEdit && <button type="button" className="sdm-btn sdm-btn-outline" onClick={() => { setDraft(draftOf(booking)); setEditing(true); }}>Edit quotation details</button>}
        </>
      ) : (
        <div className="scope-add">
          {isInstallation && (
            <div className="scope-form">
              <label>
                Estimated days, from
                <input className="ma-input" type="number" min="1" max="30" value={draft.daysMin} onChange={set('daysMin')} />
              </label>
              <label>
                to (optional)
                <input className="ma-input" type="number" min="1" max="30" value={draft.daysMax} onChange={set('daysMax')} />
              </label>
              <label className="scope-form-wide">
                Not included in the price (one per line)
                <textarea className="bs-textarea" rows={4} value={draft.exclusions} onChange={set('exclusions')} />
              </label>
              <label>
                Workmanship warranty (months)
                <input className="ma-input" type="number" min="0" max="120" placeholder="Standard" value={draft.warrantyMonths} onChange={set('warrantyMonths')} />
              </label>
              {!booking.clientSuppliedUnit && (
                <label className="scope-form-wide">
                  Unit warranty text (empty keeps the standard)
                  <input className="ma-input" type="text" maxLength={200} value={draft.unitWarrantyText} onChange={set('unitWarrantyText')} />
                </label>
              )}
              <label className="scope-form-wide quotation-check">
                <input type="checkbox" checked={draft.taxInclusive} onChange={(e) => setDraft({ ...draft, taxInclusive: e.target.checked })} />
                The quoted prices already include VAT
              </label>
            </div>
          )}
          <div className="scope-form">
            <label>
              Building
              <input className="ma-input" type="text" maxLength={100} value={draft.building} onChange={set('building')} />
            </label>
            <label>
              Floor or room
              <input className="ma-input" type="text" maxLength={100} value={draft.floorRoom} onChange={set('floorRoom')} />
            </label>
            <label>
              Attention
              <input className="ma-input" type="text" maxLength={100} value={draft.attention} onChange={set('attention')} />
            </label>
          </div>
          {error && <p className="ma-form-error" role="alert">{error}</p>}
          <div className="scope-actions">
            <button type="button" className="sdm-btn sdm-btn-outline" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
            <button type="button" className="sdm-btn sdm-btn-primary" onClick={save} disabled={saving}>Save</button>
          </div>
        </div>
      )}
    </section>
  );
}

export default QuotationEditor;

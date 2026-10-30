import { useState } from 'react';
import { confirmUnit } from '../services/suppliedUnitService';
import { attempt } from '../services/apiClient';
import { BOOKING_STATUS } from '../constants/bookingStatus';
import { formatPeso, getPaymentBreakdown } from '../utils/bookingPricing';

// "Confirm unit": on a Pending Installation where the company supplies the unit, the customer is not asked to pay until the owner says the
// unit is available. A unit the customer asked for that is not in the catalog is confirmed by settling the request instead (the panel above),
// so this shows only once every request is settled. Admin only; the server enforces all of it.
function ConfirmUnitPanel({ booking, onUpdated }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const openRequest = (booking.units || []).some((u) => u.supplied?.source === 'requested' && ['Pending', 'Declined'].includes(u.supplied?.status));
  if (booking.status !== BOOKING_STATUS.PENDING || !booking.awaitingUnitConfirmation || openRequest || booking.unitDecline?.reason) return null;

  const downPayment = getPaymentBreakdown(booking).downPayment;

  const confirm = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await attempt(confirmUnit(booking.bookingId), 'Could not confirm the unit.');
      if (result.error) { setError(result.error); return; }
      onUpdated?.(result.data);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="cannot-supply-panel" aria-label="Confirm the unit">
      <p className="cannot-supply-title">Waiting for you to confirm the unit</p>
      <p className="sdm-muted">
        The customer is not asked to pay until you confirm that the unit is available. Confirming asks them for the down payment
        {downPayment > 0 ? ` of ${formatPeso(downPayment)}` : ''}, in the app and by email.
      </p>
      <button type="button" className="sdm-btn sdm-btn-primary" onClick={confirm} disabled={saving}>
        {saving ? 'Confirming...' : 'Confirm unit'}
      </button>
      {error && <p className="sdm-error" role="alert">{error}</p>}
    </section>
  );
}

export default ConfirmUnitPanel;

import { useState, useEffect } from 'react';
import { FiPlus, FiTrash2 } from 'react-icons/fi';
import { usePaymentSettings } from '../utils/paymentSettings';
import { attempt } from '../services/apiClient';
import { updatePaymentSettings } from '../services/paymentSettingsService';
import PaymentSettingsUnavailable from './payment_settings_unavailable';
import { BRAND_NAME } from '../config/company';


// Admin editor for the System Configuration Module's payment settings - payment
// methods (each with its own free-form account-detail label/value pairs, shown
// to the customer during checkout) and down payment percentage options. Both
// used to be hardcoded constants in book_service.jsx; this is what the booking
// flows now read from instead (see src/utils/paymentSettings.js).
function PaymentSettingsPanel() {
  const { paymentMethods, downPaymentPercentages, seniorPwdDiscountPercent, loading, ready, refetch } = usePaymentSettings();
  const [methods, setMethods] = useState([]);
  const [percentages, setPercentages] = useState([]);
  const [discountPercent, setDiscountPercent] = useState('20');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Sync the editable draft from the fetched settings once they arrive - not on
  // every render, so the admin's in-progress edits aren't clobbered by a stray refetch.
  useEffect(() => {
    if (!loading) {
      setMethods(paymentMethods.map((m) => ({ ...m, accountDetails: m.accountDetails.map((d) => ({ ...d })) })));
      setPercentages(downPaymentPercentages.slice());
      if (seniorPwdDiscountPercent !== null) setDiscountPercent(String(seniorPwdDiscountPercent));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  function addMethod() {
    setMethods((prev) => [...prev, { name: '', accountDetails: [] }]);
  }

  function removeMethod(index) {
    setMethods((prev) => prev.filter((_, i) => i !== index));
  }

  function updateMethodName(index, name) {
    setMethods((prev) => prev.map((m, i) => (i === index ? { ...m, name } : m)));
  }

  function addDetail(methodIndex) {
    setMethods((prev) => prev.map((m, i) =>
      i === methodIndex ? { ...m, accountDetails: [...m.accountDetails, { label: '', value: '' }] } : m
    ));
  }

  function updateDetail(methodIndex, detailIndex, field, value) {
    setMethods((prev) => prev.map((m, i) => {
      if (i !== methodIndex) return m;
      const accountDetails = m.accountDetails.map((d, j) => (j === detailIndex ? { ...d, [field]: value } : d));
      return { ...m, accountDetails };
    }));
  }

  function removeDetail(methodIndex, detailIndex) {
    setMethods((prev) => prev.map((m, i) =>
      i === methodIndex ? { ...m, accountDetails: m.accountDetails.filter((_, j) => j !== detailIndex) } : m
    ));
  }

  function addPercentage() {
    setPercentages((prev) => [...prev, '']);
  }

  function updatePercentage(index, value) {
    setPercentages((prev) => prev.map((p, i) => (i === index ? value : p)));
  }

  function removePercentage(index) {
    setPercentages((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setError('');
    setSuccess(false);

    if (methods.length === 0) {
      setError('At least one payment method is required.');
      return;
    }
    if (methods.some((m) => !m.name.trim())) {
      setError('Every payment method needs a name.');
      return;
    }
    if (discountPercent === '' || isNaN(discountPercent) || Number(discountPercent) < 0 || Number(discountPercent) > 100) {
      setError('The Senior/PWD discount must be a number from 0 to 100.');
      return;
    }
    if (percentages.length === 0) {
      setError('At least one down payment percentage is required.');
      return;
    }
    if (percentages.some((p) => p === '' || isNaN(p) || Number(p) <= 0 || Number(p) > 100)) {
      setError('Down payment percentages must be numbers greater than 0 and no more than 100.');
      return;
    }

    setSaving(true);
    try {
      const saved = await attempt(
        updatePaymentSettings({
          paymentMethods: methods.map((m) => ({
            name: m.name.trim(),
            accountDetails: m.accountDetails
              .map((d) => ({ label: d.label.trim(), value: d.value.trim() }))
              .filter((d) => d.label && d.value),
          })),
          downPaymentPercentages: percentages.map(Number),
          seniorPwdDiscountPercent: Number(discountPercent),
        }),
        'Failed to save payment settings.'
      );
      if (saved.error) {
        setError(saved.error);
        return;
      }

      await refetch();
      setSuccess(true);
    } catch {
      setError('Could not connect to the server.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="svc-empty">Loading payment settings...</p>;
  }

  // Never show an editor full of defaults: saving them would overwrite the real settings.
  if (!ready) {
    return <PaymentSettingsUnavailable onRetry={refetch} />;
  }

  return (
    <div className="pset-panel">
      {error && <p className="ma-form-error">{error}</p>}
      {success && <p className="ma-success-banner">Payment settings saved.</p>}

      <div className="pset-section">
        <div className="pset-section-header">
          <h3 className="bs-card-title">Payment Methods</h3>
          <button type="button" className="svc-btn svc-btn-ghost" onClick={addMethod}>
            <FiPlus /> Add Payment Method
          </button>
        </div>
        <p className="bs-card-sub">
          Add the account details a customer should see when they pick this method (e.g. GCash number,
          bank name and account number). Leave a method with no details for something paid in person
          (Cash) or that needs nothing shown up front (Cheque).
        </p>

        {methods.map((method, mIndex) => (
          <div className="pset-method-card" key={mIndex}>
            <div className="pset-method-header">
              <input
                type="text"
                className="pset-input pset-method-name"
                placeholder="Method name (e.g. GCash)"
                aria-label="Payment method name"
                value={method.name}
                onChange={(e) => updateMethodName(mIndex, e.target.value)}
              />
              <button
                type="button"
                className="svc-btn svc-btn-danger pset-icon-btn"
                onClick={() => removeMethod(mIndex)}
                aria-label={`Remove ${method.name || 'payment method'}`}
              >
                <FiTrash2 />
              </button>
            </div>

            {method.accountDetails.map((detail, dIndex) => (
              <div className="pset-detail-row" key={dIndex}>
                <input
                  type="text"
                  className="pset-input"
                  placeholder="Label (e.g. Account Name)"
                  aria-label={`Detail label for ${method.name || 'this method'}`}
                  value={detail.label}
                  onChange={(e) => updateDetail(mIndex, dIndex, 'label', e.target.value)}
                />
                <input
                  type="text"
                  className="pset-input"
                  placeholder={`Value (e.g. ${BRAND_NAME})`}
                  aria-label={`Detail value for ${method.name || 'this method'}`}
                  value={detail.value}
                  onChange={(e) => updateDetail(mIndex, dIndex, 'value', e.target.value)}
                />
                <button
                  type="button"
                  className="pset-remove-detail-btn"
                  onClick={() => removeDetail(mIndex, dIndex)}
                  aria-label="Remove detail"
                >
                  <FiTrash2 />
                </button>
              </div>
            ))}

            <button type="button" className="pset-add-detail-btn" onClick={() => addDetail(mIndex)}>
              <FiPlus /> Add Detail
            </button>
          </div>
        ))}
      </div>

      <div className="pset-section">
        <div className="pset-section-header">
          <h3 className="bs-card-title">Down Payment Percentages</h3>
          <button type="button" className="svc-btn svc-btn-ghost" onClick={addPercentage}>
            <FiPlus /> Add Percentage
          </button>
        </div>
        <p className="bs-card-sub">
          Shown to customers as down payment choices at booking. 100% means full payment upfront.
          A Return Customer's own "No Down Payment" perk is separate and always shown to them
          regardless of this list.
        </p>

        <div className="pset-percent-list">
          {percentages.map((p, i) => (
            <div className="pset-percent-row" key={i}>
              <input
                type="number"
                className="pset-input pset-percent-input"
                aria-label={`Down payment option ${i + 1}, percent`}
                min="1"
                max="100"
                value={p}
                onChange={(e) => updatePercentage(i, e.target.value)}
              />
              <span>%</span>
              <button
                type="button"
                className="pset-remove-detail-btn"
                onClick={() => removePercentage(i)}
                aria-label="Remove percentage"
              >
                <FiTrash2 />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="pset-section">
        <div className="pset-section-header">
          <h3 className="bs-card-title">Senior Citizen / PWD Discount</h3>
        </div>
        <p className="bs-card-sub">
          Percentage taken off the unit price (not off distance or mobilization charges) once an
          admin approves a customer's discount request. <strong>Confirm the correct rate with the owner.</strong>
        </p>
        <div className="pset-percent-list">
          <div className="pset-percent-row">
            <input
              type="number"
              className="pset-input pset-percent-input"
              min="0"
              max="100"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              aria-label="Senior and PWD discount percentage"
            />
            <span>%</span>
          </div>
        </div>
      </div>

      <div className="pset-save-row">
        <button type="button" className="svc-btn svc-btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

export default PaymentSettingsPanel;

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerLayout from './customer_layout';
import PaymentModal from '../../components/payment_modal';
import { getUnitPrice } from '../../utils/bookingPricing';
import { toLocalDateKey } from '../../utils/date';
import { usePaymentSettings, getDownPaymentOptions } from '../../utils/paymentSettings';
import {
  FiWind,
  FiTool,
  FiThermometer,
  FiSettings,
  FiCheck,
  FiSunrise,
  FiSunset,
  FiClock,
  FiArrowLeft,
  FiArrowRight,
  FiPlus,
  FiX,
} from 'react-icons/fi';

const ICON_MAP = {
  FiWind: <FiWind />,
  FiTool: <FiTool />,
  FiThermometer: <FiThermometer />,
  FiSettings: <FiSettings />,
};

export function useServices() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch('http://localhost:5000/api/services', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const mapped = data.map((s) => ({
          id: s._id,
          label: s.name,
          desc: s.description,
          price: s.price,
          icon: ICON_MAP[s.icon] || <FiSettings />,
          serviceType: s.serviceType,
          unitTypePricing: s.unitTypePricing || [],
        }));
        setServices(mapped);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { services, loading };
}

export function useTechnicians() {
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:5000/api/auth/technicians')
      .then((res) => res.json())
      .then((data) => {
        setTechnicians(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { technicians, loading };
}

export const UNIT_TYPES = ['Window Type', 'Split Type', 'Floor Mounted', 'Cassette Type', 'Portable'];

// System Configuration Module: payment methods and down payment percentages used
// to be hardcoded here (DOWN_PAYMENT_OPTIONS / PAYMENT_MODES / getDownPaymentOptions).
// Both are now admin-managed — see src/utils/paymentSettings.js (usePaymentSettings,
// getDownPaymentOptions) and the Payment Settings tab in admin's Manage Services page.

// Fetches the logged-in customer's own classification (Customer Classification Module)
export function useMyClassification() {
  const [classification, setClassification] = useState('Regular');

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch('http://localhost:5000/api/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setClassification(data.classification || 'Regular'))
      .catch(() => {});
  }, []);

  return classification;
}

const TOTAL_STEPS = 5;

/* ── Helpers ───────────────────────────────────────────────── */
function generateBookingId() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CZ-${year}-${rand}`;
}

// Shared cost breakdown math — used by Step2 (per-row price preview), Step4,
// and Step5. Itemizes each unit entry (type × quantity, at that type's price)
// instead of assuming one flat price for the whole booking.
export function getCostBreakdown(form, services) {
  const selected = services.find((s) => s.id === form.service);
  const units = form.units || [];

  const lineItems = units.map((u) => {
    const unitPrice = getUnitPrice(selected, u.type);
    return { ...u, unitPrice, subtotal: unitPrice * (u.quantity || 0) };
  });

  const basePrice = lineItems.reduce((sum, li) => sum + li.subtotal, 0);
  const dpPercent = form.downPaymentPercent ?? 10;
  const toPayNow = Math.round(basePrice * (dpPercent / 100));
  const remaining = basePrice - toPayNow;
  const isFullPay = dpPercent === 100;
  return { selected, lineItems, basePrice, dpPercent, toPayNow, remaining, isFullPay };
}

/* ── Step Indicator ───────────────────────────────────────── */
export function StepIndicator({ current, total = TOTAL_STEPS }) {
  return (
    <div className="step-indicator">
      {Array.from({ length: total }, (_, i) => {
        const num = i + 1;
        const isCompleted = num < current;
        const isActive = num === current;
        return (
          <div key={num} className="step-indicator-item">
            <div className={`step-dot ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
              {isCompleted ? <FiCheck /> : num}
            </div>
            {num < total && (
              <div className={`step-line ${isCompleted ? 'completed' : ''}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Step 1: Choose a Service ─────────────────────────────── */
export function Step1({ form, setForm, services }) {
  return (
    <div className="bs-card">
      <h3 className="bs-card-title">Choose a Service</h3>
      <p className="bs-card-sub">Base price only. Final cost may vary depending on the scope of work and materials needed.</p>
      <div className="service-grid">
        {services.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`service-option ${form.service === s.id ? 'selected' : ''}`}
            onClick={() => setForm({
              ...form,
              service: s.id,
              // A different service may not be Installation at all, or may need
              // the unit-source question re-asked — don't carry stale answers over.
              clientSuppliedUnit: false,
              unitWaiverAcknowledged: false,
              unitWaiverName: '',
            })}
          >
            <div className="service-option-left">
              <span className="service-icon">{s.icon}</span>
              <div>
                <p className="service-name">{s.label}</p>
                <p className="service-desc">{s.desc}</p>
              </div>
            </div>
            <span className="service-price">₱{s.price.toLocaleString()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Step 2: Unit Details ─────────────────────────────────── */
const EMPTY_UNIT_ENTRY = { type: '', quantity: 1, brandModel: '' };

export function Step2({ form, setForm, services = [] }) {
  // Multi-Unit Booking Redesign: a booking now lists one or more unit entries
  // (type + quantity + its own brand/model), replacing the old flat
  // "select all that apply" type checklist with no quantity and one bulk
  // brand/model text field for the whole booking.
  const units = form.units && form.units.length > 0 ? form.units : [EMPTY_UNIT_ENTRY];
  const selectedService = services.find((s) => s.id === form.service);

  const updateUnit = (index, patch) => {
    const updated = units.map((u, i) => (i === index ? { ...u, ...patch } : u));
    setForm({ ...form, units: updated });
  };

  const addUnit = () => {
    setForm({ ...form, units: [...units, { ...EMPTY_UNIT_ENTRY }] });
  };

  const removeUnit = (index) => {
    const updated = units.filter((_, i) => i !== index);
    setForm({ ...form, units: updated.length > 0 ? updated : [{ ...EMPTY_UNIT_ENTRY }] });
  };

  const isInstallation = selectedService?.serviceType === 'Installation';

  const setClientSuppliedUnit = (clientSupplied) => {
    setForm({
      ...form,
      clientSuppliedUnit: clientSupplied,
      unitWaiverAcknowledged: false,
      unitWaiverName: '',
    });
  };

  return (
    <div className="bs-card">
      <h3 className="bs-card-title">Unit Details</h3>
      <p className="bs-card-sub">Add each aircon unit this booking covers, with its type and quantity.</p>

      <div className="bs-field-group">
        <label className="bs-label">Units</label>
        <div className="unit-entry-list">
          {units.map((unit, index) => (
            <div className="unit-entry-row" key={index}>
              <select
                className="bs-select unit-entry-type"
                value={unit.type}
                onChange={(e) => updateUnit(index, { type: e.target.value })}
              >
                <option value="">Select type</option>
                {UNIT_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>

              <input
                type="number"
                className="bs-input unit-entry-qty"
                min="1"
                value={unit.quantity}
                onChange={(e) => updateUnit(index, { quantity: Number(e.target.value) || 1 })}
              />

              <input
                type="text"
                className="bs-input unit-entry-brand"
                placeholder="Brand & model (e.g. Carrier 1HP)"
                value={unit.brandModel}
                onChange={(e) => updateUnit(index, { brandModel: e.target.value })}
              />

              {selectedService && unit.type && (
                <span className="unit-entry-subtotal">
                  ₱{(getUnitPrice(selectedService, unit.type) * (unit.quantity || 0)).toLocaleString()}
                </span>
              )}

              <button
                type="button"
                className="unit-entry-remove"
                onClick={() => removeUnit(index)}
                disabled={units.length === 1}
                aria-label="Remove unit"
              >
                <FiX />
              </button>
            </div>
          ))}
        </div>

        <button type="button" className="unit-entry-add-btn" onClick={addUnit}>
          <FiPlus /> Add Another Unit
        </button>
      </div>

      {isInstallation && (
        <div className="bs-field-group">
          <label className="bs-label">Unit Source</label>
          <div className="time-toggle">
            <button
              type="button"
              className={`time-btn ${!form.clientSuppliedUnit ? 'selected' : ''}`}
              onClick={() => setClientSuppliedUnit(false)}
            >
              CZA-Supplied Unit
            </button>
            <button
              type="button"
              className={`time-btn ${form.clientSuppliedUnit ? 'selected' : ''}`}
              onClick={() => setClientSuppliedUnit(true)}
            >
              My Own Unit
            </button>
          </div>
        </div>
      )}

      {isInstallation && form.clientSuppliedUnit && (
        <div className="bs-field-group waiver-box">
          <label className="bs-label">Unit Warranty Waiver</label>
          <p className="bs-card-sub">
            Since this unit wasn't purchased through Cooling Zone, our Unit Warranty (compressor
            and parts coverage) does not apply to it. Installation workmanship is still covered
            for 3 months.
          </p>
          <label className="waiver-checkbox-label">
            <input
              type="checkbox"
              checked={form.unitWaiverAcknowledged || false}
              onChange={(e) => setForm({ ...form, unitWaiverAcknowledged: e.target.checked })}
            />
            I confirm this unit was not purchased through Cooling Zone Aircon Services, and
            understand the Unit Warranty does not apply to it.
          </label>
          <input
            type="text"
            className="bs-input"
            placeholder="Type your full name to confirm"
            value={form.unitWaiverName || ''}
            onChange={(e) => setForm({ ...form, unitWaiverName: e.target.value })}
          />
        </div>
      )}

      <div className="bs-field-group">
        <label className="bs-label">Problem Description <span className="bs-label-hint">(Optional)</span></label>
        <textarea
          className="bs-textarea"
          rows={2}
          placeholder="e.g. The aircon is not cooling, makes rattling noise"
          value={form.problemDescription || ''}
          onChange={(e) => setForm({ ...form, problemDescription: e.target.value })}
        />
      </div>
    </div>
  );
}

/* ── Step 3: Location & Schedule ──────────────────────────── */
export function Step3({ form, setForm, technicians }) {
  const minDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return toLocalDateKey(d); // YYYY-MM-DD for <input type="date">
  })();

   return (
    <div className="bs-card">
      <h3 className="bs-card-title">Location &amp; Schedule</h3>
      <p className="bs-card-sub">When and where should we send our technician?</p>


      <div className="bs-two-col">
        <div className="bs-field-group">
          <label className="bs-label">Date &amp; Time</label>
          <input
            type="date"
            className="bs-input"
            min={minDate}
            value={form.date || ''}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
          <p style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '4px' }}>
            Earliest available date is {new Date(minDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
          </p>
        </div>

        <div className="bs-field-group">
          <label className="bs-label">Time</label>
          <div className="time-toggle">
            {['Morning', 'Afternoon'].map((t) => (
              <button
                key={t}
                type="button"
                className={`time-btn ${form.time === t ? 'selected' : ''}`}
                onClick={() => setForm({ ...form, time: t })}
              >
                {t === 'Morning' ? <FiSunrise /> : <FiSunset />} {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bs-field-group">
        <label className="bs-label">Preferred Technician <span className="bs-label-hint">(Optional)</span></label>
        <select
          className="bs-select"
          value={form.technician || ''}
          onChange={(e) => setForm({ ...form, technician: e.target.value })}
        >
          <option value="">No preference</option>
          {technicians.map((t) => (
            <option key={t._id} value={t._id}>{t.name}</option>
          ))}
        </select>
      </div>

      <div className="bs-field-group">
        <label className="bs-label">Address</label>
        <input
          type="text"
          className="bs-input"
          placeholder="House No., Street, Barangay, City"
          value={form.address || ''}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
      </div>
    </div>
  );
}

/* ── Step 4: Payment ──────────────────────────────────────── */
function Step4({ form, setForm, services, isReturnCustomer, paymentMethods, downPaymentPercentages }) {
  const [showModal, setShowModal] = useState(false);
  const { lineItems, basePrice, dpPercent, toPayNow, remaining, isFullPay } = getCostBreakdown(form, services);
  const isNoDownPayment = dpPercent === 0;
  // The very first, remote payment can't reasonably be Cash or Cheque — both need
  // a physical handoff that hasn't happened yet at this point in the flow.
  // Everything else the admin has configured (GCash, Bank Transfer, ...) is fair game.
  const firstPaymentMethods = paymentMethods.filter((m) => !['Cash', 'Cheque'].includes(m.name));

const handleSubmitPayment = ({ proof }) => {
    setForm({ ...form, paymentStatus: 'to_verify', proofFile: proof?.name || null, proofFileObj: proof || null });
    setShowModal(false);
  };

  return (
    <>
      {showModal && (
        <PaymentModal
          form={{
            ...form,
            basePrice,
            lineItems,
            downPaymentPercent: dpPercent,
            toPayNow,
            remaining,
          }}
          paymentMethods={paymentMethods}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmitPayment}
        />
      )}

      <div className="bs-step4-layout">

        {/* ── Left: Payment form ── */}
        <div className="bs-card bs-step4-left">
          <h3 className="bs-card-title">Payment</h3>
          <p className="bs-card-sub">Choose payment option.</p>

          {/* Down Payment — 2×2 radio grid (return customers get an extra 0% option) */}
          <div className="bs-field-group">
            <label className="bs-label">Down Payment</label>
            <div className="dp-radio-grid">
              {getDownPaymentOptions(isReturnCustomer, downPaymentPercentages).map((opt) => (
                <label key={opt.value} className="dp-radio-label">
                  <input
                    type="radio"
                    name="downPayment"
                    value={opt.value}
                    checked={dpPercent === opt.value}
                    onChange={() =>
                      setForm({ ...form, downPaymentPercent: opt.value, paymentMode: '', paymentMode2: '' })
                    }
                    className="dp-radio-input"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Nothing is due right now for a 0% down payment — no payment mode or
              proof to collect until the customer settles the balance later. */}
          {!isNoDownPayment && (
            <>
              {/* Mode of Payment */}
              <div className="bs-field-group">
                <label className="bs-label">Mode of Payment</label>
                <select
                  className="bs-select"
                  value={form.paymentMode || ''}
                  onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}
                >
                  <option value="">Select mode</option>
                  {firstPaymentMethods.map((m) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* Mode for 2nd Payment — hidden when Full Payment */}
              {!isFullPay && (
                <div className="bs-field-group">
                  <label className="bs-label">Mode for 2nd Payment</label>
                  <select
                    className="bs-select"
                    value={form.paymentMode2 || ''}
                    onChange={(e) => setForm({ ...form, paymentMode2: e.target.value })}
                  >
                    <option value="">Select mode</option>
                    {paymentMethods.map((m) => (
                      <option key={m.name} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Right: Cost Breakdown ── */}
        <div className="cost-breakdown-card">
          <h4 className="cost-breakdown-title">Cost Breakdown</h4>

          {lineItems.map((li, i) => (
            <div className="cost-row cost-row-item" key={i}>
              <span>{li.type || '—'} × {li.quantity}</span>
              <span>₱{li.subtotal.toLocaleString()}.00</span>
            </div>
          ))}
          <div className="cost-divider" />

          <div className="cost-row"><span>Total Price</span><span>₱{basePrice.toLocaleString()}.00</span></div>
          <div className="cost-row"><span>Down Payment</span><span>{dpPercent}%</span></div>
          <div className="cost-row"><span>To Pay Now</span><span>₱{toPayNow.toLocaleString()}.00</span></div>
          <div className="cost-row"><span>Remaining Balance</span><span>₱{remaining.toLocaleString()}.00</span></div>

          <div className="cost-divider" />

          {isNoDownPayment ? (
            <p style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '10px', textAlign: 'center' }}>
              As a return customer, no down payment is required. The full amount will be due upon completion of service.
            </p>
          ) : (
            <>
              <div className="cost-row">
                <span>Payment Status</span>
                <span className={form.paymentStatus === 'Paid' ? 'cost-status-paid' : 'cost-status-unpaid'}>
                  {form.paymentStatus || 'Unpaid'}
                </span>
              </div>
              <div className="cost-row">
                <span>Proof of Payment</span>
                <span className="cost-link">{form.proofFile || '—'}</span>
              </div>

              <button
                className="pay-down-btn"
                onClick={() => setShowModal(true)}
                disabled={!form.paymentMode}
              >
                Pay Downpayment
              </button>

              {form.paymentStatus !== 'Paid' && (
                <p style={{ fontSize: '12px', color: '#e05a5a', marginTop: '10px', textAlign: 'center' }}>
                  Please complete payment and upload proof before continuing.
                </p>
              )}
            </>
          )}

        </div>

      </div>
    </>
  );
}

/* ── Step 5: Booking Summary ──────────────────────────────── */
export function Step5({ form, services, technicians }) {
  const { selected, lineItems, basePrice, dpPercent, toPayNow, remaining, isFullPay } = getCostBreakdown(form, services);
  const techName = technicians.find((t) => t._id === form.technician)?.name || 'No preference';

  return (
    <div className="bs-card booking-summary">
      <h3 className="bs-card-title">Booking Summary</h3>
      <div className="summary-grid">
        <div>
          <p className="summary-section-title">Service Details</p>
          <div className="summary-row"><span>Service</span><span>{selected?.label || '—'}</span></div>
          {lineItems.map((li, i) => (
            <div className="summary-row" key={i}>
              <span>Unit {i + 1}</span>
              <span>{li.quantity}× {li.type || '—'}{li.brandModel ? ` — ${li.brandModel}` : ''}</span>
            </div>
          ))}
          <div className="summary-row"><span>Date &amp; Time</span><span>{form.date ? `${form.date}, ${form.time || ''}` : '—'}</span></div>
          <div className="summary-row"><span>Address</span><span>{form.address || '—'}</span></div>
          <div className="summary-row"><span>Preferred Tech</span><span>{techName}</span></div>
          {selected?.serviceType === 'Installation' && (
            <div className="summary-row">
              <span>Unit Source</span>
              <span>{form.clientSuppliedUnit ? 'My Own Unit (waiver signed)' : 'CZA-Supplied Unit'}</span>
            </div>
          )}
        </div>
        <div>
          <p className="summary-section-title">Payment Details</p>
          <div className="summary-row"><span>Total Price</span><span>₱{basePrice.toLocaleString()}.00</span></div>
          <div className="summary-row"><span>Down Payment</span><span>{dpPercent}%</span></div>
          <div className="summary-row"><span>To Pay Now</span><span>₱{toPayNow.toLocaleString()}.00</span></div>
          <div className="summary-row total"><span>Remaining Balance</span><span>₱{remaining.toLocaleString()}.00</span></div>
          <div className="summary-row"><span>Payment Mode</span><span>{form.paymentMode || '—'}</span></div>
          {!isFullPay && (
            <div className="summary-row"><span>2nd Payment Mode</span><span>{form.paymentMode2 || '—'}</span></div>
          )}
        </div>
      </div>
      <p className="summary-note">
        <FiClock /> Service is typically completed within <strong>1–3 days</strong> after confirmation.<br />
        Cancellation or rescheduling requests must be made at least <strong>3 hours</strong> prior to the scheduled service.
      </p>
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────── */
function BookService() {
  const { services, loading } = useServices();
  const { technicians } = useTechnicians();
  const classification = useMyClassification();
  const isReturnCustomer = classification === 'Return';
  const { paymentMethods, downPaymentPercentages } = usePaymentSettings();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  const [form, setForm] = useState({
    service: '',
    units: [],
    problemDescription: '',
    date: '',
    time: '',
    technician: '',
    address: '',
    downPaymentPercent: 30,
    paymentMode: '',
    paymentMode2: '',
  });

const canNext = () => {
    if (step === 1) return !!form.service;
    if (step === 2) {
      const units = form.units || [];
      if (units.length === 0) return false;
      if (units.some((u) => !u.type || !u.quantity || u.quantity < 1)) return false;
      const selectedService = services.find((s) => s.id === form.service);
      const isInstallation = selectedService?.serviceType === 'Installation';
      if (isInstallation && form.clientSuppliedUnit) {
        return !!form.unitWaiverAcknowledged && !!(form.unitWaiverName || '').trim();
      }
      return true;
    }
    if (step === 3) {
      if (!form.date || !form.time || !form.address) return false;
      const minDate = new Date();
      minDate.setDate(minDate.getDate() + 3);
      minDate.setHours(0, 0, 0, 0);
      const selected = new Date(form.date);
      return selected >= minDate;
    }
    if (step === 4) {
      const { dpPercent } = getCostBreakdown(form, services);
      if (dpPercent === 0) return true;
      return form.paymentStatus === 'to_verify' || form.paymentStatus === 'fully_paid';
    }
    return true;
  };

  const stepLabels = ['Choose Service', 'Unit Details', 'Location & Schedule', 'Payment', 'Booking Summary'];

 const handleConfirmBooking = async () => {
    try {
      const token = localStorage.getItem('token');

      const formData = new FormData();
      formData.append('service', form.service);
      // Sent as a JSON string, not repeated fields, since this is multipart/form-data
      // (there's a proof file too) and units are now structured objects, not flat strings.
      formData.append('units', JSON.stringify(form.units || []));
      formData.append('problemDescription', form.problemDescription || '');
      formData.append('date', form.date);
      formData.append('time', form.time);
      formData.append('technician', form.technician || '');
      formData.append('address', form.address);
      formData.append('clientSuppliedUnit', form.clientSuppliedUnit || false);
      if (form.clientSuppliedUnit) {
        formData.append('unitWaiverAcknowledged', form.unitWaiverAcknowledged || false);
        formData.append('unitWaiverName', form.unitWaiverName || '');
      }
      formData.append('downPaymentPercent', form.downPaymentPercent);
      formData.append('paymentMode', form.paymentMode || '');
      formData.append('paymentMode2', form.paymentMode2 || '');
      formData.append('paymentStatus', form.paymentStatus || 'Unpaid');
      if (form.proofFileObj) formData.append('proof', form.proofFileObj);

      const res = await fetch('http://localhost:5000/api/bookings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }, // no Content-Type for FormData
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || 'Failed to create booking');
        return;
      }

      navigate(`/customer/book_details/${data.bookingId}`, { state: { booking: data } });
    } catch (err) {
      alert('Could not connect to server. Is the backend running?');
    }
  };

  return (
    <CustomerLayout title="Book Service">
      <h1 className="dashboard-welcome">Tell us what you need</h1>

      <StepIndicator current={step} />

      {loading ? (
        <p>Loading services...</p>
      ) : (
        <>
          {step === 1 && <Step1 form={form} setForm={setForm} services={services} />}
          {step === 2 && <Step2 form={form} setForm={setForm} services={services} />}
          {step === 3 && <Step3 form={form} setForm={setForm} technicians={technicians} />}
          {step === 4 && (
            <Step4
              form={form}
              setForm={setForm}
              services={services}
              isReturnCustomer={isReturnCustomer}
              paymentMethods={paymentMethods}
              downPaymentPercentages={downPaymentPercentages}
            />
          )}
          {step === 5 && <Step5 form={form} services={services} technicians={technicians} />}
        </>
      )}

      <div className="bs-nav-row">
        <span className="bs-step-label">
          Step {step} of {TOTAL_STEPS} — {stepLabels[step - 1]}
        </span>

        <div className="bs-nav-btns">
          {step > 1 && (
            <button className="bs-back-btn" onClick={() => setStep(step - 1)}>
              <FiArrowLeft /> Back
            </button>
          )}
          {step < TOTAL_STEPS ? (
            <button
              className="bs-next-btn"
              onClick={() => setStep(step + 1)}
              disabled={!canNext()}
            >
              {step === 4 ? <>Book <FiArrowRight /></> : <>Next <FiArrowRight /></>}
            </button>
          ) : (
            <button className="bs-next-btn" onClick={handleConfirmBooking}
            >
              Confirm <FiCheck />
            </button>
          )}
        </div>
      </div>
    </CustomerLayout>
  );
}

export default BookService;
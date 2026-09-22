import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerLayout from './customer_layout';
import PaymentModal from '../../components/payment_modal';
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
} from 'react-icons/fi';

const ICON_MAP = {
  FiWind: <FiWind />,
  FiTool: <FiTool />,
  FiThermometer: <FiThermometer />,
  FiSettings: <FiSettings />,
};

function useServices() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/services`)
      .then((res) => res.json())
      .then((data) => {
        const mapped = data.map((s) => ({
          id: s._id,
          label: s.name,
          desc: s.description,
          price: s.price,
          icon: ICON_MAP[s.icon] || <FiSettings />,
        }));
        setServices(mapped);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { services, loading };
}

function useTechnicians() {
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/auth/technicians`)
      .then((res) => res.json())
      .then((data) => {
        setTechnicians(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { technicians, loading };
}

const UNIT_TYPES = ['Window Type', 'Split Type', 'Floor Mounted', 'Cassette Type', 'Portable'];

const DOWN_PAYMENT_OPTIONS = [
  { label: 'Full Payment (100%)', value: 100 },
  { label: '30% Down Payment', value: 30 },
  { label: '50% Down Payment', value: 50 },
  { label: '10% Down Payment', value: 10 },
];
const FIRST_PAYMENT_MODES = ['E-Wallet (GCash, Maya...)', 'Bank Transfer'];
const PAYMENT_MODES = ['Cash', 'E-Wallet (GCash, Maya...)', 'Bank Transfer'];

const TOTAL_STEPS = 5;

/* ── Helpers ───────────────────────────────────────────────── */
function generateBookingId() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CZ-${year}-${rand}`;
}

// Shared cost breakdown math — used by Step4 and Step5
function getCostBreakdown(form, services) {
  const selected = services.find((s) => s.id === form.service);
  const basePrice = selected?.price || 0;
  const dpPercent = form.downPaymentPercent ?? 10;
  const toPayNow = Math.round(basePrice * (dpPercent / 100));
  const remaining = basePrice - toPayNow;
  const isFullPay = dpPercent === 100;
  return { selected, basePrice, dpPercent, toPayNow, remaining, isFullPay };
}

/* ── Step Indicator ───────────────────────────────────────── */
function StepIndicator({ current }) {
  return (
    <div className="step-indicator">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => {
        const num = i + 1;
        const isCompleted = num < current;
        const isActive = num === current;
        return (
          <div key={num} className="step-indicator-item">
            <div className={`step-dot ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
              {isCompleted ? <FiCheck /> : num}
            </div>
            {num < TOTAL_STEPS && (
              <div className={`step-line ${isCompleted ? 'completed' : ''}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Step 1: Choose a Service ─────────────────────────────── */
function Step1({ form, setForm, services }) {
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
            onClick={() => setForm({ ...form, service: s.id })}
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
function Step2({ form, setForm }) {
  const toggleUnit = (type) => {
    const current = form.unitTypes || [];
    const updated = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    setForm({ ...form, unitTypes: updated });
  };

  return (
    <div className="bs-card">
      <h3 className="bs-card-title">Unit Details</h3>
      <p className="bs-card-sub">Provide details about your aircon unit(s).</p>

      <div className="bs-field-group">
        <label className="bs-label">Unit Type <span className="bs-label-hint">(Select all that apply)</span></label>
        <div className="unit-type-grid">
          {UNIT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`unit-type-btn ${(form.unitTypes || []).includes(type) ? 'selected' : ''}`}
              onClick={() => toggleUnit(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="bs-field-group">
        <label className="bs-label">Brand &amp; Model <span className="bs-label-hint">(Enter the brands and models of your units)</span></label>
        <textarea
          className="bs-textarea"
          rows={3}
          placeholder="e.g. Carrier 1HP Split Type, Panasonic 1.5HP Window Type"
          value={form.brandModel || ''}
          onChange={(e) => setForm({ ...form, brandModel: e.target.value })}
        />
      </div>

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
function Step3({ form, setForm, technicians }) {
  const minDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d.toISOString().split('T')[0]; // YYYY-MM-DD for <input type="date">
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
function Step4({ form, setForm, services }) {
  const [showModal, setShowModal] = useState(false);
  const { basePrice, dpPercent, toPayNow, remaining, isFullPay } = getCostBreakdown(form, services);

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
            downPaymentPercent: dpPercent,
            toPayNow,
            remaining,
          }}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmitPayment}
        />
      )}

      <div className="bs-step4-layout">

        {/* ── Left: Payment form ── */}
        <div className="bs-card bs-step4-left">
          <h3 className="bs-card-title">Payment</h3>
          <p className="bs-card-sub">Choose payment option.</p>

          {/* Down Payment — 2×2 radio grid */}
          <div className="bs-field-group">
            <label className="bs-label">Down Payment</label>
            <div className="dp-radio-grid">
              {DOWN_PAYMENT_OPTIONS.map((opt) => (
                <label key={opt.value} className="dp-radio-label">
                  <input
                    type="radio"
                    name="downPayment"
                    value={opt.value}
                    checked={dpPercent === opt.value}
                    onChange={() =>
                      setForm({ ...form, downPaymentPercent: opt.value, paymentMode2: '' })
                    }
                    className="dp-radio-input"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Mode of Payment */}
          <div className="bs-field-group">
            <label className="bs-label">Mode of Payment</label>
            <select
              className="bs-select"
              value={form.paymentMode || ''}
              onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}
            >
              <option value="">Select mode</option>
              {FIRST_PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>{m}</option>
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
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* ── Right: Cost Breakdown ── */}
        <div className="cost-breakdown-card">
          <h4 className="cost-breakdown-title">Cost Breakdown</h4>

          <div className="cost-row"><span>Total Price</span><span>₱{basePrice.toLocaleString()}.00</span></div>
          <div className="cost-row"><span>Down Payment</span><span>{dpPercent}%</span></div>
          <div className="cost-row"><span>To Pay Now</span><span>₱{toPayNow.toLocaleString()}.00</span></div>
          <div className="cost-row"><span>Remaining Balance</span><span>₱{remaining.toLocaleString()}.00</span></div>

          <div className="cost-divider" />

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

        </div>

      </div>
    </>
  );
}

/* ── Step 5: Booking Summary ──────────────────────────────── */
function Step5({ form, services, technicians }) {
  const { selected, basePrice, dpPercent, toPayNow, remaining, isFullPay } = getCostBreakdown(form, services);
  const techName = technicians.find((t) => t._id === form.technician)?.name || 'No preference';

  return (
    <div className="bs-card booking-summary">
      <h3 className="bs-card-title">Booking Summary</h3>
      <div className="summary-grid">
        <div>
          <p className="summary-section-title">Service Details</p>
          <div className="summary-row"><span>Service</span><span>{selected?.label || '—'}</span></div>
          <div className="summary-row"><span>Unit Type</span><span>{(form.unitTypes || []).join(', ') || '—'}</span></div>
          <div className="summary-row"><span>Brand &amp; Model</span><span>{form.brandModel || '—'}</span></div>
          <div className="summary-row"><span>Date &amp; Time</span><span>{form.date ? `${form.date}, ${form.time || ''}` : '—'}</span></div>
          <div className="summary-row"><span>Address</span><span>{form.address || '—'}</span></div>
          <div className="summary-row"><span>Preferred Tech</span><span>{techName}</span></div>
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
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  const [form, setForm] = useState({
    service: '',
    unitTypes: [],
    brandModel: '',
    problemDescription: '',
    date: '',
    time: '',
    technician: '',
    address: '',
    downPaymentPercent: 10,
    paymentMode: '',
    paymentMode2: '',
  });

const canNext = () => {
    if (step === 1) return !!form.service;
    if (step === 2) return (form.unitTypes || []).length > 0;
    if (step === 3) {
      if (!form.date || !form.time || !form.address) return false;
      const minDate = new Date();
      minDate.setDate(minDate.getDate() + 5);
      minDate.setHours(0, 0, 0, 0);
      const selected = new Date(form.date);
      return selected >= minDate;
    }
    if (step === 4) return form.paymentStatus === 'to_verify' || form.paymentStatus === 'fully_paid';
    return true;
  };

  const stepLabels = ['Choose Service', 'Unit Details', 'Location & Schedule', 'Payment', 'Booking Summary'];

 const handleConfirmBooking = async () => {
    try {
      const token = localStorage.getItem('token');

      const formData = new FormData();
      formData.append('service', form.service);
      (form.unitTypes || []).forEach((u) => formData.append('unitTypes', u));
      formData.append('brandModel', form.brandModel || '');
      formData.append('problemDescription', form.problemDescription || '');
      formData.append('date', form.date);
      formData.append('time', form.time);
      formData.append('technician', form.technician || '');
      formData.append('address', form.address);
      formData.append('downPaymentPercent', form.downPaymentPercent);
      formData.append('paymentMode', form.paymentMode || '');
      formData.append('paymentMode2', form.paymentMode2 || '');
      formData.append('paymentStatus', form.paymentStatus || 'Unpaid');
      if (form.proofFileObj) formData.append('proof', form.proofFileObj);

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/bookings`, {
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
          {step === 2 && <Step2 form={form} setForm={setForm} />}
          {step === 3 && <Step3 form={form} setForm={setForm} technicians={technicians} />}
          {step === 4 && <Step4 form={form} setForm={setForm} services={services} />}
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
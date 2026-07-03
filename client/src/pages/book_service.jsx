import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const SERVICES = [
  { id: 'cleaning',     label: 'Cleaning',     desc: 'Deep clean & sanitize',        price: 650,   icon: '🧹' },
  { id: 'repair',       label: 'Repair',        desc: 'Diagnose & fix issues',        price: 1200,  icon: '🔧' },
  { id: 'installation', label: 'Installation',  desc: 'Deep clean & fix surroundings', price: 3500,  icon: '❄️' },
  { id: 'maintenance',  label: 'Maintenance',   desc: 'Routine check-up',             price: 550,   icon: '🛠️' },
];

const UNIT_TYPES = ['Window Type', 'Split Type', 'Floor Mounted', 'Cassette Type', 'Portable'];

const TOTAL_STEPS = 4;

function StepIndicator({ current }) {
  return (
    <div className="step-indicator">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => {
        const num = i + 1;
        const isCompleted = num < current;
        const isActive    = num === current;
        return (
          <div key={num} className="step-indicator-item">
            <div className={`step-dot ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
              {isCompleted ? '✓' : num}
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

function Step1({ form, setForm }) {
  return (
    <div className="bs-card">
      <h3 className="bs-card-title">Choose a Service</h3>
      <p className="bs-card-sub">Base price only. Final cost may vary depending on the scope of work and materials needed.</p>
      <div className="service-grid">
        {SERVICES.map((s) => (
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

function Step2({ form, setForm }) {
  const toggleUnit = (type) => {
    const current = form.unitTypes || [];
    const updated  = current.includes(type)
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
    </div>
  );
}

function Step3({ form, setForm }) {
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
            value={form.date || ''}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
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
                {t === 'Morning' ? '🌅' : '🌇'} {t}
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
          <option value="tech1">Juan Dela Cruz</option>
          <option value="tech2">Pedro Santos</option>
          <option value="tech3">Maria Reyes</option>
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

function Step4({ form, setForm }) {
  const selected    = SERVICES.find((s) => s.id === form.service);
  const basePrice   = selected?.price || 0;
  const downPayment = Math.round(basePrice * 0.5);
  const balance     = basePrice - downPayment;

  return (
    <div className="bs-step4-layout">

      {/* Left — payment form */}
      <div className="bs-card bs-step4-left">
        <h3 className="bs-card-title">Payment</h3>

        <div className="bs-field-group">
          <label className="bs-label">Down Payment</label>
          <div className="payment-option selected">
            <div>
              <p className="payment-option-title">✅ Confirmed (50%) — 50% Down Payment</p>
              <p className="payment-option-desc">₱{downPayment.toLocaleString()} — 50% downpayment required</p>
            </div>
          </div>
        </div>

        <div className="bs-field-group">
          <label className="bs-label">Mode for 2nd Payment</label>
          <div className="payment-modes">
            {['Cash', 'GCash', 'Bank Transfer'].map((mode) => (
              <button
                key={mode}
                type="button"
                className={`payment-mode-btn ${form.paymentMode === mode ? 'selected' : ''}`}
                onClick={() => setForm({ ...form, paymentMode: mode })}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <button className="pay-down-btn">Pay Downpayment →</button>
      </div>

      {/* Right — cost breakdown */}
      <div className="bs-card bs-step4-right">
        <h3 className="bs-card-title">Cost Breakdown</h3>
        <div className="cost-row"><span>Service</span><span>{selected?.label || '—'}</span></div>
        <div className="cost-row"><span>Base Price</span><span>₱{basePrice.toLocaleString()}</span></div>
        <div className="cost-row"><span>Down Payment (50%)</span><span>₱{downPayment.toLocaleString()}</span></div>
        <div className="cost-divider" />
        <div className="cost-row total"><span>Remaining Balance</span><span>₱{balance.toLocaleString()}</span></div>
      </div>

      {/* Booking Summary — full width below */}
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
            <div className="summary-row"><span>Preferred Tech</span><span>{form.technician || 'No preference'}</span></div>
          </div>
          <div>
            <p className="summary-section-title">Payment Details</p>
            <div className="summary-row"><span>Base Price</span><span>₱{basePrice.toLocaleString()}</span></div>
            <div className="summary-row"><span>Down Payment</span><span>₱{downPayment.toLocaleString()}</span></div>
            <div className="summary-row"><span>2nd Payment Mode</span><span>{form.paymentMode || '—'}</span></div>
            <div className="summary-row total"><span>Balance</span><span>₱{balance.toLocaleString()}</span></div>
          </div>
        </div>
        <p className="summary-note">
          ⏱ Service is typically completed within <strong>1–3 days</strong> after confirmation.<br />
          Cancellation or rescheduling requests must be made at least <strong>3 hours</strong> prior to the scheduled service.
        </p>
      </div>

    </div>
  );
}

function BookService() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    service: '',
    unitTypes: [],
    brandModel: '',
    date: '',
    time: '',
    technician: '',
    address: '',
    paymentMode: '',
  });

  const canNext = () => {
    if (step === 1) return !!form.service;
    if (step === 2) return (form.unitTypes || []).length > 0;
    if (step === 3) return !!form.date && !!form.time && !!form.address;
    return true;
  };

  const stepLabels = ['Choose Service', 'Unit Details', 'Location & Schedule', 'Payment'];

  return (
    <div className="dashboard-shell">

      {/* Sidebar */}
      <aside className="sidebar">
        <div>
          <div className="sidebar-brand">
            <img src="/images/logo.png" alt="Logo" className="sidebar-logo" />
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-name">Cooling Zone Aircon</span>
              <span className="sidebar-brand-sub">Services</span>
            </div>
          </div>
          <p className="sidebar-section-label">Customer Portal</p>
          <nav className="sidebar-nav">
            <Link to="/dashboard"        className="sidebar-link">          <span className="link-icon">📊</span> Dashboard</Link>
            <Link to="/book-service"     className="sidebar-link active">   <span className="link-icon">📋</span> Book Service</Link>
            <Link to="/my-bookings"      className="sidebar-link">          <span className="link-icon">📁</span> My Bookings</Link>
            <Link to="/payment-billing"  className="sidebar-link">          <span className="link-icon">💳</span> Payment &amp; Billing</Link>
            <Link to="/profile"          className="sidebar-link">          <span className="link-icon">👤</span> Profile</Link>
          </nav>
        </div>
        <div className="sidebar-logout">
          <button className="sidebar-link" onClick={() => navigate('/login')}>
            <span className="link-icon">🚪</span> Log out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="dashboard-main">
        <div className="dashboard-topbar">Book Service</div>

        <div className="dashboard-body">
          <h1 className="dashboard-welcome">Tell us what you need</h1>

          <StepIndicator current={step} />

          {step === 1 && <Step1 form={form} setForm={setForm} />}
          {step === 2 && <Step2 form={form} setForm={setForm} />}
          {step === 3 && <Step3 form={form} setForm={setForm} />}
          {step === 4 && <Step4 form={form} setForm={setForm} />}

          {/* Navigation buttons */}
          <div className="bs-nav-row">
            <span className="bs-step-label">Step {step} of {TOTAL_STEPS} — {stepLabels[step - 1]}</span>
            <div className="bs-nav-btns">
              {step > 1 && (
                <button className="bs-back-btn" onClick={() => setStep(step - 1)}>
                  ← Back
                </button>
              )}
              {step < TOTAL_STEPS ? (
                <button
                  className="bs-next-btn"
                  onClick={() => setStep(step + 1)}
                  disabled={!canNext()}
                >
                  Next →
                </button>
              ) : (
                <button className="bs-next-btn" onClick={() => navigate('/dashboard')}>
                  Confirm ✓
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default BookService;
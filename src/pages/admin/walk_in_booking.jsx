import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './admin_layout';
import {
  useServices,
  useTechnicians,
  getDownPaymentOptions,
  PAYMENT_MODES,
  getCostBreakdown,
  StepIndicator,
  Step1,
  Step2,
  Step3,
  Step5,
} from '../customer/book_service';
import { FiCheck, FiArrowLeft, FiArrowRight, FiUserPlus } from 'react-icons/fi';

const API_BASE = 'http://localhost:5000';
const TOTAL_STEPS = 6;
const STEP_LABELS = ['Customer', 'Choose Service', 'Unit Details', 'Location & Schedule', 'Payment', 'Booking Summary'];

function useCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API_BASE}/api/users?role=customer`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setCustomers(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { customers, loading };
}

/* ── Step 1: Customer Selection (existing account or new walk-in) ────── */
function CustomerStep({ customers, loadingCustomers, selectedCustomer, onSelectCustomer, onCustomerCreated }) {
  const [mode, setMode] = useState('existing'); // 'existing' | 'new'
  const [search, setSearch] = useState('');
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '', address: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const filteredCustomers = customers.filter((c) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      (c.name || '').toLowerCase().includes(term) ||
      (c.email || '').toLowerCase().includes(term) ||
      (c.phone || '').toLowerCase().includes(term)
    );
  });

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!newCustomer.name.trim() || !newCustomer.email.trim() || !newCustomer.phone.trim()) {
      setError('Name, email, and phone number are required.');
      return;
    }
    setError('');
    setCreating(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newCustomer.name.trim(),
          email: newCustomer.email.trim(),
          phone: newCustomer.phone.trim(),
          address: newCustomer.address.trim(),
          role: 'customer',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Failed to create customer account.');
        return;
      }
      onCustomerCreated(data);
    } catch (err) {
      setError('Could not connect to server.');
    } finally {
      setCreating(false);
    }
  };

  if (selectedCustomer) {
    return (
      <div className="bs-card">
        <h3 className="bs-card-title">Customer</h3>
        <p className="bs-card-sub">Booking this service on behalf of:</p>
        <div className="walkin-selected-customer">
          <div>
            <p className="walkin-selected-customer-name">{selectedCustomer.name || 'No Name Provided'}</p>
            <p className="walkin-selected-customer-meta">
              {selectedCustomer.email} · {selectedCustomer.phone || 'No phone on file'}
            </p>
          </div>
          <button type="button" className="bs-back-btn" onClick={() => onSelectCustomer(null)}>
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bs-card">
      <h3 className="bs-card-title">Customer</h3>
      <p className="bs-card-sub">Who is this booking for?</p>

      <div className="walkin-mode-toggle">
        <button
          type="button"
          className={`walkin-mode-btn ${mode === 'existing' ? 'selected' : ''}`}
          onClick={() => setMode('existing')}
        >
          Existing Customer
        </button>
        <button
          type="button"
          className={`walkin-mode-btn ${mode === 'new' ? 'selected' : ''}`}
          onClick={() => setMode('new')}
        >
          <FiUserPlus /> New Customer
        </button>
      </div>

      {mode === 'existing' ? (
        <>
          <div className="bs-field-group">
            <label className="bs-label">Search</label>
            <input
              type="text"
              className="bs-input"
              placeholder="Search by name, email, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="walkin-customer-list">
            {loadingCustomers ? (
              <p className="bs-card-sub">Loading customers...</p>
            ) : filteredCustomers.length === 0 ? (
              <p className="bs-card-sub">No matching customers found.</p>
            ) : (
              filteredCustomers.map((c) => (
                <button
                  key={c._id}
                  type="button"
                  className="walkin-customer-row"
                  onClick={() => onSelectCustomer(c)}
                >
                  <span className="walkin-customer-row-name">{c.name || 'No Name Provided'}</span>
                  <span className="walkin-customer-row-meta">{c.email} · {c.phone || '—'}</span>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <form onSubmit={handleCreateCustomer}>
          <div className="bs-field-group">
            <label className="bs-label">Full Name</label>
            <input
              type="text"
              className="bs-input"
              placeholder="e.g. Juan Dela Cruz"
              value={newCustomer.name}
              onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
            />
          </div>

          <div className="bs-field-group">
            <label className="bs-label">Email Address</label>
            <input
              type="email"
              className="bs-input"
              placeholder="e.g. juan.delacruz@email.com"
              value={newCustomer.email}
              onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
            />
          </div>

          <div className="bs-field-group">
            <label className="bs-label">Phone Number</label>
            <input
              type="tel"
              className="bs-input"
              placeholder="e.g. +63 917 000 0000"
              value={newCustomer.phone}
              onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
            />
          </div>

          <div className="bs-field-group">
            <label className="bs-label">
              Address <span className="bs-label-hint">(Optional)</span>
            </label>
            <input
              type="text"
              className="bs-input"
              placeholder="House No., Street, Barangay, City"
              value={newCustomer.address}
              onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
            />
          </div>

          {error && (
            <p style={{ fontSize: '12px', color: '#e05a5a', marginBottom: '12px' }}>{error}</p>
          )}

          <button type="submit" className="bs-next-btn" disabled={creating}>
            {creating ? 'Creating...' : 'Create Customer & Continue'}
          </button>
        </form>
      )}
    </div>
  );
}

/* ── Step 5: Payment — admin is recording an in-person/phone payment, not
   walking a remote customer through where to send money, so this skips the
   customer-facing PaymentModal and just records the mode + an optional proof. ── */
function WalkInPaymentStep({ form, setForm, services, isReturnCustomer }) {
  const { basePrice, dpPercent, toPayNow, remaining, isFullPay } = getCostBreakdown(form, services);
  const isNoDownPayment = dpPercent === 0;

  const handleProofChange = (e) => {
    const file = e.target.files[0] || null;
    setForm({ ...form, proofFileObj: file, proofFile: file?.name || null });
  };

  return (
    <div className="bs-step4-layout">
      <div className="bs-card bs-step4-left">
        <h3 className="bs-card-title">Payment</h3>
        <p className="bs-card-sub">Record how the customer is paying.</p>

        <div className="bs-field-group">
          <label className="bs-label">Down Payment</label>
          <div className="dp-radio-grid">
            {getDownPaymentOptions(isReturnCustomer).map((opt) => (
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

        {isNoDownPayment ? (
          <p style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
            This customer is a return customer, so no down payment is required. The full amount is due upon completion of service.
          </p>
        ) : (
          <>
            <div className="bs-field-group">
              <label className="bs-label">Mode of Payment</label>
              <select
                className="bs-select"
                value={form.paymentMode || ''}
                onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}
              >
                <option value="">Select mode</option>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

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

            <div className="bs-field-group">
              <label className="bs-label">
                Proof of Payment <span className="bs-label-hint">(Optional — e.g. a GCash screenshot; not needed for cash)</span>
              </label>
              <input type="file" accept="image/*,.pdf" className="bs-input" onChange={handleProofChange} />
            </div>
          </>
        )}
      </div>

      <div className="cost-breakdown-card">
        <h4 className="cost-breakdown-title">Cost Breakdown</h4>
        <div className="cost-row"><span>Total Price</span><span>₱{basePrice.toLocaleString()}.00</span></div>
        <div className="cost-row"><span>Down Payment</span><span>{dpPercent}%</span></div>
        <div className="cost-row"><span>To Pay Now</span><span>₱{toPayNow.toLocaleString()}.00</span></div>
        <div className="cost-row"><span>Remaining Balance</span><span>₱{remaining.toLocaleString()}.00</span></div>
      </div>
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────── */
function WalkInBooking() {
  const { services, loading: loadingServices } = useServices();
  const { technicians } = useTechnicians();
  const { customers, loading: loadingCustomers } = useCustomers();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [customer, setCustomer] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    service: '',
    unitTypes: [],
    brandModel: '',
    problemDescription: '',
    date: '',
    time: '',
    technician: '',
    address: '',
    downPaymentPercent: 30,
    paymentMode: '',
    paymentMode2: '',
  });

  const { isFullPay, dpPercent } = getCostBreakdown(form, services);
  const isReturnCustomer = customer?.classification === 'Return';

  const canNext = () => {
    if (step === 1) return !!customer;
    if (step === 2) return !!form.service;
    if (step === 3) {
      if ((form.unitTypes || []).length === 0) return false;
      const selectedService = services.find((s) => s.id === form.service);
      const isInstallation = selectedService?.serviceType === 'Installation';
      if (isInstallation && form.clientSuppliedUnit) {
        return !!form.unitWaiverAcknowledged && !!(form.unitWaiverName || '').trim();
      }
      return true;
    }
    if (step === 4) {
      if (!form.date || !form.time || !form.address) return false;
      const minDate = new Date();
      minDate.setDate(minDate.getDate() + 3);
      minDate.setHours(0, 0, 0, 0);
      const selected = new Date(form.date);
      return selected >= minDate;
    }
    if (step === 5) {
      if (dpPercent === 0) return true;
      return !!form.paymentMode && (isFullPay || !!form.paymentMode2);
    }
    return true;
  };

  const handleConfirmBooking = async () => {
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');

      const formData = new FormData();
      formData.append('customer', customer._id);
      formData.append('service', form.service);
      (form.unitTypes || []).forEach((u) => formData.append('unitTypes', u));
      formData.append('brandModel', form.brandModel || '');
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
      if (form.proofFileObj) formData.append('proof', form.proofFileObj);

      const res = await fetch(`${API_BASE}/api/bookings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }, // no Content-Type for FormData
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || 'Failed to create booking');
        return;
      }

      navigate('/admin/services/requests');
    } catch (err) {
      alert('Could not connect to server. Is the backend running?');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminLayout title="New Booking">
      <h1 className="dashboard-welcome">Create a Walk-in Booking</h1>

      <StepIndicator current={step} total={TOTAL_STEPS} />

      {step === 1 && (
        <CustomerStep
          customers={customers}
          loadingCustomers={loadingCustomers}
          selectedCustomer={customer}
          onSelectCustomer={setCustomer}
          onCustomerCreated={(c) => setCustomer(c)}
        />
      )}

      {step > 1 && (
        loadingServices ? (
          <p>Loading services...</p>
        ) : (
          <>
            {step === 2 && <Step1 form={form} setForm={setForm} services={services} />}
            {step === 3 && <Step2 form={form} setForm={setForm} services={services} />}
            {step === 4 && <Step3 form={form} setForm={setForm} technicians={technicians} />}
            {step === 5 && (
              <WalkInPaymentStep
                form={form}
                setForm={setForm}
                services={services}
                isReturnCustomer={isReturnCustomer}
              />
            )}
            {step === 6 && (
              <>
                <Step5 form={form} services={services} technicians={technicians} />
                <div className="bs-card" style={{ marginTop: '16px' }}>
                  <p className="summary-section-title">Customer</p>
                  <div className="summary-row"><span>Name</span><span>{customer?.name || '—'}</span></div>
                  <div className="summary-row"><span>Contact</span><span>{customer?.email} · {customer?.phone || '—'}</span></div>
                </div>
              </>
            )}
          </>
        )
      )}

      <div className="bs-nav-row">
        <span className="bs-step-label">
          Step {step} of {TOTAL_STEPS} — {STEP_LABELS[step - 1]}
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
              Next <FiArrowRight />
            </button>
          ) : (
            <button className="bs-next-btn" onClick={handleConfirmBooking} disabled={submitting}>
              {submitting ? 'Creating...' : <>Confirm Booking <FiCheck /></>}
            </button>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

export default WalkInBooking;

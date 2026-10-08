import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './admin_layout';
import {
  StepIndicator,
  Step1,
  Step2,
  Step3,
  Step5,
} from '../customer/book_service';
import DiscountOption from '../../components/discount_option';
import { useServices } from '../../hooks/useServices';
import { useTechnicians } from '../../hooks/useTechnicians';
import { getCostBreakdown } from '../../utils/costBreakdown';
import { usePublicPromos } from '../../utils/promos';
import { isValidContactNumber } from '../../utils/contact';
import { usePaymentSettings, getDownPaymentOptions, getDefaultDownPaymentPercent } from '../../utils/paymentSettings';
import { FiCheck, FiArrowLeft, FiArrowRight, FiUserPlus } from 'react-icons/fi';
import { ApiError, orFallback } from '../../services/apiClient';
import { createBooking } from '../../services/bookingService';
import GeneratedPasswordNotice from '../../components/generated_password_notice';
import { listUsers, createUser } from '../../services/userService';
import { ROLE } from '../../constants/roles';
import { SERVICE_TYPE } from '../../constants/serviceTypes';

const TOTAL_STEPS = 6;
const STEP_LABELS = ['Customer', 'Choose Service', 'Unit Details', 'Location & Schedule', 'Payment', 'Booking Summary'];

function useCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    orFallback(listUsers('customer'), [])
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
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '', address: '', clientType: 'Residential' });
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
      const data = await createUser({
        name: newCustomer.name.trim(),
        email: newCustomer.email.trim(),
        phone: newCustomer.phone.trim(),
        address: newCustomer.address.trim(),
        role: ROLE.CUSTOMER,
        clientType: newCustomer.clientType,
      });
      onCustomerCreated(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message || 'Failed to create customer account.' : 'Could not connect to server.');
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
            <p className="walkin-selected-customer-name">
              {selectedCustomer.name || 'No Name Provided'}
              {selectedCustomer.clientType === 'Commercial' && (
                <span className="svc-service-price-note admin-walk-in-booking-x1">Commercial</span>
              )}
            </p>
            <p className="walkin-selected-customer-meta">
              {selectedCustomer.email} · {selectedCustomer.phone || 'No phone on file'}
            </p>
            {selectedCustomer.generatedPassword && <GeneratedPasswordNotice password={selectedCustomer.generatedPassword} />}
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
                  <span className="walkin-customer-row-meta">{c.email} · {c.phone || '-'}</span>
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

          <div className="bs-field-group">
            <label className="bs-label">Client Type</label>
            <div className="time-toggle">
              {['Residential', 'Commercial'].map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`time-btn ${newCustomer.clientType === t ? 'selected' : ''}`}
                  onClick={() => setNewCustomer({ ...newCustomer, clientType: t })}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="admin-walk-in-booking-x2">{error}</p>
          )}

          <button type="submit" className="bs-next-btn" disabled={creating}>
            {creating ? 'Creating...' : 'Create Customer & Continue'}
          </button>
        </form>
      )}
    </div>
  );
}

/* ── Step 5: Payment - admin is recording an in-person/phone payment, not
   walking a remote customer through where to send money, so this skips the
   customer-facing PaymentModal and just records the mode + an optional proof. ── */
function WalkInPaymentStep({ form, setForm, services, isReturnCustomer, isCommercial, paymentMethods, downPaymentPercentages, discountPercent, promos }) {
  const { basePrice, discountAmount, discountLabel, dpPercent, toPayNow, remaining, isFullPay } = getCostBreakdown(form, services, getDefaultDownPaymentPercent(downPaymentPercentages), discountPercent, promos);
  const isNoDownPayment = dpPercent === 0;
  const isBilledOnTerms = isCommercial && !!form.paymentTermsDays;
  const vatAmount = isCommercial ? Math.round(basePrice * 0.12) : 0;

  const handleProofChange = (e) => {
    const file = e.target.files[0] || null;
    setForm({ ...form, proofFileObj: file, proofFile: file?.name || null });
  };

  return (
    <div className="bs-step4-layout">
      <div className="bs-card bs-step4-left">
        <h3 className="bs-card-title">Payment</h3>
        <p className="bs-card-sub">Record how the customer is paying.</p>

        {isCommercial && (
          <div className="bs-field-group">
            <label className="bs-label">
              PO Number <span className="bs-label-hint">(Optional)</span>
            </label>
            <input
              type="text"
              className="bs-input"
              placeholder="e.g. PO-2026-0451"
              value={form.poNumber || ''}
              onChange={(e) => setForm({ ...form, poNumber: e.target.value })}
            />
          </div>
        )}

        {isCommercial && (
          <div className="bs-field-group">
            <label className="waiver-checkbox-label">
              <input
                type="checkbox"
                checked={isBilledOnTerms}
                onChange={(e) =>
                  setForm({
                    ...form,
                    paymentTermsDays: e.target.checked ? 7 : null,
                    downPaymentPercent: e.target.checked ? 0 : form.downPaymentPercent,
                    paymentMode: '',
                    paymentMode2: '',
                  })
                }
              />
              Bill on Terms - no down payment collected now, full amount invoiced and due a set number of days after the job is completed.
            </label>
            {isBilledOnTerms && (
              <div className="bs-field-group">
                <label className="bs-label">Payment Terms</label>
                <select
                  className="bs-select"
                  value={form.paymentTermsDays || 7}
                  onChange={(e) => setForm({ ...form, paymentTermsDays: Number(e.target.value) })}
                >
                  {[7, 8, 9, 10].map((d) => (
                    <option key={d} value={d}>{d} days after completion</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <DiscountOption form={form} setForm={setForm} appliesNow percent={discountPercent} />

        {!isBilledOnTerms && (
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
        )}

        {isBilledOnTerms ? null : isNoDownPayment ? (
          <p className="admin-walk-in-booking-x3">
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
                {paymentMethods.map((m) => (
                  <option key={m.name} value={m.name}>{m.name}</option>
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
                  {paymentMethods.map((m) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="bs-field-group">
              <label className="bs-label">
                Proof of Payment <span className="bs-label-hint">(Optional - e.g. a GCash screenshot; not needed for cash)</span>
              </label>
              {/* Same upload button pattern/class as the customer-facing PaymentModal
                  (.modal-file-btn, css/modals/payment_modal.css) - was a bare native
                  file input here, visually inconsistent with the rest of the app. */}
              <label className="modal-file-btn">
                {form.proofFile || '[Choose a file]'}
                <input type="file" accept="image/*,.pdf" className="admin-walk-in-booking-x4" onChange={handleProofChange} />
              </label>
            </div>
          </>
        )}
      </div>

      <div className="cost-breakdown-card">
        <h4 className="cost-breakdown-title">Cost Breakdown</h4>
        {discountAmount > 0 && (
          <div className="cost-row"><span>{discountLabel}</span><span>-₱{discountAmount.toLocaleString()}.00</span></div>
        )}
        <div className="cost-row"><span>Total Price</span><span>₱{basePrice.toLocaleString()}.00</span></div>
        {isCommercial && (
          <>
            <div className="cost-row"><span>VAT (12%)</span><span>₱{vatAmount.toLocaleString()}.00</span></div>
            <div className="cost-row"><span>Total incl. VAT</span><span>₱{(basePrice + vatAmount).toLocaleString()}.00</span></div>
          </>
        )}
        {isBilledOnTerms ? (
          <div className="cost-row">
            <span>Payment Due</span>
            <span>{form.paymentTermsDays} days after completion</span>
          </div>
        ) : (
          <>
            <div className="cost-row"><span>Down Payment</span><span>{dpPercent}%</span></div>
            <div className="cost-row"><span>To Pay Now</span><span>₱{toPayNow.toLocaleString()}.00</span></div>
            <div className="cost-row"><span>Remaining Balance</span><span>₱{remaining.toLocaleString()}.00</span></div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────── */
function WalkInBooking() {
  const { services, loading: loadingServices } = useServices();
  const { technicians } = useTechnicians();
  const { customers, loading: loadingCustomers } = useCustomers();
  const { paymentMethods, downPaymentPercentages, seniorPwdDiscountPercent, loading: loadingPaymentSettings } = usePaymentSettings();
  const { promos } = usePublicPromos();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [customer, setCustomer] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    service: '',
    units: [],
    problemDescription: '',
    date: '',
    time: '',
    technician: '',
    address: '',
    contactNumber: '',
    discountType: '',
    discountIdFileObj: null,
    downPaymentPercent: null,
    paymentMode: '',
    paymentMode2: '',
  });

  // Start on the first configured down payment option rather than a hardcoded value.
  useEffect(() => {
    if (!loadingPaymentSettings && form.downPaymentPercent == null) {
      setForm((prev) => ({ ...prev, downPaymentPercent: getDefaultDownPaymentPercent(downPaymentPercentages) }));
    }
  }, [loadingPaymentSettings, downPaymentPercentages, form.downPaymentPercent]);

  const { isFullPay, dpPercent } = getCostBreakdown(form, services, getDefaultDownPaymentPercent(downPaymentPercentages), seniorPwdDiscountPercent, promos);
  const isReturnCustomer = customer?.classification === 'Return';
  const isCommercial = customer?.clientType === 'Commercial';
  const isBilledOnTerms = isCommercial && !!form.paymentTermsDays;

  // Picking (or changing) the customer prefills the contact number from their profile
  // phone; the admin can still edit it on the schedule step.
  const chooseCustomer = (c) => {
    setCustomer(c);
    setForm((prev) => ({ ...prev, contactNumber: c?.phone || '' }));
  };

  const canNext = () => {
    if (step === 1) return !!customer;
    if (step === 2) return !!form.service;
    if (step === 3) {
      const units = form.units || [];
      if (units.length === 0) return false;
      if (units.some((u) => !u.type || !u.quantity || u.quantity < 1)) return false;
      const selectedService = services.find((s) => s.id === form.service);
      const isInstallation = selectedService?.serviceType === SERVICE_TYPE.INSTALLATION;
      if (isInstallation && form.clientSuppliedUnit) {
        return !!form.unitWaiverAcknowledged && !!(form.unitWaiverName || '').trim();
      }
      return true;
    }
    if (step === 4) {
      if (!form.date || !form.time || !form.address || !isValidContactNumber(form.contactNumber)) return false;
      const minDate = new Date();
      minDate.setDate(minDate.getDate() + 3);
      minDate.setHours(0, 0, 0, 0);
      const selected = new Date(form.date);
      return selected >= minDate;
    }
    if (step === 5) {
      if (isBilledOnTerms) return true;
      if (dpPercent === 0) return true;
      return !!form.paymentMode && (isFullPay || !!form.paymentMode2);
    }
    return true;
  };

  const handleConfirmBooking = async () => {
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('customer', customer._id);
      formData.append('service', form.service);
      formData.append('units', JSON.stringify(form.units || []));
      formData.append('problemDescription', form.problemDescription || '');
      formData.append('date', form.date);
      formData.append('time', form.time);
      formData.append('technician', form.technician || '');
      formData.append('address', form.address);
      formData.append('contactNumber', form.contactNumber || '');
      if (form.discountType) {
        formData.append('discountType', form.discountType);
        if (form.discountIdFileObj) formData.append('discountId', form.discountIdFileObj);
      }
      formData.append('clientSuppliedUnit', form.clientSuppliedUnit || false);
      if (form.clientSuppliedUnit) {
        formData.append('unitWaiverAcknowledged', form.unitWaiverAcknowledged || false);
        formData.append('unitWaiverName', form.unitWaiverName || '');
      }
      formData.append('downPaymentPercent', form.downPaymentPercent);
      formData.append('paymentMode', form.paymentMode || '');
      formData.append('paymentMode2', form.paymentMode2 || '');
      if (form.proofFileObj) formData.append('proof', form.proofFileObj);
      if (isCommercial && form.poNumber) formData.append('poNumber', form.poNumber);
      if (isCommercial && form.paymentTermsDays) formData.append('paymentTermsDays', form.paymentTermsDays);

      await createBooking(formData);

      navigate('/admin/services/requests');
    } catch (err) {
      alert(err instanceof ApiError ? err.message || 'Failed to create booking' : 'Could not connect to server. Is the backend running?');
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
          onSelectCustomer={chooseCustomer}
          onCustomerCreated={chooseCustomer}
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
                isCommercial={isCommercial}
                paymentMethods={paymentMethods}
                downPaymentPercentages={downPaymentPercentages}
                discountPercent={seniorPwdDiscountPercent}
                promos={promos}
              />
            )}
            {step === 6 && (
              <>
                <Step5 form={form} services={services} technicians={technicians} downPaymentPercentages={downPaymentPercentages} discountPercent={seniorPwdDiscountPercent} promos={promos} />
                <div className="bs-card admin-walk-in-booking-x5">
                  <p className="summary-section-title">Customer</p>
                  <div className="summary-row"><span>Name</span><span>{customer?.name || '-'}</span></div>
                  <div className="summary-row"><span>Contact</span><span>{customer?.email} · {customer?.phone || '-'}</span></div>
                </div>
              </>
            )}
          </>
        )
      )}

      <div className="bs-nav-row">
        <span className="bs-step-label">
          Step {step} of {TOTAL_STEPS} - {STEP_LABELS[step - 1]}
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

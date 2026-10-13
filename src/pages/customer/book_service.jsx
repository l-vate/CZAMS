import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerLayout from './customer_layout';
import PaymentModal from '../../components/payment_modal';
import ClosureDateInput from '../../components/closure_date_input';
import DiscountOption from '../../components/discount_option';
import { usePublicPromos } from '../../utils/promos';
import { getCostBreakdown } from '../../utils/costBreakdown';
import { getMe } from '../../services/userService';
import { UNIT_TYPES, MAX_UNIT_QUANTITY } from '../../constants/unitTypes';
import { resolveCleaningTier } from '../../../shared/bookingRules.js';
import { useServices } from '../../hooks/useServices';
import { useTechnicians } from '../../hooks/useTechnicians';
import { useMyClassification } from '../../hooks/useMyClassification';
import { getUnitPrice } from '../../utils/bookingPricing';
import { earliestBookingKey, formatManilaDay } from '../../utils/manilaTime';
import { isValidContactNumber, getAccountPhone } from '../../utils/contact';
import { usePaymentSettings, getDownPaymentOptions, getDefaultDownPaymentPercent } from '../../utils/paymentSettings';
import { isWithinQuezonCity } from '../../utils/serviceArea';
import {
  FiCheck,
  FiSunrise,
  FiSunset,
  FiClock,
  FiArrowLeft,
  FiArrowRight,
  FiPlus,
  FiX,
} from 'react-icons/fi';
import { ApiError, orFallback } from '../../services/apiClient';
import PaymentSettingsUnavailable from '../../components/payment_settings_unavailable';
import { getBusyTechnicians, createBooking } from '../../services/bookingService';
import { PAYMENT_STATUS } from '../../constants/paymentStatus';
import { TIME_BLOCK_VALUES, TIME_BLOCK } from '../../constants/timeBlocks';
import { SERVICE_TYPE } from '../../constants/serviceTypes';

import Notice from '../../components/notice';
import { useNotice } from '../../hooks/useNotice';
// System Configuration Module: payment methods and down payment percentages used
// to be hardcoded here (DOWN_PAYMENT_OPTIONS / PAYMENT_MODES / getDownPaymentOptions).
// Both are now admin-managed - see src/utils/paymentSettings.js (usePaymentSettings,
// getDownPaymentOptions) and the Payment Settings tab in admin's Manage Services page.

const TOTAL_STEPS = 5;

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
// Three-Tier Cleaning Structure: Deep Cleaning and Pull-down Deep Cleaning are
// real Services (own price, own unitTypePricing, admin-managed in Manage
// Services) but hiddenFromDirectSelection - the customer never picks them
// directly, only the one visible "Cleaning" card. Resolved by price order
// (lowest = regular, highest = pull-down) rather than by name, so renaming a
// tier in Manage Services doesn't break this - the higher price for the more
// involved job is the actual defining trait the client described.
function resolveCleaningTierService(services, lastCleanedOver6MonthsAgo, isActivelyLeaking) {
  return resolveCleaningTier(services.filter((s) => s.serviceType === SERVICE_TYPE.CLEANING), lastCleanedOver6MonthsAgo, isActivelyLeaking);
}

function CleaningTierQuestions({ onResolve, onCancel, initialAnswers, services }) {
  const [lastCleanedOver6MonthsAgo, setLastCleaned] = useState(initialAnswers?.lastCleanedOver6MonthsAgo ?? null);
  const [isActivelyLeaking, setLeaking] = useState(initialAnswers?.isActivelyLeaking ?? null);
  const answered = lastCleanedOver6MonthsAgo !== null && isActivelyLeaking !== null;

  const resolvedTier = answered
    ? resolveCleaningTierService(services, lastCleanedOver6MonthsAgo, isActivelyLeaking)
    : null;

  // Resolves into the booking's selected service the moment both questions are
  // answered - there's no separate "Continue" step here anymore, the bottom
  // Next button (shared step nav) is what actually advances to Step 2, and it's
  // only enabled once form.service is set, which this effect is what sets it.
  useEffect(() => {
    if (answered) {
      onResolve({ lastCleanedOver6MonthsAgo, isActivelyLeaking });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCleanedOver6MonthsAgo, isActivelyLeaking]);

  return (
    <div className="bs-card">
      <button type="button" className="ma-back-link customer-book-service-x1" onClick={onCancel}>
        &larr; Back to services
      </button>
      <h3 className="bs-card-title">A Couple Quick Questions</h3>
      <p className="bs-card-sub">This determines which cleaning tier applies - same trigger CZA already uses for a verbal quote.</p>

      <div className="bs-field-group">
        <label className="bs-label">Is the unit currently leaking?</label>
        <div className="time-toggle">
          <button type="button" className={`time-btn ${isActivelyLeaking === true ? 'selected' : ''}`} onClick={() => setLeaking(true)}>Yes</button>
          <button type="button" className={`time-btn ${isActivelyLeaking === false ? 'selected' : ''}`} onClick={() => setLeaking(false)}>No</button>
        </div>
      </div>

      <div className="bs-field-group">
        <label className="bs-label">When was this unit last professionally cleaned?</label>
        <div className="time-toggle">
          <button type="button" className={`time-btn ${lastCleanedOver6MonthsAgo === false ? 'selected' : ''}`} onClick={() => setLastCleaned(false)}>Within the last 6 months</button>
          <button type="button" className={`time-btn ${lastCleanedOver6MonthsAgo === true ? 'selected' : ''}`} onClick={() => setLastCleaned(true)}>6+ months ago / not sure</button>
        </div>
      </div>

      {resolvedTier && (
        <p className="bs-tier-preview">
          Based on your answers, this will be booked as <strong>{resolvedTier.label}</strong> (₱{resolvedTier.price.toLocaleString()}). Click <strong>Next</strong> below to continue.
        </p>
      )}
    </div>
  );
}

export function Step1({ form, setForm, services }) {
  const [askingCleaningTier, setAskingCleaningTier] = useState(false);
  // Leak Repair is never customer-selectable in Step 1 - it's only added by
  // admin/staff (e.g. after a check-up or cleaning turns up a refrigerant
  // undercharge), never something a customer books directly off the menu.
  const visibleServices = services.filter((s) => !s.hiddenFromDirectSelection && s.serviceType !== SERVICE_TYPE.LEAK_REPAIR);
  const cleaningTierServiceIds = services.filter((s) => s.serviceType === SERVICE_TYPE.CLEANING).map((s) => s.id);
  const isCleaningTierSelected = cleaningTierServiceIds.includes(form.service);

  const selectService = (s) => setForm({
    ...form,
    service: s.id,
    // A different service may not be Installation at all, or may need
    // the unit-source question re-asked - don't carry stale answers over.
    clientSuppliedUnit: false,
    unitWaiverAcknowledged: false,
    unitWaiverName: '',
    // Same reasoning for the Cleaning tier questions: switching to a non-Cleaning
    // service (or a different Cleaning tier) must not leave a stale answer set
    // riding along into an unrelated booking's cleaningTierAnswers on submission.
    lastCleanedOver6MonthsAgo: undefined,
    isActivelyLeaking: undefined,
  });

  if (askingCleaningTier) {
    return (
      <CleaningTierQuestions
        services={services}
        initialAnswers={{ lastCleanedOver6MonthsAgo: form.lastCleanedOver6MonthsAgo, isActivelyLeaking: form.isActivelyLeaking }}
        onCancel={() => setAskingCleaningTier(false)}
        onResolve={({ lastCleanedOver6MonthsAgo, isActivelyLeaking }) => {
          const resolved = resolveCleaningTierService(services, lastCleanedOver6MonthsAgo, isActivelyLeaking);
          if (resolved) selectService(resolved);
          setForm((prev) => ({ ...prev, lastCleanedOver6MonthsAgo, isActivelyLeaking }));
          // Stays on this screen (with the resolved-tier preview shown) rather
          // than snapping back to the service grid - the bottom Next button is
          // what advances to Step 2 now that form.service is set.
        }}
      />
    );
  }

  return (
    <div className="bs-card">
      <h3 className="bs-card-title">Choose a Service</h3>
      <p className="bs-card-sub">Base price only. Final cost may vary depending on the scope of work and materials needed.</p>
      <div className="service-grid">
        {visibleServices.map((s) => {
          const isCleaningEntryPoint = s.serviceType === SERVICE_TYPE.CLEANING;
          const selected = isCleaningEntryPoint ? isCleaningTierSelected : form.service === s.id;
          return (
            <button
              key={s.id}
              type="button"
              className={`service-option ${selected ? 'selected' : ''}`}
              onClick={() => (isCleaningEntryPoint ? setAskingCleaningTier(true) : selectService(s))}
            >
              <div className="service-option-left">
                <span className="service-icon">{s.icon}</span>
                <div>
                  <p className="service-name">{s.label}</p>
                  <p className="service-desc">{s.desc}</p>
                </div>
              </div>
              <span className="service-price">
                {isCleaningEntryPoint ? 'From ' : ''}₱{s.price.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Step 2: Unit Details ─────────────────────────────────── */
const EMPTY_UNIT_ENTRY = { type: '', quantity: 1, brandModel: '' };

function getAccountName() {
  const storedUser = localStorage.getItem('user');
  return storedUser ? (JSON.parse(storedUser).name || '') : '';
}

// `accountName` is whose name the waiver must carry. It defaults to the signed-in customer;
// the admin's walk-in booking passes the chosen customer's name instead.
export function Step2({ form, setForm, services = [], accountName = getAccountName() }) {
  const waiverNameMatches = (form.unitWaiverName || '').trim().toLowerCase() === accountName.trim().toLowerCase();
  // Multi-Unit Booking Redesign: a booking now lists one or more unit entries
  // (type + quantity + its own brand/model), replacing the old flat
  // "select all that apply" type checklist with no quantity and one bulk
  // brand/model text field for the whole booking.
  const units = form.units && form.units.length > 0 ? form.units : [EMPTY_UNIT_ENTRY];
  const selectedService = services.find((s) => s.id === form.service);

  const isInstallation = selectedService?.serviceType === SERVICE_TYPE.INSTALLATION;

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
                max={MAX_UNIT_QUANTITY}
                step="1"
                value={unit.quantity}
                onChange={(e) => updateUnit(index, { quantity: Math.min(MAX_UNIT_QUANTITY, Math.max(1, Math.floor(Number(e.target.value)) || 1)) })}
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
            placeholder={`Type your full name to confirm (${accountName})`}
            value={form.unitWaiverName || ''}
            onChange={(e) => setForm({ ...form, unitWaiverName: e.target.value })}
          />
          {form.unitWaiverName && !waiverNameMatches && (
            <p className="bs-field-error">Name must match your account name ({accountName}).</p>
          )}
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
  // Only a Commercial client is asked for a purchase order number. The account is asked once.
  const [isCommercial, setIsCommercial] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getMe().then((me) => { if (!cancelled) setIsCommercial(me.clientType === 'Commercial'); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const minDate = earliestBookingKey(3); // 3 days after today in Manila, YYYY-MM-DD for <input type="date">

  // Hard-Block Technician Double-Booking: this is a UX convenience (hide the
  // obviously-unavailable options) - the real enforcement is server-side on
  // booking creation, since a customer could bypass client-side filtering entirely.
  const [busyTechIds, setBusyTechIds] = useState([]);
  useEffect(() => {
    if (!form.date || !form.time) { setBusyTechIds([]); return; }
    orFallback(getBusyTechnicians(form.date, form.time), { busyTechIds: [] })
      .then((data) => setBusyTechIds(data.busyTechIds || []))
      .catch(() => setBusyTechIds([]));
  }, [form.date, form.time]);

  const availableTechnicians = technicians.filter((t) => !busyTechIds.includes(t._id));

  // Distance-based transportation charge notice - soft, informational only, not
  // a block on submission. QC is CZA's home base; anything outside it may incur
  // an additional distance charge (replaces the old confirmed-service-area warning).
  const addressEntered = (form.address || '').trim().length > 0;
  const withinQuezonCity = !addressEntered || isWithinQuezonCity(form.address);

   return (
    <div className="bs-card">
      <h3 className="bs-card-title">Location &amp; Schedule</h3>
      <p className="bs-card-sub">When and where should we send our technician?</p>


      <div className="bs-two-col">
        <div className="bs-field-group">
          <label className="bs-label">Date &amp; Time</label>
          <ClosureDateInput
            min={minDate}
            value={form.date}
            onChange={(date) => setForm({ ...form, date })}
          />
          <p className="customer-book-service-x2">
            Earliest available date is {formatManilaDay(minDate, { month: 'long', day: 'numeric', year: 'numeric' })}.
          </p>
        </div>

        <div className="bs-field-group">
          <label className="bs-label">Time</label>
          <div className="time-toggle">
            {TIME_BLOCK_VALUES.map((t) => (
              <button
                key={t}
                type="button"
                className={`time-btn ${form.time === t ? 'selected' : ''}`}
                onClick={() => setForm({ ...form, time: t })}
              >
                {t === TIME_BLOCK.MORNING ? <FiSunrise /> : <FiSunset />} {t}
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
          {availableTechnicians.map((t) => (
            <option key={t._id} value={t._id}>{t.name}{t.position ? ` (${t.position})` : ''}</option>
          ))}
        </select>
        {form.date && form.time && busyTechIds.length > 0 && (
          <p className="customer-book-service-x2">
            {busyTechIds.length} technician{busyTechIds.length === 1 ? '' : 's'} already booked for this date/time {busyTechIds.length === 1 ? 'is' : 'are'} not shown.
          </p>
        )}
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
        {addressEntered && !withinQuezonCity && (
          <p className="bs-area-warning">
            A distance-based charge may apply for addresses outside Quezon City due to transportation.
          </p>
        )}
      </div>

      <div className="bs-field-group">
        <label className="bs-label">Contact Number</label>
        <input
          type="tel"
          className="bs-input"
          placeholder="e.g. 0917 123 4567"
          value={form.contactNumber || ''}
          onChange={(e) => setForm({ ...form, contactNumber: e.target.value })}
        />
        <p className="customer-book-service-x2">
          The number our technician will call. Prefilled from your profile, change it if someone else will be on site.
        </p>
      </div>

      {isCommercial && (
        <div className="bs-field-group">
          <label className="bs-label">Purchase Order Number (optional)</label>
          <input
            type="text"
            className="bs-input"
            maxLength={40}
            placeholder="Your PO number, if you use one"
            value={form.poNumber || ''}
            onChange={(e) => setForm({ ...form, poNumber: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

/* ── Step 4: Payment ──────────────────────────────────────── */
const PAYMENT_STATUS_LABELS = {
  Unpaid: 'Unpaid',
  to_verify: 'To Verify',
  partially_paid: 'Partially Paid',
  fully_paid: 'Fully Paid',
  rejected: 'Rejected',
};

function Step4({ form, setForm, services, isReturnCustomer, paymentMethods, downPaymentPercentages, promos }) {
  const [showModal, setShowModal] = useState(false);
  const { lineItems, basePrice, discountAmount, discountLabel, dpPercent, toPayNow, remaining, isFullPay } = getCostBreakdown(form, services, getDefaultDownPaymentPercent(downPaymentPercentages), 0, promos);
  const isNoDownPayment = dpPercent === 0;
  // The very first, remote payment can't reasonably be Cash or Cheque - both need
  // a physical handoff that hasn't happened yet at this point in the flow.
  // Everything else the admin has configured (GCash, Bank Transfer, ...) is fair game.
  const firstPaymentMethods = paymentMethods.filter((m) => !['Cash', 'Cheque'].includes(m.name));

const handleSubmitPayment = ({ proof, referenceNumber }) => {
    setForm({ ...form, paymentStatus: PAYMENT_STATUS.TO_VERIFY, proofFile: proof?.name || null, proofFileObj: proof || null, referenceNumber: referenceNumber || '' });
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
            discountAmount,
            discountLabel,
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

          {/* Down Payment - 2×2 radio grid (return customers get an extra 0% option) */}
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

          <DiscountOption form={form} setForm={setForm} idRequired />

          {/* Nothing is due right now for a 0% down payment - no payment mode or
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

              {/* Mode for 2nd Payment - hidden when Full Payment */}
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
              <span>{li.type || '-'} × {li.quantity}</span>
              <span>₱{li.subtotal.toLocaleString()}.00</span>
            </div>
          ))}
          <div className="cost-divider" />

          {discountAmount > 0 && (
            <div className="cost-row"><span>{discountLabel}</span><span>-₱{discountAmount.toLocaleString()}.00</span></div>
          )}
          <div className="cost-row"><span>Total Price</span><span>₱{basePrice.toLocaleString()}.00</span></div>
          {form.discountType && (
            <p className="customer-book-service-x3">
              Senior/PWD discount requested. It is applied once our team approves your ID. A promo and this discount do not stack: you get whichever is larger.
            </p>
          )}
          <div className="cost-row"><span>Down Payment</span><span>{dpPercent}%</span></div>
          <div className="cost-row"><span>To Pay Now</span><span>₱{toPayNow.toLocaleString()}.00</span></div>
          <div className="cost-row"><span>Remaining Balance</span><span>₱{remaining.toLocaleString()}.00</span></div>

          <div className="cost-divider" />

          {isNoDownPayment ? (
            <p className="customer-book-service-x4">
              As a return customer, no down payment is required. The full amount will be due upon completion of service.
            </p>
          ) : (
            <>
              <div className="cost-row">
                <span>Payment Status</span>
                <span className={form.paymentStatus === PAYMENT_STATUS.FULLY_PAID ? 'cost-status-paid' : 'cost-status-unpaid'}>
                  {PAYMENT_STATUS_LABELS[form.paymentStatus] || form.paymentStatus || PAYMENT_STATUS.UNPAID}
                </span>
              </div>
              <div className="cost-row">
                <span>Proof of Payment</span>
                <span className="cost-link">{form.proofFile || '-'}</span>
              </div>
              {form.referenceNumber && (
                <div className="cost-row">
                  <span>Reference Number</span>
                  <span>{form.referenceNumber}</span>
                </div>
              )}

              <button
                className="pay-down-btn"
                onClick={() => setShowModal(true)}
                disabled={!form.paymentMode}
              >
                Pay Downpayment
              </button>

              {form.paymentStatus !== PAYMENT_STATUS.TO_VERIFY && form.paymentStatus !== PAYMENT_STATUS.FULLY_PAID && (
                <p className="customer-book-service-x5">
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
export function Step5({ form, services, technicians, downPaymentPercentages, discountPercent = 0, promos = [] }) {
  const { selected, lineItems, basePrice, discountAmount, discountLabel, dpPercent, toPayNow, remaining, isFullPay } = getCostBreakdown(form, services, getDefaultDownPaymentPercent(downPaymentPercentages), discountPercent, promos);
  const techName = technicians.find((t) => t._id === form.technician)?.name || 'No preference';

  return (
    <div className="bs-card booking-summary">
      <h3 className="bs-card-title">Booking Summary</h3>
      <div className="summary-grid">
        <div>
          <p className="summary-section-title">Service Details</p>
          <div className="summary-row"><span>Service</span><span>{selected?.label || '-'}</span></div>
          {lineItems.map((li, i) => (
            <div className="summary-row" key={i}>
              <span>Unit {i + 1}</span>
              <span>{li.quantity}× {li.type || '-'}{li.brandModel ? ` - ${li.brandModel}` : ''}</span>
            </div>
          ))}
          <div className="summary-row"><span>Date &amp; Time</span><span>{form.date ? `${form.date}, ${form.time || ''}` : '-'}</span></div>
          <div className="summary-row"><span>Address</span><span>{form.address || '-'}</span></div>
          <div className="summary-row"><span>Contact Number</span><span>{form.contactNumber || 'N/A'}</span></div>
          <div className="summary-row"><span>Preferred Tech</span><span>{techName}</span></div>
          {selected?.serviceType === SERVICE_TYPE.INSTALLATION && (
            <div className="summary-row">
              <span>Unit Source</span>
              <span>{form.clientSuppliedUnit ? 'My Own Unit (waiver signed)' : 'CZA-Supplied Unit'}</span>
            </div>
          )}
        </div>
        <div>
          <p className="summary-section-title">Payment Details</p>
          {discountAmount > 0 && (
            <div className="summary-row">
              <span>{discountLabel}</span>
              <span>-₱{discountAmount.toLocaleString()}.00</span>
            </div>
          )}
          {form.discountType && discountPercent === 0 && (
            <div className="summary-row">
              <span>{form.discountType === 'PWD' ? 'PWD' : 'Senior Citizen'} Discount</span>
              <span>Pending approval</span>
            </div>
          )}
          <div className="summary-row"><span>Total Price</span><span>₱{basePrice.toLocaleString()}.00</span></div>
          <div className="summary-row"><span>Down Payment</span><span>{dpPercent}%</span></div>
          <div className="summary-row"><span>To Pay Now</span><span>₱{toPayNow.toLocaleString()}.00</span></div>
          <div className="summary-row total"><span>Remaining Balance</span><span>₱{remaining.toLocaleString()}.00</span></div>
          <div className="summary-row"><span>Payment Mode</span><span>{form.paymentMode || '-'}</span></div>
          {!isFullPay && (
            <div className="summary-row"><span>2nd Payment Mode</span><span>{form.paymentMode2 || '-'}</span></div>
          )}
        </div>
      </div>
      <p className="summary-note">
        <FiClock /> Service is typically completed within <strong>1–3 days</strong> after confirmation.<br />
        You can cancel before the service starts. Cancelling on the day of the service may include a dispatch charge deduction from your refund. A new service date must be at least <strong>3 days</strong> from today.
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
  const { paymentMethods, downPaymentPercentages, ready: paymentSettingsReady, failed: paymentSettingsFailed, refetch: refetchPaymentSettings } = usePaymentSettings();
  const { promos } = usePublicPromos();
  const navigate = useNavigate();
  const { notice, showNotice, clearNotice } = useNotice();
  const [step, setStep] = useState(1);

  const [form, setForm] = useState({
    service: '',
    units: [],
    problemDescription: '',
    date: '',
    time: '',
    technician: '',
    address: '',
    contactNumber: getAccountPhone(),
    discountType: '',
    discountIdFileObj: null,
    downPaymentPercent: null,
    paymentMode: '',
    paymentMode2: '',
  });

  // Start on the first configured down payment option rather than a hardcoded value.
  useEffect(() => {
    if (paymentSettingsReady && form.downPaymentPercent == null) {
      setForm((prev) => ({ ...prev, downPaymentPercent: getDefaultDownPaymentPercent(downPaymentPercentages) }));
    }
  }, [paymentSettingsReady, downPaymentPercentages, form.downPaymentPercent]);

  const stepLabels = ['Choose Service', 'Unit Details', 'Location & Schedule', 'Payment', 'Booking Summary'];

const canNext = () => {
    if (step === 1) return !!form.service;
    if (step === 2) {
      const units = form.units || [];
      if (units.length === 0) return false;
      if (units.some((u) => !u.type || !Number.isInteger(u.quantity) || u.quantity < 1 || u.quantity > MAX_UNIT_QUANTITY)) return false;
      const selectedService = services.find((s) => s.id === form.service);
      const isInstallation = selectedService?.serviceType === SERVICE_TYPE.INSTALLATION;
      if (isInstallation && form.clientSuppliedUnit) {
        const accountName = getAccountName();
        const waiverNameMatches = (form.unitWaiverName || '').trim().toLowerCase() === accountName.trim().toLowerCase();
        return !!form.unitWaiverAcknowledged && waiverNameMatches;
      }
      return true;
    }
    if (step === 3) {
      if (!form.date || !form.time || !form.address || !isValidContactNumber(form.contactNumber)) return false;
      return form.date >= earliestBookingKey(3); // both are Manila day keys, so a plain comparison is right
    }
    if (step === 4) {
      const { dpPercent } = getCostBreakdown(form, services, getDefaultDownPaymentPercent(downPaymentPercentages));
      if (form.discountType && !form.discountIdFileObj) return false;
      if (dpPercent === 0) return true;
      return form.paymentStatus === PAYMENT_STATUS.TO_VERIFY || form.paymentStatus === PAYMENT_STATUS.FULLY_PAID;
    }
    return true;
  };

 const handleConfirmBooking = async () => {
    try {
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
      formData.append('contactNumber', form.contactNumber || '');
      if (form.poNumber) formData.append('poNumber', form.poNumber);
      formData.append('clientSuppliedUnit', form.clientSuppliedUnit || false);
      if (form.clientSuppliedUnit) {
        formData.append('unitWaiverAcknowledged', form.unitWaiverAcknowledged || false);
        formData.append('unitWaiverName', form.unitWaiverName || '');
      }
      formData.append('downPaymentPercent', form.downPaymentPercent);
      formData.append('paymentMode', form.paymentMode || '');
      formData.append('paymentMode2', form.paymentMode2 || '');
      formData.append('paymentStatus', form.paymentStatus || PAYMENT_STATUS.UNPAID);
      if (form.lastCleanedOver6MonthsAgo !== undefined) {
        formData.append('lastCleanedOver6MonthsAgo', form.lastCleanedOver6MonthsAgo);
        formData.append('isActivelyLeaking', form.isActivelyLeaking);
      }
      if (form.proofFileObj) formData.append('proof', form.proofFileObj);
      if (form.referenceNumber) formData.append('referenceNumber', form.referenceNumber);
      if (form.discountType) {
        formData.append('discountType', form.discountType);
        if (form.discountIdFileObj) formData.append('discountId', form.discountIdFileObj);
      }

      const data = await createBooking(formData);

      navigate(`/customer/book_details/${data.bookingId}`, { state: { booking: data } });
    } catch (err) {
      showNotice(err instanceof ApiError ? err.message || 'Failed to create booking' : 'Could not connect to server. Is the backend running?');
    }
  };

  return (
    <CustomerLayout title="Book Service">
      <Notice message={notice} onClose={clearNotice} />
      <h1 className="dashboard-welcome">Tell us what you need</h1>

      <StepIndicator current={step} />

      {loading ? (
        <p>Loading services...</p>
      ) : (
        <>
          {step === 1 && <Step1 form={form} setForm={setForm} services={services} />}
          {step === 2 && <Step2 form={form} setForm={setForm} services={services} />}
          {step === 3 && <Step3 form={form} setForm={setForm} technicians={technicians} />}
          {step >= 4 && !paymentSettingsReady && (
            paymentSettingsFailed
              ? <PaymentSettingsUnavailable onRetry={refetchPaymentSettings} />
              : <p>Loading payment settings...</p>
          )}
          {step === 4 && paymentSettingsReady && (
            <Step4
              form={form}
              setForm={setForm}
              services={services}
              isReturnCustomer={isReturnCustomer}
              paymentMethods={paymentMethods}
              downPaymentPercentages={downPaymentPercentages}
              promos={promos}
            />
          )}
          {step === 5 && paymentSettingsReady && <Step5 form={form} services={services} technicians={technicians} downPaymentPercentages={downPaymentPercentages} promos={promos} />}
        </>
      )}

      <div className="bs-nav-row">
        <span className="bs-step-label">
          Step {step} of {TOTAL_STEPS} - {stepLabels[step - 1]}
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
              disabled={!canNext() || (step >= 4 && !paymentSettingsReady)}
            >
              {step === 4 ? <>Book <FiArrowRight /></> : <>Next <FiArrowRight /></>}
            </button>
          ) : (
            <button className="bs-next-btn" onClick={handleConfirmBooking} disabled={!paymentSettingsReady}
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
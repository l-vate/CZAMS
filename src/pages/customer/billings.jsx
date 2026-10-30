import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerLayout from './customer_layout';
import PaymentModal from '../../components/payment_modal';
import ReceiptModal from '../../components/receipt_modal';
import { FiClock, FiFileText, FiCreditCard, FiEye } from 'react-icons/fi';
import { getBookingLineItems, getPaymentBreakdown } from '../../utils/bookingPricing';
import { usePaymentSettings } from '../../utils/paymentSettings';
import PaymentSettingsUnavailable from '../../components/payment_settings_unavailable';
import { getFilterPillStyle, textOnFill } from '../../utils/statusColors';
import { ApiError } from '../../services/apiClient';
import { listMyBookings } from '../../services/bookingService';
import { submitPayment, submitBalancePayment } from '../../services/paymentService';
import { BOOKING_STATUS } from '../../constants/bookingStatus';
import { PAYMENT_STATUS, BALANCE_PAYMENT_STATUS } from '../../constants/paymentStatus';
import { REFUND_STATUS } from '../../constants/refundStatus';
import { customerPaymentStatus, rejectionReasonOf, billMatchesFilter, BILL_FILTERS } from '../../utils/customerPayment';

import Notice from '../../components/notice';
import { useNotice } from '../../hooks/useNotice';
import LoadError from '../../components/load_error';
function Billings() {
  const navigate = useNavigate();
  const [showPayment, setShowPayment] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const { notice, showNotice, clearNotice } = useNotice();
  const [paymentType, setPaymentType] = useState('downpayment'); // 'downpayment' | 'balance'
  const { paymentMethods, ready: paymentSettingsReady, failed: paymentSettingsFailed, refetch: refetchPaymentSettings } = usePaymentSettings();

  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');

  const filters = BILL_FILTERS;

  const fetchBookings = () => {
    listMyBookings()
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Unexpected bookings reply');
        const mapped = data.map((b) => {

          const isPartiallyPaid = b.paymentStatus === PAYMENT_STATUS.PARTIALLY_PAID;
          const isToVerify = b.paymentStatus === PAYMENT_STATUS.TO_VERIFY;
          const isRejected = b.paymentStatus === PAYMENT_STATUS.REJECTED || b.paymentStatus === 'Rejected';

          // Balance-track status is tracked independently of the down-payment paymentStatus above.
          const isBalanceToVerify = b.balancePaymentStatus === BALANCE_PAYMENT_STATUS.TO_VERIFY;
          const isBalanceRejected = b.balancePaymentStatus === BALANCE_PAYMENT_STATUS.REJECTED;
          const isBalancePaid = b.balancePaymentStatus === BALANCE_PAYMENT_STATUS.PAID || b.balancePaid;

          // A booking is fully paid once paymentStatus says so directly, OR once the down
          // payment was accepted and the balance has separately been settled - this second
          // check is a safety net for records saved before paymentStatus was also bumped
          // to 'fully_paid' on balance approval.
          const isFullyPaid = b.paymentStatus === PAYMENT_STATUS.FULLY_PAID || b.paymentStatus === 'Paid' || (isPartiallyPaid && isBalancePaid);

          // Once a booking is cancelled, paymentStatus reflects whatever it happened
          // to be right before cancellation and no longer means what it used to - a
          // processed refund or the cancellation itself overrides it below.
          const isRefunded = b.refund?.status === REFUND_STATUS.PROCESSED;
          const isCancelled = b.status === BOOKING_STATUS.CANCELLED;
          const isRefundPending = isCancelled && b.refund?.status === REFUND_STATUS.PENDING;

          let status = customerPaymentStatus(b).label;
          if (isRefunded) status = 'Refunded';
          else if (isCancelled && b.refund?.status === REFUND_STATUS.REJECTED) status = 'Cancelled – Refund Rejected';
          else if (isRefundPending) status = 'Cancelled – Refund Pending';
          else if (isCancelled) status = 'Cancelled';

          // A small secondary note describing where the balance payment stands,
          // shown alongside the main status once the down payment has been accepted.
          let balanceNote = null;
          if (isBalanceRejected) {
            balanceNote = { text: 'Balance Rejected - please resubmit', tone: 'danger' };
          } else if (isBalanceToVerify) {
            balanceNote = { text: 'Balance: To Verify', tone: 'warning' };
          }

          const paid = isFullyPaid || isPartiallyPaid || isToVerify;

          const { lineItems, basePrice, discountAmount, discountLabel } = getBookingLineItems(b);
          // The stored percent, as is: a booking with none shows "Not set" in the modals.
          const dpPercent = b.downPaymentPercent ?? null;
          const { downPayment: toPayNow, balance: remaining } = getPaymentBreakdown(b);

          return {
            id: b.bookingId,
            service: b.service?.name || b.service?.category || '-',
            // the owner has not confirmed the unit yet (worked out by the server), so nothing is due
            awaitingConfirmation: Boolean(b.paymentDue?.waitingForUnit),
            due: b.paymentDue || { kind: null, amount: 0 },
            rejectionReason: rejectionReasonOf(b),
            customerName: storedUser.name || '-',
            address: b.address,
            contactNumber: storedUser.phone || '-',
            paymentMode: b.paymentMode,
            paymentMode2: b.paymentMode2,
            proofFile: b.proofFile,
            balanceProofFile: b.balanceProofFile,
            referenceNumber: b.referenceNumber,
            balanceReferenceNumber: b.balanceReferenceNumber,
paymentStatus: b.paymentStatus,
            balancePaymentStatus: b.balancePaymentStatus,
            downPaymentPercent: dpPercent,
            balancePaid: b.balancePaid,
            createdAt: b.createdAt,
            paid,
            isFullyPaid,
            isPartiallyPaid,
            isToVerify,
            isRejected,
            isBalanceToVerify,
            isBalanceRejected,
            isBalancePaid,
            isRefunded,
            isCancelled,
            isRefundPending,
            isBackJob: !!b.isBackJob,
            isCommercial: b.isCommercial,
            vatAmount: b.vatAmount,
            poNumber: b.poNumber,
            paymentTermsDays: b.paymentTermsDays,
            paymentDueAt: b.paymentDueAt,
            balanceNote,
            status,
            date: new Date(b.createdAt).toLocaleDateString('en-US'),
            basePrice,
            lineItems,
            toPayNow,
            remaining,
            discountAmount,
            discountLabel,
            raw: b,
          };
        });
        setBills(mapped);
        setFailed(false);
        setLoading(false);
      })
      .catch(() => { setFailed(true); setLoading(false); }); // an error with a Retry, never "No matching bills"
  };

  const retry = () => {
    setFailed(false);
    setLoading(true);
    fetchBookings();
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const filteredBills = bills
    .filter((bill) => billMatchesFilter(bill, activeFilter))
    .filter((bill) => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        bill.id.toLowerCase().includes(term) ||
        bill.service.toLowerCase().includes(term) ||
        bill.customerName.toLowerCase().includes(term) ||
        String(bill.basePrice).includes(term.replace(/[₱,\s]/g, ''))
      );
    });

  // the down payments and balances that are due right now, newest first
  const dueBills = bills.filter((bill) => bill.due.kind && !bill.isCancelled && !bill.isBackJob && !bill.awaitingConfirmation)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const BILL_STATUS_ORDER = { unpaid: 0, partial: 1, paid: 2 };
  const isCancelledBill = (bill) => bill.isCancelled || bill.isRefunded;
  const sortedBills = [...filteredBills].sort((a, b) => {
    const rankOf = (bill) => {
      if (isCancelledBill(bill)) return 3; // cancelled and refunded bills always come last
      if (bill.isFullyPaid) return BILL_STATUS_ORDER.paid;
      if (bill.isPartiallyPaid) return BILL_STATUS_ORDER.partial;
      return BILL_STATUS_ORDER.unpaid;
    };
    const rankA = rankOf(a);
    const rankB = rankOf(b);
    if (rankA !== rankB) return rankA - rankB;
    return new Date(b.createdAt) - new Date(a.createdAt); // newest first within same group
  });
  const lastActiveBillIndex = sortedBills.reduce((last, bill, i) => (isCancelledBill(bill) ? last : i), -1);

  // Payment-status colors, converged with admin.css's .status-pill--* (same
  // tokens from index.css) so the two files can't drift apart again: Partially
  // Paid and To Verify now match admin's existing blue/amber choices rather than
  // keeping their own (this file previously had them swapped - To Verify was
  // blue, Partially Paid was amber). Cancelled is a deliberately neutral gray,
  // not red - see the --payment-cancelled-* comment in index.css for why.
  const getStatusColor = (bill) => {
    if (bill.isRefunded) return 'var(--payment-refunded-txt)';
    if (bill.isCancelled) return 'var(--payment-cancelled-txt)';
    if (bill.isFullyPaid) return 'var(--success)';
    if (bill.isPartiallyPaid) return 'var(--primary)';
    if (bill.isToVerify) return 'var(--warning)';
    return 'var(--danger)';
  };

  const handlePaymentSubmit = async ({ proof, referenceNumber }) => {
    try {
      await submitPayment(selectedBill.id, proof, referenceNumber);

      setShowPayment(false);
      fetchBookings();
    } catch (err) {
      showNotice(err instanceof ApiError ? err.message || 'Failed to submit payment' : 'Could not connect to server.');
    }
  };

  const handleBalancePaymentSubmit = async ({ proof, referenceNumber }) => {
    try {
      await submitBalancePayment(selectedBill.id, proof, referenceNumber);

      setShowPayment(false);
      fetchBookings();
    } catch (err) {
      showNotice(err instanceof ApiError ? err.message || 'Failed to submit payment' : 'Could not connect to server.');
    }
  };

  return (
    <CustomerLayout
      title="Billings"
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder="Search by ID, service, or price..."
    >
      <div className="customer-billings-x1">
        {paymentSettingsFailed && <PaymentSettingsUnavailable onRetry={refetchPaymentSettings} />}
        <div className="customer-billings-x2">
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`filter-pill ${activeFilter === filter ? 'filter-pill--active' : ''}`}
              style={getFilterPillStyle(filter, activeFilter === filter)}
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <Notice message={notice} onClose={clearNotice} />
      {loading ? (
        <p>Loading bills...</p>
      ) : failed ? (
        <LoadError message="Could not load your bills." onRetry={retry} />
      ) : sortedBills.length === 0 ? (
        <p className="customer-billings-x3">No matching bills found.</p>
      ) : (
        <>
        {dueBills.length > 0 && ['All', 'Due'].includes(activeFilter) && (
          <section className="billing-due" aria-label="Due now">
            <h3 className="billing-due-title">Due now</h3>
            <ul className="billing-due-list">
              {dueBills.map((bill) => (
                <li key={bill.id} className="billing-due-row">
                  <div className="billing-due-info">
                    <strong>{bill.service}</strong>
                    <small>{bill.id} · {bill.due.kind === 'balance' ? 'Remaining balance' : 'Down payment'}</small>
                  </div>
                  <span className="billing-due-amount">₱{(bill.due.kind === 'balance' ? bill.remaining : bill.toPayNow).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <button
                    type="button"
                    className="bs-next-btn customer-billings-x9"
                    disabled={!paymentSettingsReady}
                    onClick={() => { setSelectedBill(bill); setPaymentType(bill.due.kind === 'balance' ? 'balance' : 'downpayment'); setShowPayment(true); }}
                  >
                    <FiCreditCard size={14} /> Pay Now
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="tech-job-list">
          {sortedBills.map((bill, i) => {
            // what is due comes from the server (utils/paymentDue.js): the down payment once it is owed, the balance once the service is complete.
            // A balance that already exists can still be paid earlier, as before.
            const payDown = bill.due.kind === 'down';
            const payBalance = bill.due.kind === 'balance' || (bill.isPartiallyPaid && !bill.isBalancePaid && !bill.isBalanceToVerify && !bill.isCancelled);
            const waitingForConfirmation = bill.awaitingConfirmation && !bill.isCancelled; // an installation is paid after our team confirms the unit
            const canPay = (payDown || payBalance) && !waitingForConfirmation;
            const openPayment = () => {
              setSelectedBill(bill);
              setPaymentType(payDown ? 'downpayment' : 'balance');
              setShowPayment(true);
            };
            return (
            <div key={bill.id}>
              {i === lastActiveBillIndex + 1 && isCancelledBill(bill) && (
                <div className="customer-my-bookings-x4">
                  <div className="customer-my-bookings-x5" />
                  CANCELLED
                  <div className="customer-my-bookings-x5" />
                </div>
              )}
            <div
              className={`tech-job-card ${isCancelledBill(bill) ? 'tech-job-card--dimmed' : ''}`}
              style={{ borderLeftColor: bill.isBackJob ? 'var(--success)' : getStatusColor(bill) }}
            >
              <div className="tech-job-info">
                <div className="tech-job-top-row customer-billings-x4">
                  <small className="tech-job-date-label">{bill.date}</small>
                  <span
                    className="tech-job-status-badge"
                    style={{ background: bill.isBackJob ? 'var(--success)' : getStatusColor(bill), color: textOnFill(bill.isBackJob ? 'var(--success)' : getStatusColor(bill)) }}
                  >
                    {bill.isBackJob ? 'Free (Back Job)' : bill.status}
                  </span>
                  {bill.balanceNote && (
                    <span className={`customer-billings-x5 balance-note--${bill.balanceNote.tone}`}>
                      {bill.balanceNote.text}
                    </span>
                  )}
                </div>

                <div className="tech-job-service">{bill.service}</div>
                <small className="tech-job-booking">{bill.id}</small>
                {bill.isRejected && !bill.isCancelled && (
                  <p className="customer-billings-x6">
                    {bill.rejectionReason ? `Payment rejected: ${bill.rejectionReason}. Please send a new proof.` : 'Payment rejected. Please send a new proof.'}
                  </p>
                )}
                {waitingForConfirmation && (
                  <p className="customer-billings-x6 customer-billings-wait">
                    We are confirming the unit. You will be asked to pay your down payment once it is confirmed.
                  </p>
                )}
              </div>

              <div className="tech-job-meta">
                <FiClock /> {bill.date}
              </div>

              <div className="tech-job-meta">
                Price: ₱{(bill.basePrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>

              <div className="customer-billings-x7">
                {waitingForConfirmation ? (
                  <button type="button" className="view-details-btn" disabled title="Our team has to confirm the unit first">
                    <FiClock size={14} /> Confirming your unit
                  </button>
                ) : canPay ? (
                  <button
                    type="button"
                    className="bs-next-btn customer-billings-x9"
                    onClick={openPayment}
                    disabled={!paymentSettingsReady}
                  >
                    <FiCreditCard size={14} /> {bill.isRejected || bill.isBalanceRejected ? 'Resubmit' : 'Pay Now'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="view-details-btn"
                    onClick={() => navigate(`/customer/book_details/${bill.id}`)}
                  >
                    <FiEye size={14} /> View Details
                  </button>
                )}

                {bill.isFullyPaid && !bill.isCancelled && (
                  <button
                    className="customer-billings-x8"
                    onClick={() => {
                      setSelectedBill(bill);
                      setShowReceipt(true);
                    }}
                  >
                    <FiFileText size={14} /> Invoice
                  </button>
                )}
              </div>
            </div>
            </div>
            );
          })}
        </div>
        </>
      )}

      {showPayment && selectedBill && (
        <PaymentModal
          form={selectedBill}
          paymentType={paymentType}
          paymentMethods={paymentMethods}
          onClose={() => setShowPayment(false)}
          onSubmit={paymentType === 'balance' ? handleBalancePaymentSubmit : handlePaymentSubmit}
        />
      )}

      {showReceipt && selectedBill && (
        <ReceiptModal
          form={selectedBill}
          booking={selectedBill}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </CustomerLayout>
  );
}

export default Billings;
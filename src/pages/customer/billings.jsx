import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerLayout from './customer_layout';
import PaymentModal from '../../components/payment_modal';
import ReceiptModal from '../../components/receipt_modal';
import { FiClock, FiMapPin, FiFileText, FiCreditCard, FiEye } from 'react-icons/fi';
import { getBookingLineItems, getPaymentBreakdown } from '../../utils/bookingPricing';
import { usePaymentSettings } from '../../utils/paymentSettings';
import PaymentSettingsUnavailable from '../../components/payment_settings_unavailable';
import { getFilterPillStyle } from '../../utils/statusColors';
import { ApiError, orFallback } from '../../services/apiClient';
import { listMyBookings } from '../../services/bookingService';
import { submitPayment, submitBalancePayment } from '../../services/paymentService';
import { BOOKING_STATUS } from '../../constants/bookingStatus';
import { PAYMENT_STATUS, BALANCE_PAYMENT_STATUS } from '../../constants/paymentStatus';
import { REFUND_STATUS } from '../../constants/refundStatus';

function Billings() {
  const navigate = useNavigate();
  const [showPayment, setShowPayment] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paymentType, setPaymentType] = useState('downpayment'); // 'downpayment' | 'balance'
  const { paymentMethods, ready: paymentSettingsReady, failed: paymentSettingsFailed, refetch: refetchPaymentSettings } = usePaymentSettings();

  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');

  const filters = ['All', 'To Verify', 'Partially Paid', 'Fully Paid', 'Unpaid', 'Refunded'];

  const fetchBookings = () => {
    orFallback(listMyBookings(), [])
      .then((data) => {
        const mapped = (Array.isArray(data) ? data : []).map((b) => {

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

          let status = 'Unpaid';
          if (isRefunded) status = 'Refunded';
          else if (isRefundPending) status = 'Cancelled – Refund Pending';
          else if (isCancelled) status = 'Cancelled';
          else if (isFullyPaid) status = 'Fully Paid';
          else if (isPartiallyPaid) status = 'Partially Paid';
          else if (isToVerify) status = 'To Verify';
          else if (isRejected) status = 'Rejected';

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
            customerName: storedUser.name || '-',
            address: b.address,
            contactNumber: storedUser.phone || '-',
            paymentMode: b.paymentMode,
            paymentMode2: b.paymentMode2,
            proofFile: b.proofFile,
            balanceProofFile: b.balanceProofFile,
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
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const filteredBills = bills
    .filter((bill) => {
      if (activeFilter === 'All') return true;
      if (activeFilter === 'Refunded') return bill.isRefunded;
      if (bill.isCancelled) return false; // cancelled bookings (refunded excepted above) only show under "All" - their old paymentStatus no longer applies
      // A back-job follow-up is free (0% down, nothing to pay) - there's nothing to
      // bill, so like Cancelled/Refunded it only shows under "All", not alongside
      // real payable bookings in the normal status tabs.
      if (bill.isBackJob) return false;
      if (activeFilter === 'To Verify') return bill.isToVerify || bill.isBalanceToVerify;
      if (activeFilter === 'Fully Paid') return bill.isFullyPaid;
      if (activeFilter === 'Partially Paid') return bill.isPartiallyPaid;
      if (activeFilter === 'Unpaid') return bill.paymentStatus === PAYMENT_STATUS.UNPAID || bill.isRejected;
      return true;
    })
    .filter((bill) => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        bill.id.toLowerCase().includes(term) ||
        bill.service.toLowerCase().includes(term) ||
        bill.customerName.toLowerCase().includes(term) ||
        bill.address.toLowerCase().includes(term)
      );
    });

  const BILL_STATUS_ORDER = { unpaid: 0, partial: 1, paid: 2 };
  const sortedBills = [...filteredBills].sort((a, b) => {
    const rankOf = (bill) => {
      if (bill.isFullyPaid) return BILL_STATUS_ORDER.paid;
      if (bill.isPartiallyPaid) return BILL_STATUS_ORDER.partial;
      return BILL_STATUS_ORDER.unpaid;
    };
    const rankA = rankOf(a);
    const rankB = rankOf(b);
    if (rankA !== rankB) return rankA - rankB;
    return new Date(b.createdAt) - new Date(a.createdAt); // newest first within same group
  });

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

  const handlePaymentSubmit = async ({ proof }) => {
    try {
      await submitPayment(selectedBill.id, proof);

      setShowPayment(false);
      fetchBookings();
    } catch (err) {
      alert(err instanceof ApiError ? err.message || 'Failed to submit payment' : 'Could not connect to server.');
    }
  };

  const handleBalancePaymentSubmit = async ({ proof }) => {
    try {
      await submitBalancePayment(selectedBill.id, proof);

      setShowPayment(false);
      fetchBookings();
    } catch (err) {
      alert(err instanceof ApiError ? err.message || 'Failed to submit payment' : 'Could not connect to server.');
    }
  };

  return (
    <CustomerLayout
      title="Billings"
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder="Search by ID, service, or address..."
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

      {loading ? (
        <p>Loading bills...</p>
      ) : sortedBills.length === 0 ? (
        <p className="customer-billings-x3">No matching bills found.</p>
      ) : (
        <div className="tech-job-list">
          {filteredBills.map((bill) => (
            <div
              key={bill.id}
              className="tech-job-card"
              style={{ borderLeftColor: bill.isBackJob ? 'var(--success)' : getStatusColor(bill) }}
            >
              <div className="tech-job-info">
                <div className="tech-job-top-row customer-billings-x4">
                  <small className="tech-job-date-label">{bill.date}</small>
                  <span
                    className="tech-job-status-badge"
                    style={{ background: bill.isBackJob ? 'var(--success)' : getStatusColor(bill) }}
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
                    Rejected - please resubmit
                  </p>
                )}
              </div>

              <div className="tech-job-meta">
                <FiClock /> {bill.date}
              </div>

              <div className="tech-job-meta">
                <FiMapPin /> {bill.address}
              </div>

              <div className="customer-billings-x7">
                <button
                  type="button"
                  className="view-details-btn"
                  onClick={() => navigate(`/customer/book_details/${bill.id}`)}
                >
                  <FiEye size={14} /> View Details
                </button>

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

                {!bill.paid && !bill.isCancelled && !bill.isBackJob && (
                  <button
                    type="button"
                    className="bs-next-btn customer-billings-x9"
                    onClick={() => {
                      setSelectedBill(bill);
                      setPaymentType('downpayment');
                      setShowPayment(true);
                    }}
                    disabled={!paymentSettingsReady}
                  >
                    <FiCreditCard size={14} /> {bill.isRejected ? 'Resubmit' : 'Settle'}
                  </button>
                )}

                {bill.isPartiallyPaid && !bill.isBalancePaid && !bill.isCancelled && (
                  <button
                    type="button"
                    className="bs-next-btn customer-billings-x9"
                    onClick={() => {
                      setSelectedBill(bill);
                      setPaymentType('balance');
                      setShowPayment(true);
                    }}
                    disabled={bill.isBalanceToVerify || !paymentSettingsReady}
                  >
                    <FiCreditCard size={14} /> {bill.isBalanceRejected ? 'Resubmit Balance' : 'Pay Balance'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
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
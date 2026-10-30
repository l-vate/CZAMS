import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import CustomerLayout from './customer_layout';
import ReceiptModal from '../../components/receipt_modal';
import FeedbackModal from '../../components/feedback_modal';
import BackJobModal from '../../components/back_job_modal';
import ServiceReportViewer from '../../components/service_report_viewer';
import { getBookingLineItems, getPaymentBreakdown, formatPeso } from '../../utils/bookingPricing';
import QuotationTerms from '../../components/quotation_terms';
import { vatInside } from '../../utils/quotationTerms';
import { getMemberNames } from '../../utils/assignments';
import { manilaTodayKey } from '../../utils/manilaTime';
import { bookingWindow, bookingDateProblem } from '../../utils/dateRules';
import { bookingHeading } from '../../utils/bookingHeading';
import { cancelRuleNote } from '../../config/cancellation';
import { usePaymentSettings, getDefaultDownPaymentPercent } from '../../utils/paymentSettings';
import PaymentModal from '../../components/payment_modal';
import { unitChangeOf } from '../../utils/suppliedUnitChoice';
import { submitPayment, submitBalancePayment } from '../../services/paymentService';
import { PAYMENT_STATUS, BALANCE_PAYMENT_STATUS } from '../../constants/paymentStatus';
import {
  FiCheck, FiBell, FiPrinter,
  FiCalendar, FiClock, FiMapPin, FiInfo, FiCreditCard,
  FiUser, FiAlertTriangle, FiX, FiArrowRight, FiStar, FiPhone, FiFileText, FiMessageCircle,
} from 'react-icons/fi';
import { ApiError, orFallback } from '../../services/apiClient';
import { getBooking, cancelBooking, rescheduleBooking, submitFeedback, requestDiscount } from '../../services/bookingService';
import ClosureDateInput from '../../components/closure_date_input';
import { isBookingFullyPaid } from '../../utils/receiptData';
import DiscountOption from '../../components/discount_option';
import { flagRefund, confirmRefundReceived } from '../../services/refundService';
import { getBackJobForBooking, reportBackJob } from '../../services/backJobService';
import { listNotifications } from '../../services/notificationService';
import { BOOKING_STATUS } from '../../constants/bookingStatus';
import { REFUND_STATUS } from '../../constants/refundStatus';
import { TIME_BLOCK_VALUES } from '../../constants/timeBlocks';
import { NOTIFICATION_TYPE } from '../../constants/notificationTypes';
import { ProofLink } from '../../components/proof_file';
import { warrantyStatusText } from '../../utils/warrantyText';

import Notice from '../../components/notice';
import EmailStatusCard from '../../components/email_status_card';
import { NoShowCustomerCard } from '../../components/no_show_panels';
import { refundText, refundFigures, cancelledByText } from '../../utils/cancelledSummary';
import { useNotice } from '../../hooks/useNotice';
const storedUser = JSON.parse(localStorage.getItem('user') || '{}');

const FEEDBACK_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// 'create' if no feedback yet, 'edit' within the 24h window, 'view' (read-only) after it, or null if not eligible
function getFeedbackAction(booking) {
  if (booking.status !== BOOKING_STATUS.COMPLETED) return null;
  const fb = booking.feedback;
  if (!fb?.rating) return 'create';
  const submittedAt = fb.createdAt ? new Date(fb.createdAt).getTime() : 0;
  return Date.now() - submittedAt <= FEEDBACK_EDIT_WINDOW_MS ? 'edit' : 'view';
}

const FEEDBACK_ACTION_LABEL = {
  create: 'Leave Feedback',
  edit: 'Edit Feedback',
  view: 'View Feedback',
};

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

// Lets a customer ask for the Senior Citizen / PWD discount after booking. Shown only while the
// booking is Pending or Approved and has no request yet, or the last one was rejected.
function DiscountRequestForm({ bookingId, onRequested }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ discountType: '', discountIdFileObj: null, discountConsent: false });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!form.discountType || !form.discountIdFileObj || !form.discountConsent) {
      setError('Choose Senior Citizen or PWD, upload a photo of a valid ID and tick the consent box.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const data = await requestDiscount(bookingId, { type: form.discountType, idFile: form.discountIdFileObj, consent: form.discountConsent });
      onRequested(data);
      setOpen(false);
      setForm({ discountType: '', discountIdFileObj: null, discountConsent: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message || 'Failed to send the discount request.' : 'Could not connect to server.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="bs-back-btn" onClick={() => setOpen(true)}>
        Request Senior/PWD discount
      </button>
    );
  }

  return (
    <div className="bs-field-group customer-book-details-x3">
      <DiscountOption form={form} setForm={setForm} idRequired appliesNow={false} optional={false} />
      {error && <p className="customer-book-details-x4">{error}</p>}
      <div className="cancel-confirm-actions">
        <button type="button" className="bs-back-btn" onClick={() => setOpen(false)} disabled={submitting}>Cancel</button>
        <button type="button" className="bs-next-btn" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Sending...' : 'Send request'}
        </button>
      </div>
    </div>
  );
}

function RescheduleModal({ booking, onClose, onSubmit, submitting }) {
  const [date, setDate] = useState(booking.date || '');
  const [time, setTime] = useState(booking.time || '');
  const needsApproval = [BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS].includes(booking.status);

  const { min: minDate, max: maxDate } = bookingWindow(); // 3 days after today to 5 months after today in Manila (utils/dateRules.js)

  const dateProblem = bookingDateProblem(date);
  const isDateValid = !dateProblem;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h4 className="modal-title">Reschedule Booking</h4>
        {needsApproval && (
          <p className="cancel-confirm-text">
            This booking is already {booking.status.toLowerCase()}, so your new date/time
            will need admin approval before it's confirmed.
          </p>
        )}

        <p className="cancel-confirm-text">A new service date must be at least <strong>3 days</strong> from today and no more than <strong>5 months</strong> ahead.</p>

        <div className="bs-field-group">
          <label className="bs-label">New Date</label>
          <ClosureDateInput min={minDate} max={maxDate} value={date} onChange={setDate} showEarliest blockFull showClosedList={false} />
          {date && dateProblem && <p className="date-problem" role="alert">{dateProblem}</p>}
        </div>

        <div className="bs-field-group">
          <label className="bs-label">New Time</label>
          <div className="time-toggle">
            {TIME_BLOCK_VALUES.map((t) => (
              <button
                key={t}
                type="button"
                className={`time-btn ${time === t ? 'selected' : ''}`}
                onClick={() => setTime(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="cancel-confirm-actions">
          <button className="bs-back-btn" onClick={onClose}>Cancel</button>
          <button
            className="bs-next-btn"
            disabled={!date || !time || !isDateValid || submitting}
            onClick={() => onSubmit({ date, time })}
          >
            {needsApproval ? 'Submit Request' : 'Confirm Reschedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CancelConfirmDialog({ onKeep, onConfirmCancel, ruleNote }) {
  return (
    <div className="modal-overlay" onClick={onKeep}>
      <div className="modal-card cancel-confirm-card" onClick={(e) => e.stopPropagation()}>
        <div className="cancel-confirm-icon"><FiAlertTriangle /></div>
        <h4 className="modal-title cancel-confirm-title">Cancel this booking?</h4>
        <p className="cancel-confirm-text">
          This action can't be undone. Your technician assignment and scheduled slot will be released.
        </p>
        <p className="cancel-confirm-text" role="note"><strong>{ruleNote}</strong></p>
        <div className="cancel-confirm-actions">
          <button className="bs-back-btn" onClick={onKeep}>Keep booking</button>
          <button className="cancel-booking-btn" onClick={onConfirmCancel}>Yes, cancel it</button>
        </div>
      </div>
    </div>
  );
}

// The confirmation screen's message right after cancelling: it states what happens to the down payment and the next step.
function RefundStatusMessage({ booking }) {
  return (
    <p className="cancelled-message">
      Your booking has been successfully cancelled. {refundText(booking)}
    </p>
  );
}

// Lets the customer tell us the refund arrived. Once only; it never stops an admin from anything.
function RefundReceivedConfirm({ bookingId, refund, onConfirmed }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (refund.status !== REFUND_STATUS.PROCESSED) return null;

  if (refund.receivedConfirmedAt) {
    return (
      <p className="cancelled-message customer-book-details-x2">
        You confirmed receiving this refund on {formatDate(refund.receivedConfirmedAt)}.
      </p>
    );
  }

  const handleConfirm = async () => {
    setSubmitting(true);
    setError('');
    try {
      onConfirmed(await confirmRefundReceived(bookingId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message || 'Failed to confirm.' : 'Could not connect to server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="customer-book-details-x3">
      <button type="button" className="bs-next-btn" onClick={handleConfirm} disabled={submitting}>
        {submitting ? 'Saving...' : 'Confirm I received the refund'}
      </button>
      {error && <p className="customer-book-details-x4">{error}</p>}
    </div>
  );
}

// Lets a customer flag a refund that hasn't come through - a single message +
// status, not a ticketing thread. Only shown once there's an actual refund case.
function RefundFlagForm({ bookingId, refund, onFlagged }) {
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isFlaggedUnresolved = refund.customerFlag?.flagged && !refund.customerFlag?.resolved;

  if (isFlaggedUnresolved) {
    return (
      <p className="cancelled-message customer-book-details-x2">
        You flagged this refund on {formatDate(refund.customerFlag.flaggedAt)} - our team will follow up with you.
      </p>
    );
  }

  const handleSubmit = async () => {
    if (!message.trim()) {
      setError('Please describe what happened.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const data = await flagRefund(bookingId, message.trim());
      onFlagged(data);
      setShowForm(false);
      setMessage('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message || 'Failed to submit report.' : 'Could not connect to server.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!showForm) {
    return (
      <button
        type="button"
        className="bs-back-btn customer-book-details-x3"
        onClick={() => setShowForm(true)}
      >
        This refund hasn't come through?
      </button>
    );
  }

  return (
    <div className="bs-field-group customer-book-details-x3">
      <label className="bs-label">Tell us what happened</label>
      <textarea
        className="bs-textarea"
        rows={3}
        placeholder="e.g. It's been marked processed but I haven't received the refund..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      {error && (
        <p className="customer-book-details-x4">{error}</p>
      )}
      <div className="cancel-confirm-actions">
        <button type="button" className="bs-back-btn" onClick={() => setShowForm(false)} disabled={submitting}>
          Cancel
        </button>
        <button type="button" className="bs-next-btn" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </div>
  );
}

export function BookingCancelled({ booking, bookingId, refund, onBookAgain, onBackToDashboard, onViewDetails, onRefundFlagged }) {
  return (
    <div className="confirmation-wrap">
      <div className="confirmation-heading">
        <span className="confirmation-cancel-icon"><FiX /></span>
        <h2>Booking Cancelled</h2>
        <p className="confirmation-id">Booking ID: {bookingId}</p>
      </div>
      <div className="bs-card cancelled-card">
        <RefundStatusMessage booking={booking} />
        {refund && refund.status !== REFUND_STATUS.NONE && (
          <RefundReceivedConfirm bookingId={bookingId} refund={refund} onConfirmed={onRefundFlagged} />
        )}
        {refund && refund.status === REFUND_STATUS.PROCESSED && (
          <RefundFlagForm bookingId={bookingId} refund={refund} onFlagged={onRefundFlagged} />
        )}
        <div className="cancelled-actions">
          <button className="bs-back-btn" onClick={onBackToDashboard}>Back to Dashboard</button>
          <button className="bs-back-btn cancelled-view-btn" onClick={onViewDetails}>View booking details</button>
          <button className="bs-next-btn" onClick={onBookAgain}>Book Another Service <FiArrowRight /></button>
        </div>
      </div>
    </div>
  );
}

// The read-only record of a cancelled booking: who cancelled it, when, why (when the owner did) and what happens to the down payment.
export function CancelledSummary({ booking, formatWhen, onBookAgain }) {
  const figures = refundFigures(booking);
  const expired = booking.expiredBySystem === true;
  return (
    <section className="bs-card cancelled-summary" aria-label={expired ? 'Expired booking' : 'Cancellation'}>
      <h3 className="bs-card-title">{expired ? 'Expired' : 'Cancellation'}</h3>
      <p className="cancelled-summary-line"><strong>{cancelledByText(booking)}</strong></p>
      {booking.cancelledAt && <p className="cancelled-summary-line">Cancelled on {formatWhen(booking.cancelledAt)}.</p>}
      {booking.cancelReason && (booking.ownerCancelled || booking.cancelledBy === 'admin' || expired) && <p className="cancelled-summary-line"><strong>Reason:</strong> {booking.cancelReason}</p>}
      {booking.noShow && ['Confirmed'].includes(booking.noShow.status) && <p className="cancelled-summary-line">You reported that the technicians did not come, and the owner confirmed it.</p>}
      <p className="cancelled-summary-line">{refundText(booking)}</p>
      {figures.length > 0 && (
        <div className="cancelled-summary-figures">
          {figures.map(([label, value]) => <div className="summary-row" key={label}><span>{label}</span><span>{value}</span></div>)}
        </div>
      )}
      {booking.refund && booking.refund.status !== REFUND_STATUS.NONE && booking.refund.status === REFUND_STATUS.PROCESSED && (
        <p className="cancelled-summary-line">This booking is closed. Nothing more can be changed on it.</p>
      )}
      {(expired || booking.noShow?.status === 'Confirmed') && onBookAgain && (
        <button type="button" className="bs-next-btn cancelled-rebook-btn" onClick={onBookAgain}>Book another service <FiArrowRight /></button>
      )}
    </section>
  );
}

function BookDetails() {
  const { bookingId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { downPaymentPercentages, paymentMethods } = usePaymentSettings();
  const { notice, showNotice, clearNotice } = useNotice();
  const [showPay, setShowPay] = useState(false);
  const [payingBalance, setPayingBalance] = useState(false); // the Pay window is for the balance after the service, not the down payment

  const [booking, setBooking] = useState(location.state?.booking || null);
  const [loading, setLoading] = useState(!location.state?.booking);
  const [showCancelConfirm, setShowCancel] = useState(false);
  // true right after this customer cancelled in this visit (the confirmation screen), until they choose to see the booking details
  const [justCancelled, setJustCancelled] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [showBackJob, setShowBackJob] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [submittingBackJob, setSubmittingBackJob] = useState(false);
  const [backJob, setBackJob] = useState(null);
  const [bookingNotification, setBookingNotification] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    getBooking(bookingId)
      .then((data) => {
        setBooking(data);
        setLoading(false);
      })
      .catch((err) => {
        // A failed load is an error state, never data: the error reply is not shown as a booking.
        setLoadError(err instanceof ApiError && err.status === 404 ? 'Booking not found.' : 'Could not load this booking. Try again.');
        setLoading(false);
      });
  }, [bookingId, reloadKey]);

  // Check whether an issue was already reported for this booking (Back Job Handling). Only a
  // completed booking can have one, so no other booking asks.
  const isCompleted = booking?.status === BOOKING_STATUS.COMPLETED;
  useEffect(() => {
    if (!isCompleted) return;
    orFallback(getBackJobForBooking(bookingId), null)
      .then((data) => setBackJob(data))
      .catch(() => {});
  }, [bookingId, isCompleted]);

  // Real in-app notification created alongside this booking (Notification Sender) -
  // the confirmation screen's "In-app notification" card reflects this, not a static label.
  useEffect(() => {
    orFallback(listNotifications(), [])
      .then((data) => {
        const match = (Array.isArray(data) ? data : []).find(
          (n) => n.relatedBookingId === bookingId && n.type === NOTIFICATION_TYPE.BOOKING_CREATED
        );
        setBookingNotification(match || null);
      })
      .catch(() => {});
  }, [bookingId]);

  if (loading) {
    return (
      <CustomerLayout title="Booking Details">
        <p>Loading booking...</p>
      </CustomerLayout>
    );
  }

  if (!booking) {
    return (
      <CustomerLayout title="Booking Details">
        <p className="customer-book-details-x5">{loadError || 'Booking not found.'}</p>
        {loadError && loadError !== 'Booking not found.' && (
          <button type="button" className="bs-next-btn" onClick={() => { setLoadError(''); setLoading(true); setReloadKey((k) => k + 1); }}>Try again</button>
        )}
      </CustomerLayout>
    );
  }

  const cancelled = booking.status === BOOKING_STATUS.CANCELLED;

  const { lineItems, basePrice, discountAmount, discountLabel, discountNote } = getBookingLineItems(booking);
  const dpPercent = booking.downPaymentPercent ?? getDefaultDownPaymentPercent(downPaymentPercentages);
  const { downPayment: toPayNow, balance: remaining } = getPaymentBreakdown({ ...booking, downPaymentPercent: dpPercent });

  const isFullyPaid = isBookingFullyPaid(booking);

  // The down payment can be sent while nothing has been sent (or the last proof was rejected). An installation is confirmed by our team first.
  // The down payment is the percent of the service units only: the price of a unit we supply is not part of it.
  // What is due comes from the server (utils/paymentDue.js), the same answer Billing uses. An Installation with a unit we supply waits for the
  // owner to confirm the unit before anything is due.
  const paymentDue = booking.paymentDue || { kind: null };
  const dpWouldBeOpen = [PAYMENT_STATUS.UNPAID, PAYMENT_STATUS.REJECTED].includes(booking.paymentStatus) && dpPercent > 0 && toPayNow > 0
    && [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED].includes(booking.status);
  const waitingForConfirmation = dpWouldBeOpen && Boolean(paymentDue.waitingForUnit);
  const downPaymentOpen = dpWouldBeOpen && (paymentDue.kind === 'down' || waitingForConfirmation);
  // Once the service is Completed the rest of the price is due: the balance is open while the down payment is verified and the balance is
  // neither paid nor waiting to be verified.
  const balanceDue = booking.status === BOOKING_STATUS.COMPLETED && booking.paymentStatus === PAYMENT_STATUS.PARTIALLY_PAID
    && !booking.balancePaid && booking.balancePaymentStatus !== BALANCE_PAYMENT_STATUS.PAID && booking.balancePaymentStatus !== BALANCE_PAYMENT_STATUS.TO_VERIFY && remaining > 0
    || paymentDue.kind === 'balance'; // a booking with no down payment owes the whole balance once it is Completed
  const balanceToVerify = booking.status === BOOKING_STATUS.COMPLETED && booking.balancePaymentStatus === BALANCE_PAYMENT_STATUS.TO_VERIFY;
  const handlePaySubmit = async ({ proof, referenceNumber }) => {
    try {
      await (payingBalance ? submitBalancePayment : submitPayment)(booking.bookingId, proof, referenceNumber);
      setShowPay(false);
      setPayingBalance(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      showNotice(err instanceof ApiError ? err.message || 'Failed to submit payment' : 'Could not connect to server.');
    }
  };

  const receiptForm = {
    id: booking.bookingId,
    createdAt: booking.createdAt,
    customerName: storedUser.name || '-',
    address: booking.address,
    contactNumber: storedUser.phone || '-',
    service: booking.service?.name || '-',
    lineItems,
    basePrice,
    toPayNow,
    remaining,
    discountAmount,
    discountLabel,
    downPaymentPercent: dpPercent,
    paymentMode: booking.paymentMode,
    isFullyPaid,
    isCommercial: booking.isCommercial,
    vatAmount: booking.vatAmount,
    poNumber: booking.poNumber,
    paymentTermsDays: booking.paymentTermsDays,
    paymentDueAt: booking.paymentDueAt,
  };

  const techName = getMemberNames(booking, 'To be assigned');

  const rescheduleStatus = booking.rescheduleRequest?.status || 'None';
  // A booking the system started on its service day can still be cancelled until the job is done (the usual fee rule applies on the booked
  // date); one with a no show report waiting for the owner cannot be cancelled online.
  const noShowWaiting = booking.noShow?.status === 'Reported';
  const cancellableWhileStarted = booking.status === BOOKING_STATUS.IN_PROGRESS && booking.startedBySystem === true && !booking.reportSubmitted && !noShowWaiting;

  const handleConfirmCancel = async () => {
    setCancelling(true);
    try {
      const data = await cancelBooking(booking.bookingId);
      setBooking(data);
      setShowCancel(false);
      setJustCancelled(true);
    } catch (err) {
      showNotice(err instanceof ApiError ? err.message || 'Failed to cancel booking' : 'Could not connect to server.');
    } finally {
      setCancelling(false);
    }
  };

  const handleRescheduleSubmit = async ({ date, time }) => {
    setRescheduling(true);
    try {
      const data = await rescheduleBooking(booking.bookingId, { date, time });
      setBooking(data);
      setShowReschedule(false);
    } catch (err) {
      showNotice(err instanceof ApiError ? err.message || 'Failed to submit reschedule' : 'Could not connect to server.');
    } finally {
      setRescheduling(false);
    }
  };

  const handleFeedbackSubmit = async ({ rating, text }) => {
    setSubmittingFeedback(true);
    try {
      const data = await submitFeedback(booking.bookingId, { rating, text });
      setBooking(data);
      setShowFeedback(false);
    } catch (err) {
      showNotice(err instanceof ApiError ? err.message || 'Failed to submit feedback' : 'Could not connect to server.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleBackJobSubmit = async ({ issueDescription }) => {
    setSubmittingBackJob(true);
    try {
      const data = await reportBackJob({ bookingId: booking.bookingId, issueDescription });
      setBackJob(data);
    } catch (err) {
      showNotice(err instanceof ApiError ? err.message || 'Failed to submit report' : 'Could not connect to server.');
    } finally {
      setSubmittingBackJob(false);
    }
  };

  // Right after cancelling: the confirmation, with a way to keep looking at the booking. Opened any other way (My Bookings, an email), a cancelled
  // booking shows its details, read-only.
  if (cancelled && justCancelled) {
    return (
      <CustomerLayout title="Book Service">
        <BookingCancelled
          booking={booking}
          bookingId={booking.bookingId}
          refund={booking.refund}
          onBookAgain={() => navigate('/customer/book_service')}
          onBackToDashboard={() => navigate('/customer/dashboard')}
          onViewDetails={() => setJustCancelled(false)}
          onRefundFlagged={(data) => setBooking(data)}
        />
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout title="Booking Details">
      <Notice message={notice} onClose={clearNotice} />
      {balanceDue && (
        <section className="balance-reminder" role="status" aria-label="Payment reminder">
          <div className="balance-reminder-text">
            <h3 className="balance-reminder-title">Your service is complete. Please pay your balance.</h3>
            <p>Remaining balance: <strong>{formatPeso(remaining)}</strong>{booking.isCommercial && booking.paymentTermsDays > 0 ? `, due within ${booking.paymentTermsDays} days after completion` : ''}.</p>
          </div>
          <button type="button" className="pay-down-btn balance-reminder-btn" onClick={() => { setPayingBalance(true); setShowPay(true); }} disabled={!paymentMethods || paymentMethods.length === 0}>
            Pay Balance
          </button>
        </section>
      )}
      {balanceToVerify && (
        <section className="balance-reminder balance-reminder--sent" role="status" aria-label="Payment reminder">
          <p className="balance-reminder-title">Your balance payment was sent. We will confirm it once we have checked it.</p>
        </section>
      )}
      {booking.unitDecline?.reason && !cancelled && (
        <section className="unit-decline-notice" role="alert" aria-label="The owner cannot supply this unit">
          <h3 className="unit-decline-title">The owner cannot supply this unit</h3>
          <p className="unit-decline-line"><strong>Reason:</strong> {booking.unitDecline.reason}</p>
          {booking.unitDecline.note && <p className="unit-decline-line"><strong>Note from the owner:</strong> {booking.unitDecline.note}</p>}
          <p className="unit-decline-line">Your booking has not been cancelled. You can cancel it below, or contact the owner to choose another unit.</p>
          <div className="unit-decline-actions">
            <button type="button" className="unit-decline-contact" onClick={() => navigate('/customer/chat', {
                state: {
                  // the chat opens with this booking attached as the reference
                  bookingRef: {
                    bookingId: booking.bookingId,
                    service: booking.service?.name,
                    items: lineItems.filter((li) => !li.isCharge).map((li) => `${li.quantity}× ${li.type}`).join(', '),
                    total: basePrice,
                    status: booking.status,
                    when: [formatDate(booking.date), booking.time].filter(Boolean).join(' '),
                    placed: booking.createdAt ? new Date(booking.createdAt).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '',
                  },
                },
              })}>
              <FiMessageCircle size={16} /> Contact owner
            </button>
          </div>
        </section>
      )}
      {showPay && (
        <PaymentModal
          form={{ ...receiptForm, paymentMode2: booking.paymentMode2 }}
          paymentType={payingBalance ? 'balance' : 'downpayment'}
          paymentMethods={paymentMethods}
          onClose={() => { setShowPay(false); setPayingBalance(false); }}
          onSubmit={handlePaySubmit}
        />
      )}
      {showCancelConfirm && (
        <CancelConfirmDialog
          onKeep={() => setShowCancel(false)}
          onConfirmCancel={handleConfirmCancel}
          ruleNote={cancelRuleNote(booking, manilaTodayKey())}
        />
      )}

      {showReschedule && (
        <RescheduleModal
          booking={booking}
          onClose={() => setShowReschedule(false)}
          onSubmit={handleRescheduleSubmit}
          submitting={rescheduling}
        />
      )}

      {showReceipt && (
        <ReceiptModal
          form={receiptForm}
          booking={booking}
          onClose={() => setShowReceipt(false)}
        />
      )}

      {showFeedback && (
        <FeedbackModal
          booking={booking}
          readOnly={getFeedbackAction(booking) === 'view'}
          onClose={() => setShowFeedback(false)}
          onSubmit={handleFeedbackSubmit}
          submitting={submittingFeedback}
        />
      )}

      {showReport && (
        <ServiceReportViewer
          bookingId={booking.bookingId}
          fallback={{ service: booking.service?.name, customer: booking.customer?.name, address: booking.address, date: booking.date }}
          onClose={() => setShowReport(false)}
        />
      )}

      {showBackJob && (
        <BackJobModal
          booking={booking}
          existingBackJob={backJob}
          onClose={() => setShowBackJob(false)}
          onSubmit={handleBackJobSubmit}
          submitting={submittingBackJob}
        />
      )}

      <div className="confirmation-wrap">
        <div className="confirmation-heading">
          {cancelled
            ? <span className="confirmation-cancel-icon"><FiX /></span>
            : <span className="confirmation-check-icon"><FiCheck /></span>}
          <h2>{bookingHeading(booking.status)}</h2>
          <p className="confirmation-id">Booking ID: {booking.bookingId}</p>
        </div>

        <div className="confirmation-notif-row">
          <div className="confirmation-notif-card">
            <p className="confirmation-notif-title"><FiBell /> In-app notification</p>
            <p className="confirmation-notif-sub">
              {bookingNotification ? formatDate(bookingNotification.createdAt) : 'Sent'}
            </p>
          </div>
          <EmailStatusCard bookingId={booking.bookingId} />
        </div>

        {cancelled && (
          <>
            <CancelledSummary booking={booking} formatWhen={formatDate} onBookAgain={() => navigate('/customer/book_service')} />
            {booking.refund && booking.refund.status !== REFUND_STATUS.NONE && (
              <div className="bs-card cancelled-refund-card">
                <RefundReceivedConfirm bookingId={booking.bookingId} refund={booking.refund} onConfirmed={(data) => setBooking(data)} />
                {booking.refund.status === REFUND_STATUS.PROCESSED && (
                  <RefundFlagForm bookingId={booking.bookingId} refund={booking.refund} onFlagged={(data) => setBooking(data)} />
                )}
              </div>
            )}
          </>
        )}

        <div className="bs-card confirmation-details-card">
          <div className="confirmation-details-header">
            <h3 className="bs-card-title">Booking Details</h3>
            <div className="confirmation-header-right">
              <button className="receipt-icon-btn" title="Print Receipt" onClick={() => setShowReceipt(true)}>
                <FiPrinter />
              </button>
              <span className={`status-badge ${cancelled ? 'cancelled' : 'pending'}`}>{booking.status || 'Pending'}</span>
            </div>
          </div>

          <QuotationTerms terms={booking.quotationTerms} site={booking.site} isCommercial={booking.isCommercial} title="Quotation terms" />

          <div className="confirmation-details-grid">
            <div>
              <p className="summary-section-title">{booking.service?.name || '-'}</p>
              {lineItems.filter((li) => !li.isCharge).length === 0 ? (
                <p className="confirmation-detail-line">Unit: -</p>
              ) : (
                lineItems.filter((li) => !li.isCharge).map((li, i) => (
                  <p className="confirmation-detail-line" key={i}>
                    Unit: {li.quantity}× {li.type}{li.brandModel ? ` - ${li.brandModel}` : ''}{li.hp ? ` - ${li.hp} HP` : ''}
                    {unitChangeOf(li) && (
                      <span className="unit-change-note">
                        <span>Requested: {unitChangeOf(li).requested} (not available)</span>
                        <span>Changed to: {unitChangeOf(li).changedTo}</span>
                      </span>
                    )}
                    {li.supplied?.source === 'requested' && li.supplied.status !== 'Declined' && (
                      <span className="customer-unit-note"> Waiting for the owner to confirm the unit you asked for. The price is added once it is confirmed.</span>
                    )}
                    {li.supplied?.source === 'requested' && li.supplied.status === 'Declined' && (
                      <span className="customer-unit-note"> The owner cannot supply this unit: {li.supplied.declineReason}. You can cancel this booking, or contact the owner.</span>
                    )}
                  </p>
                ))
              )}

              <div className="confirmation-detail-item">
                <span className="confirmation-detail-icon"><FiCalendar /></span>
                <div>
                  <p className="confirmation-detail-label">Date</p>
                  <p className="confirmation-detail-value">{formatDate(booking.date)}</p>
                </div>
              </div>

              <div className="confirmation-detail-item">
                <span className="confirmation-detail-icon"><FiClock /></span>
                <div>
                  <p className="confirmation-detail-label">Time</p>
                  <p className="confirmation-detail-value">{booking.time || '-'}</p>
                </div>
              </div>

              <div className="confirmation-detail-item">
                <span className="confirmation-detail-icon"><FiMapPin /></span>
                <div>
                  <p className="confirmation-detail-label">Address</p>
                  <p className="confirmation-detail-value">{booking.address || '-'}</p>
                </div>
              </div>

              <div className="confirmation-detail-item">
                <span className="confirmation-detail-icon"><FiPhone /></span>
                <div>
                  <p className="confirmation-detail-label">Contact Number</p>
                  <p className="confirmation-detail-value">{booking.contactNumber || storedUser.phone || 'N/A'}</p>
                </div>
              </div>

              <div className="confirmation-detail-item">
                <span className="confirmation-detail-icon"><FiInfo /></span>
                <div>
                  <p className="confirmation-detail-label">Problem Description</p>
                  <p className="confirmation-detail-value">{booking.problemDescription || '-'}</p>
                </div>
              </div>
            </div>

            <div>
              <p className="summary-section-title"><FiCreditCard /> Payment Details</p>
              {lineItems.filter((li) => li.isCharge).map((li, i) => (
                <div className="summary-row" key={i}>
                  <span>{li.isScope ? `${li.type} (${li.quantity} ${li.unitLabel || 'unit'} at ${formatPeso(li.unitPrice)})` : li.type}</span>
                  <span>{formatPeso(li.subtotal)}</span>
                </div>
              ))}
              {discountNote && (
                <p className="cancelled-message customer-book-details-x6">{discountNote}</p>
              )}
              {booking.discount?.status === 'Pending' && (
                <div className="summary-row"><span>Senior/PWD Discount</span><span>Under review</span></div>
              )}
              {booking.discount?.status === 'Rejected' && (
                <div className="summary-row">
                  <span>Senior/PWD Discount</span>
                  <span>Not approved{booking.discount.rejectionReason ? `: ${booking.discount.rejectionReason}` : ''}</span>
                </div>
              )}
              <div className="summary-row"><span>Total Price</span><span>₱{basePrice.toLocaleString()}</span></div>
              {booking.isCommercial && booking.taxInclusive && (
                <div className="summary-row"><span>VAT included (12%)</span><span>₱{(booking.vatAmount ?? vatInside(basePrice)).toLocaleString()}</span></div>
              )}
              {booking.isCommercial && !booking.taxInclusive && (
                <>
                  <div className="summary-row"><span>VAT (12%)</span><span>₱{(booking.vatAmount || 0).toLocaleString()}</span></div>
                  <div className="summary-row"><span>Total incl. VAT</span><span>₱{(basePrice + (booking.vatAmount || 0)).toLocaleString()}</span></div>
                </>
              )}
              {!booking.isCommercial && booking.taxInclusive && (
                <div className="summary-row"><span>VAT included in the price (12%)</span><span>₱{vatInside(basePrice).toLocaleString()}</span></div>
              )}
              {booking.isCommercial && booking.paymentTermsDays > 0 && (
                <div className="summary-row"><span>Payment Terms</span><span>{booking.paymentTermsDays} days after completion</span></div>
              )}
              <div className="summary-row"><span>Down Payment</span><span>{dpPercent === null ? 'Not set' : `${dpPercent}%`}</span></div>
              <div className="summary-row"><span>{downPaymentOpen ? 'Down Payment Due' : booking.paymentStatus === PAYMENT_STATUS.TO_VERIFY ? 'Down Payment Sent (not yet verified)' : [PAYMENT_STATUS.PARTIALLY_PAID, PAYMENT_STATUS.FULLY_PAID].includes(booking.paymentStatus) ? 'Down Payment Verified' : 'Down Payment'}</span><span>₱{toPayNow.toLocaleString()}</span></div>
              <div className="summary-row"><span>Remaining Balance</span><span>₱{remaining.toLocaleString()}</span></div>
              <div className="summary-row"><span>Payment Mode</span><span>{booking.paymentMode || '-'}</span></div>
              {downPaymentOpen && (
                waitingForConfirmation ? (
                  <p className="booking-pay-note">We are confirming the unit. You will be asked to pay your down payment once it is confirmed.</p>
                ) : (
                  <div className="booking-pay-action">
                    <button type="button" className="pay-down-btn" onClick={() => setShowPay(true)} disabled={!paymentMethods || paymentMethods.length === 0}>
                      Pay Down Payment
                    </button>
                    <small>{dpPercent}% of the service only: the price of a unit we supply is not included.</small>
                  </div>
                )
              )}
              <div className="summary-row">
                <span>Proof of Payment</span>
                <span className="cost-link">
                  {booking.proofFile ? (
                    <ProofLink path={booking.proofFile}>View File</ProofLink>
                  ) : (
                    'None'
                  )}
                </span>
              </div>
              {booking.balancePaid && (
                <div className="summary-row">
                  <span>Balance Proof of Payment</span>
                  <span className="cost-link">
                    {booking.balanceProofFile ? (
                    <ProofLink path={booking.balanceProofFile}>View File</ProofLink>
                    ) : (
                      'None'
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="confirmation-technician-row">
            <div className="confirmation-technician-avatar"><FiUser /></div>
            <div>
              <p className="confirmation-detail-label">Assigned Technician</p>
              <p className="confirmation-technician-name">{techName}</p>
            </div>
          </div>

          {booking.isBackJob && (
            <p className="cancelled-message customer-book-details-x7">
              This is a free warranty repair visit - no payment is required for this booking.
            </p>
          )}

          {booking.warranty?.applicable && (
            <>
              <div className="cost-divider" />
              <p className="summary-section-title">Warranty Status</p>
              <div className="summary-row"><span>Coverage Type</span><span>{booking.warranty.type}</span></div>
              <div className="summary-row"><span>Scope</span><span>{booking.warranty.scope}</span></div>
              <div className="summary-row">
                <span>Workmanship Warranty</span>
                <span className={booking.warranty.workmanship.active ? 'cost-status-paid' : 'cost-status-unpaid'}>
                  {warrantyStatusText(booking.warranty.workmanship.active, booking.warranty.workmanship.expiresAt)}
                </span>
              </div>
              {booking.warranty.unit && (
                <>
                  <div className="summary-row">
                    <span>Compressor Warranty</span>
                    <span className={booking.warranty.unit.compressorActive ? 'cost-status-paid' : 'cost-status-unpaid'}>
                      {warrantyStatusText(booking.warranty.unit.compressorActive, booking.warranty.unit.compressorExpiresAt)}
                    </span>
                  </div>
                  <div className="summary-row">
                    <span>Minor Parts Warranty</span>
                    <span className={booking.warranty.unit.minorPartsActive ? 'cost-status-paid' : 'cost-status-unpaid'}>
                      {warrantyStatusText(booking.warranty.unit.minorPartsActive, booking.warranty.unit.minorPartsExpiresAt)}
                    </span>
                  </div>
                  <p className="customer-book-details-x8">Excludes: {booking.warranty.unit.excludes}</p>
                </>
              )}
              {booking.unitWaiver?.acknowledged && (
                <p className="customer-book-details-x9">
                  Unit Warranty Waiver signed by {booking.unitWaiver.customerName} on {formatDate(booking.unitWaiver.acknowledgedAt)}.
                </p>
              )}
            </>
          )}

          {rescheduleStatus === 'Denied' && !cancelled && (
            <div className="cancel-confirm-text customer-book-details-x10">
              Your reschedule request was denied by the admin. Please pick a new date/time,
              or cancel this booking instead.
            </div>
          )}

          <div className="confirmation-actions">
            {booking.status !== BOOKING_STATUS.CANCELLED && booking.status !== BOOKING_STATUS.COMPLETED && (
              <>
                {rescheduleStatus === 'Pending' ? (
                  <button className="bs-back-btn" disabled>
                    Reschedule Pending Approval
                  </button>
                ) : booking.status !== BOOKING_STATUS.IN_PROGRESS && (
                  <button className="bs-back-btn" onClick={() => setShowReschedule(true)}>
                    {rescheduleStatus === 'Denied' ? 'Pick New Date' : 'Reschedule'}
                  </button>
                )}

                {booking.status === BOOKING_STATUS.IN_PROGRESS && !cancellableWhileStarted ? (
                  <p className="cancelled-message customer-book-details-x11">
                    {noShowWaiting
                      ? 'Your no show report is being reviewed by the owner, so this booking cannot be cancelled online right now.'
                      : 'The service has already started, so it can no longer be cancelled online. Please contact us directly.'}
                  </p>
                ) : (
                  <button className="cancel-booking-btn" onClick={() => setShowCancel(true)} disabled={cancelling}>
                    Cancel booking
                  </button>
                )}
                {[BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS].includes(booking.status) && (
                  <NoShowCustomerCard booking={booking} onChanged={(data) => setBooking(data)} />
                )}
              </>
            )}

            {[BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED].includes(booking.status)
              && !booking.isCommercial
              && !['Pending', 'Approved'].includes(booking.discount?.status) && (
              <DiscountRequestForm bookingId={booking.bookingId} onRequested={(data) => setBooking(data)} />
            )}

            {getFeedbackAction(booking) && (
              <button className="bs-back-btn" onClick={() => setShowFeedback(true)}>
                <FiStar /> {FEEDBACK_ACTION_LABEL[getFeedbackAction(booking)]}
              </button>
            )}

            {booking.status === BOOKING_STATUS.COMPLETED && booking.reportSubmitted && (
              <button className="bs-back-btn" onClick={() => setShowReport(true)}>
                <FiFileText /> View Service Report
              </button>
            )}

            {booking.status === BOOKING_STATUS.COMPLETED && (
              <button className="bs-back-btn" onClick={() => setShowBackJob(true)}>
                <FiAlertTriangle /> {backJob ? 'View Reported Issue' : 'Report an Issue'}
              </button>
            )}
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}

export default BookDetails;
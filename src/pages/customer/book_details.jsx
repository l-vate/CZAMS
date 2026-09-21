import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import CustomerLayout from './customer_layout';
import ReceiptModal from '../../components/receipt_modal';
import FeedbackModal from '../../components/feedback_modal';
import BackJobModal from '../../components/back_job_modal';
import { getBookingLineItems } from '../../utils/bookingPricing';
import { toLocalDateKey } from '../../utils/date';
import {
  FiCheck, FiMail, FiMessageSquare, FiBell, FiPrinter,
  FiCalendar, FiClock, FiMapPin, FiInfo, FiCreditCard,
  FiUser, FiAlertTriangle, FiX, FiArrowRight, FiStar,
} from 'react-icons/fi';

const storedUser = JSON.parse(localStorage.getItem('user') || '{}');

const FEEDBACK_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// 'create' if no feedback yet, 'edit' within the 24h window, 'view' (read-only) after it, or null if not eligible
function getFeedbackAction(booking) {
  if (booking.status !== 'Completed') return null;
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
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function RescheduleModal({ booking, onClose, onSubmit, submitting }) {
  const [date, setDate] = useState(booking.date || '');
  const [time, setTime] = useState(booking.time || '');
  const needsApproval = ['Approved', 'In Progress'].includes(booking.status);

  const minDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return toLocalDateKey(d);
  })();

  const isDateValid = date >= minDate;

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

        <div className="bs-field-group">
          <label className="bs-label">New Date</label>
          <input
            type="date"
            className="bs-input"
            min={minDate}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <p style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '4px' }}>
            Earliest available date is {new Date(minDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
          </p>
        </div>

        <div className="bs-field-group">
          <label className="bs-label">New Time</label>
          <div className="time-toggle">
            {['Morning', 'Afternoon'].map((t) => (
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

function CancelConfirmDialog({ onKeep, onConfirmCancel }) {
  return (
    <div className="modal-overlay" onClick={onKeep}>
      <div className="modal-card cancel-confirm-card" onClick={(e) => e.stopPropagation()}>
        <div className="cancel-confirm-icon"><FiAlertTriangle /></div>
        <h4 className="modal-title cancel-confirm-title">Cancel this booking?</h4>
        <p className="cancel-confirm-text">
          This action can't be undone. Your technician assignment and scheduled slot will be released.
        </p>
        <div className="cancel-confirm-actions">
          <button className="bs-back-btn" onClick={onKeep}>Keep booking</button>
          <button className="cancel-booking-btn" onClick={onConfirmCancel}>Yes, cancel it</button>
        </div>
      </div>
    </div>
  );
}

function RefundStatusMessage({ refund }) {
  if (!refund || refund.status === 'None') {
    return (
      <p className="cancelled-message">
        Your booking has been successfully cancelled. No down payment was on file for
        this booking, so there's nothing to refund.
      </p>
    );
  }

  if (refund.status === 'Processed') {
    return (
      <p className="cancelled-message">
        Your booking has been successfully cancelled. Your refund of{' '}
        <strong>₱{refund.refundableAmount?.toLocaleString()}</strong> has been processed.
      </p>
    );
  }

  // Pending
  if (refund.isSameDay) {
    return (
      <p className="cancelled-message">
        Your booking has been successfully cancelled. Since this was cancelled on the
        same day as your scheduled service, a dispatch/transportation cost will be
        deducted from your down payment of <strong>₱{refund.downPaymentAmount?.toLocaleString()}</strong>{' '}
        before it's refunded. Our admin team will review this and process your refund shortly.
      </p>
    );
  }

  return (
    <p className="cancelled-message">
      Your booking has been successfully cancelled. Your down payment of{' '}
      <strong>₱{refund.downPaymentAmount?.toLocaleString()}</strong> is being reviewed
      for a refund by our admin team.
    </p>
  );
}

// Lets a customer flag a refund that hasn't come through — a single message +
// status, not a ticketing thread. Only shown once there's an actual refund case.
function RefundFlagForm({ bookingId, refund, onFlagged }) {
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isFlaggedUnresolved = refund.customerFlag?.flagged && !refund.customerFlag?.resolved;

  if (isFlaggedUnresolved) {
    return (
      <p className="cancelled-message" style={{ fontSize: '13px', marginTop: '10px' }}>
        You flagged this refund on {formatDate(refund.customerFlag.flaggedAt)} — our team will follow up with you.
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
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:5000/api/bookings/${bookingId}/refund/flag`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: message.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Failed to submit report.');
        return;
      }
      onFlagged(data);
      setShowForm(false);
      setMessage('');
    } catch (err) {
      setError('Could not connect to server.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!showForm) {
    return (
      <button
        type="button"
        className="bs-back-btn"
        style={{ marginTop: '10px' }}
        onClick={() => setShowForm(true)}
      >
        This refund hasn't come through?
      </button>
    );
  }

  return (
    <div className="bs-field-group" style={{ marginTop: '10px' }}>
      <label className="bs-label">Tell us what happened</label>
      <textarea
        className="bs-textarea"
        rows={3}
        placeholder="e.g. It's been marked processed but I haven't received the refund..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      {error && (
        <p style={{ fontSize: '12px', color: '#e05a5a' }}>{error}</p>
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

function BookingCancelled({ bookingId, refund, onBookAgain, onBackToDashboard, onRefundFlagged }) {
  return (
    <div className="confirmation-wrap">
      <div className="confirmation-heading">
        <span className="confirmation-cancel-icon"><FiX /></span>
        <h2>Booking Cancelled</h2>
        <p className="confirmation-id">Booking ID: {bookingId}</p>
      </div>
      <div className="bs-card cancelled-card">
        <RefundStatusMessage refund={refund} />
        {refund && refund.status !== 'None' && (
          <RefundFlagForm bookingId={bookingId} refund={refund} onFlagged={onRefundFlagged} />
        )}
        <div className="cancelled-actions">
          <button className="bs-back-btn" onClick={onBackToDashboard}>Back to Dashboard</button>
          <button className="bs-next-btn" onClick={onBookAgain}>Book Another Service <FiArrowRight /></button>
        </div>
      </div>
    </div>
  );
}

function BookDetails() {
  const { bookingId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(location.state?.booking || null);
  const [loading, setLoading] = useState(!location.state?.booking);
  const [showCancelConfirm, setShowCancel] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [showBackJob, setShowBackJob] = useState(false);
  const [submittingBackJob, setSubmittingBackJob] = useState(false);
  const [backJob, setBackJob] = useState(null);
  const [bookingNotification, setBookingNotification] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`http://localhost:5000/api/bookings/${bookingId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setBooking(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [bookingId]);

  // Check whether an issue was already reported for this booking (Back Job Handling)
  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`http://localhost:5000/api/backjobs/booking/${bookingId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setBackJob(data))
      .catch(() => {});
  }, [bookingId]);

  // Real in-app notification created alongside this booking (Notification Sender) —
  // the confirmation screen's "In-app notification" card reflects this, not a static label.
  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch('http://localhost:5000/api/notifications', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const match = (Array.isArray(data) ? data : []).find(
          (n) => n.relatedBookingId === bookingId && n.type === 'booking_created'
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
        <p style={{ color: '#666' }}>Booking not found.</p>
      </CustomerLayout>
    );
  }

  const cancelled = booking.status === 'Cancelled';

  const { lineItems, basePrice } = getBookingLineItems(booking);
  const dpPercent = booking.downPaymentPercent ?? 10;
  const toPayNow = Math.round(basePrice * (dpPercent / 100));
  const remaining = basePrice - toPayNow;

  const isFullyPaid = booking.paymentStatus === 'Paid' && (dpPercent === 100 || booking.balancePaid);

  const receiptForm = {
    id: booking.bookingId,
    createdAt: booking.createdAt,
    customerName: storedUser.name || '—',
    address: booking.address,
    contactNumber: storedUser.phone || '—',
    service: booking.service?.name || '—',
    lineItems,
    basePrice,
    toPayNow,
    downPaymentPercent: dpPercent,
    paymentMode: booking.paymentMode,
    isFullyPaid,
  };

  const techName = booking.technician?.name || 'To be assigned';

  const rescheduleStatus = booking.rescheduleRequest?.status || 'None';

  const handleConfirmCancel = async () => {
    setCancelling(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:5000/api/bookings/${booking.bookingId}/cancel`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Failed to cancel booking');
        setCancelling(false);
        return;
      }
      setBooking(data);
      setShowCancel(false);
    } catch (err) {
      alert('Could not connect to server.');
    } finally {
      setCancelling(false);
    }
  };

  const handleRescheduleSubmit = async ({ date, time }) => {
    setRescheduling(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:5000/api/bookings/${booking.bookingId}/reschedule`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ date, time }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Failed to submit reschedule');
        setRescheduling(false);
        return;
      }
      setBooking(data);
      setShowReschedule(false);
    } catch (err) {
      alert('Could not connect to server.');
    } finally {
      setRescheduling(false);
    }
  };

  const handleFeedbackSubmit = async ({ rating, text }) => {
    setSubmittingFeedback(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:5000/api/bookings/${booking.bookingId}/feedback`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rating, text }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Failed to submit feedback');
        return;
      }
      setBooking(data);
      setShowFeedback(false);
    } catch (err) {
      alert('Could not connect to server.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleBackJobSubmit = async ({ issueDescription }) => {
    setSubmittingBackJob(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:5000/api/backjobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bookingId: booking.bookingId, issueDescription }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Failed to submit report');
        return;
      }
      setBackJob(data);
    } catch (err) {
      alert('Could not connect to server.');
    } finally {
      setSubmittingBackJob(false);
    }
  };

  if (cancelled) {
    return (
      <CustomerLayout title="Book Service">
        <BookingCancelled
          bookingId={booking.bookingId}
          refund={booking.refund}
          onBookAgain={() => navigate('/customer/book_service')}
          onBackToDashboard={() => navigate('/customer/dashboard')}
          onRefundFlagged={(data) => setBooking(data)}
        />
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout title="Booking Details">
      {showCancelConfirm && (
        <CancelConfirmDialog
          onKeep={() => setShowCancel(false)}
          onConfirmCancel={handleConfirmCancel}
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
          <span className="confirmation-check-icon"><FiCheck /></span>
          <h2>Booking Request Submitted!</h2>
          <p className="confirmation-id">Booking ID: {booking.bookingId}</p>
        </div>

        <div className="confirmation-notif-row">
          <div className="confirmation-notif-card confirmation-notif-card--disabled">
            <p className="confirmation-notif-title"><FiMail /> Email notification</p>
            <p className="confirmation-notif-sub">Coming soon</p>
          </div>
          <div className="confirmation-notif-card confirmation-notif-card--disabled">
            <p className="confirmation-notif-title"><FiMessageSquare /> SMS notification</p>
            <p className="confirmation-notif-sub">Coming soon</p>
          </div>
          <div className="confirmation-notif-card">
            <p className="confirmation-notif-title"><FiBell /> In-app notification</p>
            <p className="confirmation-notif-sub">
              {bookingNotification ? formatDate(bookingNotification.createdAt) : 'Sent'}
            </p>
          </div>
        </div>

        <div className="bs-card confirmation-details-card">
          <div className="confirmation-details-header">
            <h3 className="bs-card-title">Booking Details</h3>
            <div className="confirmation-header-right">
              <button className="receipt-icon-btn" title="Print Receipt" onClick={() => setShowReceipt(true)}>
                <FiPrinter />
              </button>
              <span className="status-badge pending">{booking.status || 'Pending'}</span>
            </div>
          </div>

          <div className="confirmation-details-grid">
            <div>
              <p className="summary-section-title">{booking.service?.name || '—'}</p>
              {lineItems.length === 0 ? (
                <p className="confirmation-detail-line">Unit: —</p>
              ) : (
                lineItems.map((li, i) => (
                  <p className="confirmation-detail-line" key={i}>
                    Unit: {li.quantity}× {li.type}{li.brandModel ? ` — ${li.brandModel}` : ''}
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
                  <p className="confirmation-detail-value">{booking.time || '—'}</p>
                </div>
              </div>

              <div className="confirmation-detail-item">
                <span className="confirmation-detail-icon"><FiMapPin /></span>
                <div>
                  <p className="confirmation-detail-label">Address</p>
                  <p className="confirmation-detail-value">{booking.address || '—'}</p>
                </div>
              </div>

              <div className="confirmation-detail-item">
                <span className="confirmation-detail-icon"><FiInfo /></span>
                <div>
                  <p className="confirmation-detail-label">Problem Description</p>
                  <p className="confirmation-detail-value">{booking.problemDescription || '—'}</p>
                </div>
              </div>
            </div>

            <div>
              <p className="summary-section-title"><FiCreditCard /> Payment Details</p>
              <div className="summary-row"><span>Total Price</span><span>₱{basePrice.toLocaleString()}</span></div>
              <div className="summary-row"><span>Down Payment</span><span>{dpPercent}%</span></div>
              <div className="summary-row"><span>Amount to Pay Now</span><span>₱{toPayNow.toLocaleString()}</span></div>
              <div className="summary-row"><span>Remaining Balance</span><span>₱{remaining.toLocaleString()}</span></div>
              <div className="summary-row"><span>Payment Mode</span><span>{booking.paymentMode || '—'}</span></div>
              <div className="summary-row">
                <span>Proof of Payment</span>
                <span className="cost-link">
                  {booking.proofFile ? (
                    
                      <a href={`http://localhost:5000${booking.proofFile}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View File
                    </a>
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
                      
                        <a href={`http://localhost:5000${booking.balanceProofFile}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View File
                      </a>
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
            <p className="cancelled-message" style={{ marginTop: '12px' }}>
              This is a free warranty repair visit — no payment is required for this booking.
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
                  {booking.warranty.workmanship.active ? 'Active' : 'Expired'} — until {formatDate(booking.warranty.workmanship.expiresAt)}
                </span>
              </div>
              {booking.warranty.unit && (
                <>
                  <div className="summary-row">
                    <span>Compressor Warranty</span>
                    <span className={booking.warranty.unit.compressorActive ? 'cost-status-paid' : 'cost-status-unpaid'}>
                      {booking.warranty.unit.compressorActive ? 'Active' : 'Expired'} — until {formatDate(booking.warranty.unit.compressorExpiresAt)}
                    </span>
                  </div>
                  <div className="summary-row">
                    <span>Minor Parts Warranty</span>
                    <span className={booking.warranty.unit.minorPartsActive ? 'cost-status-paid' : 'cost-status-unpaid'}>
                      {booking.warranty.unit.minorPartsActive ? 'Active' : 'Expired'} — until {formatDate(booking.warranty.unit.minorPartsExpiresAt)}
                    </span>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Excludes: {booking.warranty.unit.excludes}</p>
                </>
              )}
              {booking.unitWaiver?.acknowledged && (
                <p style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '6px' }}>
                  Unit Warranty Waiver signed by {booking.unitWaiver.customerName} on {formatDate(booking.unitWaiver.acknowledgedAt)}.
                </p>
              )}
            </>
          )}

          {rescheduleStatus === 'Denied' && (
            <div className="cancel-confirm-text" style={{ margin: '12px 0', color: '#b91c1c' }}>
              Your reschedule request was denied by the admin. Please pick a new date/time,
              or cancel this booking instead.
            </div>
          )}

          <div className="confirmation-actions">
            {booking.status !== 'Cancelled' && booking.status !== 'Completed' && (
              <>
                {rescheduleStatus === 'Pending' ? (
                  <button className="bs-back-btn" disabled>
                    Reschedule Pending Approval
                  </button>
                ) : (
                  <button className="bs-back-btn" onClick={() => setShowReschedule(true)}>
                    {rescheduleStatus === 'Denied' ? 'Pick New Date' : 'Reschedule'}
                  </button>
                )}

                <button className="cancel-booking-btn" onClick={() => setShowCancel(true)} disabled={cancelling}>
                  Cancel booking
                </button>
              </>
            )}

            {getFeedbackAction(booking) && (
              <button className="bs-back-btn" onClick={() => setShowFeedback(true)}>
                <FiStar /> {FEEDBACK_ACTION_LABEL[getFeedbackAction(booking)]}
              </button>
            )}

            {booking.status === 'Completed' && (
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
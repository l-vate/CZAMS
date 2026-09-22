import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import CustomerLayout from './customer_layout';
import ReceiptModal from '../../components/receipt_modal';
import {
  FiCheck, FiMail, FiMessageSquare, FiBell, FiPrinter,
  FiCalendar, FiClock, FiMapPin, FiInfo, FiCreditCard,
  FiUser, FiAlertTriangle, FiX, FiArrowRight,
} from 'react-icons/fi';

const storedUser = JSON.parse(localStorage.getItem('user') || '{}');

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
    d.setDate(d.getDate() + 5);
    return d.toISOString().split('T')[0];
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

function BookingCancelled({ bookingId, onBookAgain, onBackToDashboard }) {
  return (
    <div className="confirmation-wrap">
      <div className="confirmation-heading">
        <span className="confirmation-cancel-icon"><FiX /></span>
        <h2>Booking Cancelled</h2>
        <p className="confirmation-id">Booking ID: {bookingId}</p>
      </div>
      <div className="bs-card cancelled-card">
        <p className="cancelled-message">
          Your booking has been successfully cancelled. No further charges will be made,
          and any pending downpayment will be reviewed for refund if applicable.
        </p>
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

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${import.meta.env.VITE_API_URL}/api/bookings/${bookingId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setBooking(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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

  const basePrice = booking.service?.price || 0;
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
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/bookings/${booking.bookingId}/cancel`, {
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
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/bookings/${booking.bookingId}/reschedule`, {
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

  if (cancelled) {
    return (
      <CustomerLayout title="Book Service">
        <BookingCancelled
          bookingId={booking.bookingId}
          onBookAgain={() => navigate('/customer/book_service')}
          onBackToDashboard={() => navigate('/customer/dashboard')}
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

      <div className="confirmation-wrap">
        <div className="confirmation-heading">
          <span className="confirmation-check-icon"><FiCheck /></span>
          <h2>Booking Request Submitted!</h2>
          <p className="confirmation-id">Booking ID: {booking.bookingId}</p>
        </div>

        <div className="confirmation-notif-row">
          <div className="confirmation-notif-card">
            <p className="confirmation-notif-title"><FiMail /> Email sent</p>
            <p className="confirmation-notif-sub">{storedUser.email || '—'}</p>
          </div>
          <div className="confirmation-notif-card">
            <p className="confirmation-notif-title"><FiMessageSquare /> SMS sent</p>
            <p className="confirmation-notif-sub">{storedUser.phone || '—'}</p>
          </div>
          <div className="confirmation-notif-card">
            <p className="confirmation-notif-title"><FiBell /> In-app notification</p>
            <p className="confirmation-notif-sub">Just now</p>
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
              <p className="confirmation-detail-line">
                Unit: {(booking.unitTypes || []).join(', ') || '—'}
              </p>

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
                    
                      <a href={`${import.meta.env.VITE_API_URL}${booking.proofFile}`}
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
                      
                        <a href={`${import.meta.env.VITE_API_URL}${booking.balanceProofFile}`}
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
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}

export default BookDetails;
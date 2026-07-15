import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CustomerLayout from './customer_layout';
import ReceiptModal from '../../components/receipt_modal';
import {
  FiCheck, FiMail, FiMessageSquare, FiBell, FiPrinter,
  FiCalendar, FiClock, FiMapPin, FiInfo, FiCreditCard,
  FiUser, FiAlertTriangle, FiX, FiArrowRight,
} from 'react-icons/fi';

const SERVICES = [
  { id: 'cleaning',     label: 'Cleaning',     price: 650  },
  { id: 'repair',       label: 'Repair',        price: 1200 },
  { id: 'installation', label: 'Installation',  price: 3500 },
  { id: 'maintenance',  label: 'Maintenance',   price: 550  },
];

const TECHNICIANS = {
  tech1: 'Juan Dela Cruz',
  tech2: 'Pedro Santos',
  tech3: 'Maria Reyes',
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

/* ── Cancel Confirm Dialog ────────────────────────────────── */
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

/* ── Booking Cancelled ────────────────────────────────────── */
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

/* ── Main: Book Details ───────────────────────────────────── */
function BookDetails() {
  const location = useLocation();
  const navigate = useNavigate();

  // Works from both book_service (has form) and my_bookings (has booking only)
  const form    = location.state?.form    || {};
  const booking = location.state?.booking || {};

  const [cancelled, setCancelled]           = useState(false);
  const [showCancelConfirm, setShowCancel]  = useState(false);
  const [showReceipt, setShowReceipt]       = useState(false);

  // Derive payment info — falls back gracefully for my_bookings simple data
  const selected   = SERVICES.find((s) => s.id === form.service);
  const basePrice  = selected?.price || 0;
  const dpPercent  = form.downPaymentPercent ?? 10;
  const toPayNow   = Math.round(basePrice * (dpPercent / 100));
  const remaining  = basePrice - toPayNow;
  const techName   = form.technician
    ? (TECHNICIANS[form.technician] || form.technician)
    : (booking.technician || 'To be assigned');

  const bookingId  = booking.id || '—';
  const service    = selected?.label || booking.service || '—';

  if (cancelled) {
    return (
      <CustomerLayout title="Book Service">
        <BookingCancelled
          bookingId={bookingId}
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
          onConfirmCancel={() => { setShowCancel(false); setCancelled(true); }}
        />
      )}

      {showReceipt && (
        <ReceiptModal
          form={form}
          booking={booking}
          onClose={() => setShowReceipt(false)}
        />
      )}

      <div className="confirmation-wrap">

        {/* ── Submitted header ── */}
        <div className="confirmation-heading">
          <span className="confirmation-check-icon"><FiCheck /></span>
          <h2>Booking Request Submitted!</h2>
          <p className="confirmation-id">Booking ID: {bookingId}</p>
        </div>

        {/* ── Notification cards ── */}
        <div className="confirmation-notif-row">
          <div className="confirmation-notif-card">
            <p className="confirmation-notif-title"><FiMail /> Email sent</p>
            <p className="confirmation-notif-sub">{form.email || 'demo.account@gmail.com'}</p>
          </div>
          <div className="confirmation-notif-card">
            <p className="confirmation-notif-title"><FiMessageSquare /> SMS sent</p>
            <p className="confirmation-notif-sub">{form.contactNumber || '+63 924 567 8910'}</p>
          </div>
          <div className="confirmation-notif-card">
            <p className="confirmation-notif-title"><FiBell /> In-app notification</p>
            <p className="confirmation-notif-sub">Just now</p>
          </div>
        </div>

        {/* ── Booking details card ── */}
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

            {/* Left — service info */}
            <div>
              <p className="summary-section-title">{service}</p>
              <p className="confirmation-detail-line">
                Unit: {(form.unitTypes || []).join(', ') || '—'}
              </p>

              <div className="confirmation-detail-item">
                <span className="confirmation-detail-icon"><FiCalendar /></span>
                <div>
                  <p className="confirmation-detail-label">Date</p>
                  <p className="confirmation-detail-value">{formatDate(form.date || booking.date)}</p>
                </div>
              </div>

              <div className="confirmation-detail-item">
                <span className="confirmation-detail-icon"><FiClock /></span>
                <div>
                  <p className="confirmation-detail-label">Time</p>
                  <p className="confirmation-detail-value">{form.time || '—'}</p>
                </div>
              </div>

              <div className="confirmation-detail-item">
                <span className="confirmation-detail-icon"><FiMapPin /></span>
                <div>
                  <p className="confirmation-detail-label">Address</p>
                  <p className="confirmation-detail-value">{form.address || booking.address || '—'}</p>
                </div>
              </div>

              <div className="confirmation-detail-item">
                <span className="confirmation-detail-icon"><FiInfo /></span>
                <div>
                  <p className="confirmation-detail-label">Problem Description</p>
                  <p className="confirmation-detail-value">{form.problemDescription || '—'}</p>
                </div>
              </div>
            </div>

            {/* Right — payment */}
            <div>
              <p className="summary-section-title"><FiCreditCard /> Payment Details</p>
              <div className="summary-row"><span>Total Price</span><span>₱{basePrice.toLocaleString()}</span></div>
              <div className="summary-row"><span>Down Payment</span><span>{dpPercent}%</span></div>
              <div className="summary-row"><span>Amount to Pay Now</span><span>₱{toPayNow.toLocaleString()}</span></div>
              <div className="summary-row"><span>Remaining Balance</span><span>₱{remaining.toLocaleString()}</span></div>
              <div className="summary-row"><span>Payment Mode</span><span>{form.paymentMode || '—'}</span></div>
              <div className="summary-row">
                <span>Proof of Payment</span>
                <span className="cost-link">View attachment</span>
              </div>
            </div>

          </div>

          {/* Technician */}
          <div className="confirmation-technician-row">
            <div className="confirmation-technician-avatar"><FiUser /></div>
            <div>
              <p className="confirmation-detail-label">Assigned Technician</p>
              <p className="confirmation-technician-name">{techName}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="confirmation-actions">
            <button className="bs-back-btn" onClick={() => navigate('/customer/book_service', { state: { reschedule: true, form } })}>
              Reschedule
            </button>
            <button className="cancel-booking-btn" onClick={() => setShowCancel(true)}>
              Cancel booking
            </button>
          </div>

        </div>
      </div>
    </CustomerLayout>
  );
}

export default BookDetails;
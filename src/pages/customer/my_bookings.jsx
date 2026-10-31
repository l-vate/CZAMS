import { useState, useEffect } from 'react';
import CustomerLayout from './customer_layout';
import { useNavigate } from 'react-router-dom';
import { FiClock, FiMapPin, FiEye, FiStar, FiCalendar, FiArrowRight } from 'react-icons/fi';
import FeedbackModal from '../../components/feedback_modal';
import { getFilterPillStyle } from '../../utils/statusColors';
import { ApiError } from '../../services/apiClient';
import { listMyBookings, submitFeedback } from '../../services/bookingService';
import { getMemberNames } from '../../utils/assignments';
import { BOOKING_STATUS, BOOKING_STATUS_VALUES } from '../../constants/bookingStatus';

import Notice from '../../components/notice';
import { useNotice } from '../../hooks/useNotice';
import LoadError from '../../components/load_error';
const FEEDBACK_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// Same badge/left-accent classes as the technician's My Jobs card (staff.css) -
// .tech-job-card colors its left border automatically off whichever of these
// badge classes it contains via a :has() rule, no extra class needed here.
const STATUS_BADGE_CLASS = {
  Pending: 'tech-status-pending',
  Approved: 'tech-status-confirmed',
  'In Progress': 'tech-status-in-progress',
  Completed: 'tech-status-completed',
  Cancelled: 'tech-status-cancelled',
};

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

function MyBookings() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const { notice, showNotice, clearNotice } = useNotice();
  const [feedbackBooking, setFeedbackBooking] = useState(null);
  const [feedbackAction, setFeedbackAction] = useState(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const filters = ['All', ...BOOKING_STATUS_VALUES];

  // A failed load is an error with a Retry, never an empty list that reads "No bookings found".
  const fetchBookings = () => {
    listMyBookings()
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Unexpected bookings reply');
        setBookings(data);
        setFailed(false);
        setLoading(false);
      })
      .catch(() => { setFailed(true); setLoading(false); });
  };

  const retry = () => {
    setFailed(false);
    setLoading(true);
    fetchBookings();
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  // Helper functions to safely render potential object fields
  const formatAddress = (address) => {
    if (!address) return 'N/A';
    if (typeof address === 'string') return address;
    if (typeof address === 'object') {
      return address.fullAddress || address.street || address.city || JSON.stringify(address);
    }
    return String(address);
  };

  const filteredBookings = bookings
    .filter((b) => activeFilter === 'All' || b.status === activeFilter)
    .filter((b) => {
      const term = searchTerm.trim().toLowerCase();
      if (!term) return true;
      const haystack = [
        b.bookingId,
        b.service?.name,
        formatAddress(b.address),
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    });

  // Sort: Pending first, then active statuses, then Completed, Cancelled always last
  const STATUS_ORDER = { Pending: 0, Approved: 1, 'In Progress': 1, Completed: 2, Cancelled: 3 };
  const sortedBookings = [...filteredBookings].sort((a, b) => {
    const rankA = STATUS_ORDER[a.status] ?? 1;
    const rankB = STATUS_ORDER[b.status] ?? 1;
    if (rankA !== rankB) return rankA - rankB;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); // newest first within same group
  });

  const lastNonCancelledIndex = (() => {
    let idx = -1;
    sortedBookings.forEach((b, i) => {
      if (b.status !== BOOKING_STATUS.CANCELLED) idx = i;
    });
    return idx;
  })();

  const handleOpenFeedback = (booking, action) => {
    setFeedbackBooking(booking);
    setFeedbackAction(action);
  };

  const handleFeedbackSubmit = async ({ rating, text }) => {
    setSubmittingFeedback(true);
    try {
      await submitFeedback(feedbackBooking.bookingId, { rating, text });
      setFeedbackBooking(null);
      fetchBookings();
    } catch (err) {
      showNotice(err instanceof ApiError ? err.message || 'Failed to submit feedback' : 'Could not connect to server.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  // The names of the technicians on the booking, or a placeholder until it is approved.
  const formatTechnician = (booking) => getMemberNames(booking, 'Not Assigned');

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const parsed = new Date(dateString);
    if (isNaN(parsed.getTime())) return String(dateString);
    return parsed.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
  };

  return (
    <CustomerLayout
      title="My Bookings"
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder="Search by ID, service, or address..."
    >
      <div className="customer-my-bookings-x1">
        <div className="req-filters">
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

        <div className="customer-my-bookings-x2">
          <button type="button" className="bs-next-btn" onClick={() => navigate('/customer/book_service')}>
            New Booking
          </button>
        </div>
      </div>

      <Notice message={notice} onClose={clearNotice} />
      {loading ? (
        <p>Loading bookings...</p>
      ) : failed ? (
        <LoadError message="Could not load your bookings." onRetry={retry} />
      ) : filteredBookings.length === 0 ? (
        <div className="my-bookings-empty">
          <span className="my-bookings-empty-icon" aria-hidden="true"><FiCalendar /></span>
          <h3 className="my-bookings-empty-title">No bookings found</h3>
          <p className="my-bookings-empty-text">
            {activeFilter === 'All' ? 'You have not booked a service yet.' : `You have no ${activeFilter.toLowerCase()} bookings.`}
          </p>
          <a className="my-bookings-empty-btn" href="/customer/book_service">Book a service <FiArrowRight /></a>
        </div>
      ) : (
        <div className="tech-job-list">
          {sortedBookings.map((booking, i) => (
            <div key={booking._id || i}>
              {i === lastNonCancelledIndex + 1 && booking.status === BOOKING_STATUS.CANCELLED && (
                <div className="customer-my-bookings-x4">
                  <div className="customer-my-bookings-x5" />
                  CANCELLED
                  <div className="customer-my-bookings-x5" />
                </div>
              )}

              <div className={`tech-job-card ${booking.status === BOOKING_STATUS.CANCELLED ? 'tech-job-card--dimmed' : ''}`}>
                <div className="tech-job-info">
                  <div className="tech-job-top-row">
                    <small className="tech-job-date-label">{formatDate(booking.createdAt)}</small>
                    <span className={`tech-job-status-badge ${STATUS_BADGE_CLASS[booking.status] || ''}`}>
                      {booking.expiredBySystem ? 'Expired' : booking.status}
                    </span>
                  </div>
                  <div className="tech-job-service">{booking.service?.name || '-'}</div>
                  <small className="tech-job-booking">{booking.bookingId} · {formatTechnician(booking)}</small>
                </div>

                <div className="tech-job-meta">
                  <FiClock /> {typeof booking.date === 'string' ? booking.date : JSON.stringify(booking.date || 'N/A')}
                </div>

                <div className="tech-job-meta">
                  <FiMapPin /> {formatAddress(booking.address)}
                </div>

                <button
                  className="view-details-btn"
                  onClick={() => navigate(`/customer/book_details/${booking.bookingId}`, { state: { booking } })}
                >
                  <FiEye size={14} /> View Details
                </button>

                {getFeedbackAction(booking) && (
                  <button
                    className="tech-job-view-link customer-my-bookings-x6"
                    onClick={() => handleOpenFeedback(booking, getFeedbackAction(booking))}
                  >
                    <FiStar /> {FEEDBACK_ACTION_LABEL[getFeedbackAction(booking)]}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {feedbackBooking && (
        <FeedbackModal
          booking={feedbackBooking}
          readOnly={feedbackAction === 'view'}
          onClose={() => setFeedbackBooking(null)}
          onSubmit={handleFeedbackSubmit}
          submitting={submittingFeedback}
        />
      )}
    </CustomerLayout>
  );
}

export default MyBookings;
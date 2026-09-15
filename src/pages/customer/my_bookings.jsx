import { useState, useEffect } from 'react';
import CustomerLayout from './customer_layout';
import { useNavigate } from 'react-router-dom';
import { FiClock, FiMapPin, FiEye, FiStar } from 'react-icons/fi';
import FeedbackModal from '../../components/feedback_modal';
import { getStatusColor } from '../../utils/statusColors';

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

function MyBookings() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('All');
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedbackBooking, setFeedbackBooking] = useState(null);
  const [feedbackAction, setFeedbackAction] = useState(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const filters = ['All', 'Pending', 'Approved', 'In Progress', 'Completed', 'Cancelled'];

  const fetchBookings = () => {
    const token = localStorage.getItem('token');
    fetch('http://localhost:5000/api/bookings/mine', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setBookings(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const handleOpenFeedback = (booking, action) => {
    setFeedbackBooking(booking);
    setFeedbackAction(action);
  };

  const handleFeedbackSubmit = async ({ rating, text }) => {
    setSubmittingFeedback(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:5000/api/bookings/${feedbackBooking.bookingId}/feedback`, {
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
      setFeedbackBooking(null);
      fetchBookings();
    } catch (err) {
      alert('Could not connect to server.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  // Helper functions to safely render potential object fields
  const formatAddress = (address) => {
    if (!address) return 'N/A';
    if (typeof address === 'string') return address;
    if (typeof address === 'object') {
      return address.fullAddress || address.street || address.city || JSON.stringify(address);
    }
    return String(address);
  };

  const formatTechnician = (tech) => {
    if (!tech) return 'Not Assigned';
    if (typeof tech === 'string') return tech;
    if (typeof tech === 'object') {
      return tech.name || `${tech.firstName || ''} ${tech.lastName || ''}`.trim() || 'Assigned';
    }
    return String(tech);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const parsed = new Date(dateString);
    if (isNaN(parsed.getTime())) return String(dateString);
    return parsed.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
  };

  const filteredBookings =
    activeFilter === 'All'
      ? bookings
      : bookings.filter((b) => b.status === activeFilter);

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
      if (b.status !== 'Cancelled') idx = i;
    });
    return idx;
  })();

  return (
    <CustomerLayout title="My Bookings">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`filter-pill ${activeFilter === filter ? 'filter-pill--active' : ''}`}
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>

        <button type="button" className="bs-next-btn" onClick={() => navigate('/customer/book_service')}>
          New Booking
        </button>
      </div>

      {loading ? (
        <p>Loading bookings...</p>
      ) : filteredBookings.length === 0 ? (
        <p style={{ color: '#666' }}>No bookings found. <a href="/customer/book_service">Book one now</a></p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {sortedBookings.map((booking, i) => (
            <div key={booking._id || i}>
              {i === lastNonCancelledIndex + 1 && booking.status === 'Cancelled' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  margin: '8px 0 4px', color: '#999', fontSize: '12px', fontWeight: '600',
                }}>
                  <div style={{ flex: 1, height: '1px', background: '#e5e5e5' }} />
                  CANCELLED
                  <div style={{ flex: 1, height: '1px', background: '#e5e5e5' }} />
                </div>
              )}

              <div
                style={{
                  background: '#fff', border: '1px solid var(--card-border)', borderRadius: '12px',
                  padding: '18px 20px', display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr',
                  alignItems: 'center',
                  opacity: booking.status === 'Cancelled' ? 0.6 : 1,
                }}
              >
                <div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                    <small style={{ color: '#888' }}>
                      {formatDate(booking.createdAt)}
                    </small>
                    <span style={{ background: getStatusColor(booking.status), color: '#fff', padding: '2px 8px', borderRadius: '999px', fontSize: '11px' }}>
                      {booking.status}
                    </span>
                  </div>

                  <h3 style={{ margin: 0, fontSize: '18px' }}>{booking.service?.name || '—'}</h3>
                  <p style={{ margin: '4px 0', color: '#666' }}>{booking.bookingId}</p>
                  <small>Technician: {formatTechnician(booking.technician)}</small>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FiClock /> {typeof booking.date === 'string' ? booking.date : JSON.stringify(booking.date || 'N/A')}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FiMapPin /> {formatAddress(booking.address)}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                  <button
                    type="button"
                    style={{ background: 'transparent', border: '1px solid #d0dde8', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', color: '#333', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => navigate(`/customer/book_details/${booking.bookingId}`, { state: { booking } })}
                  >
                    <FiEye size={14} /> View Details
                  </button>

                  {getFeedbackAction(booking) && (
                    <button
                      type="button"
                      style={{ background: 'transparent', border: '1px solid #d0dde8', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', color: '#333', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={() => handleOpenFeedback(booking, getFeedbackAction(booking))}
                    >
                      <FiStar size={14} /> {FEEDBACK_ACTION_LABEL[getFeedbackAction(booking)]}
                    </button>
                  )}
                </div>
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
import { useState, useEffect } from 'react';
import CustomerLayout from './customer_layout';
import { useNavigate } from 'react-router-dom';
import { FiClock, FiMapPin, FiEye } from 'react-icons/fi';

function MyBookings() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('All');
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const filters = ['All', 'Pending', 'Approved', 'In Progress', 'Completed', 'Cancelled'];

  useEffect(() => {
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

  const getStatusColor = (status) => {
    switch (status) {
      case 'Completed': return '#22c55e';
      case 'Approved': return '#3b82f6';
      case 'In Progress': return '#f59e0b';
      case 'Cancelled': return '#ef4444';
      default: return '#f59e0b';
    }
  };

  return (
    <CustomerLayout title="My Bookings">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              style={{
                padding: '10px 18px', borderRadius: '999px', border: '1px solid #1b9ce5',
                background: activeFilter === filter ? '#1b9ce5' : '#fff',
                color: activeFilter === filter ? '#fff' : '#333', cursor: 'pointer',
              }}
            >
              {filter}
            </button>
          ))}
        </div>

        <button
          onClick={() => navigate('/customer/book_service')}
          style={{ background: '#1b9ce5', color: '#fff', border: 'none', borderRadius: '6px', padding: '10px 16px', cursor: 'pointer', fontWeight: '600' }}
        >
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
                  background: '#fff', border: '1px solid #d9d9d9', borderRadius: '12px',
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

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    style={{ background: 'transparent', border: '1px solid #d0dde8', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', color: '#333', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => navigate(`/customer/book_details/${booking.bookingId}`, { state: { booking } })}
                  >
                    <FiEye size={14} /> View Details
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </CustomerLayout>
  );
}

export default MyBookings;
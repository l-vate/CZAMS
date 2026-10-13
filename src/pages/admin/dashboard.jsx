import { useState, useEffect, useMemo } from 'react';
import AdminLayout from './admin_layout';
import AdminServiceDetailsModal from '../../components/admin_service_details_modal';
import DashboardCharts from '../../components/dashboard_charts';

import {
  FiClipboard,
  FiClock,
  FiCheckCircle,
  FiUsers,
  FiMapPin,
  FiEye,
} from 'react-icons/fi';
import { orFallback } from '../../services/apiClient';
import { listBookings, getTechnicianWorkload } from '../../services/bookingService';
import { listUsers } from '../../services/userService';
import { BOOKING_STATUS } from '../../constants/bookingStatus';

// Same badge/left-accent classes used by the customer's My Bookings and the
// technician's My Jobs cards (staff.css) - .tech-job-card colors its left
// border automatically off whichever of these badge classes it contains.
const STATUS_BADGE_CLASS = {
  Pending: 'tech-status-pending',
  Approved: 'tech-status-confirmed',
  'In Progress': 'tech-status-in-progress',
  Completed: 'tech-status-completed',
  Cancelled: 'tech-status-cancelled',
};

function formatAddress(address) {
  if (!address) return 'N/A';
  if (typeof address === 'string') return address;
  if (typeof address === 'object') {
    return address.fullAddress || address.street || address.city || 'N/A';
  }
  return String(address);
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const parsed = new Date(dateString);
  if (isNaN(parsed.getTime())) return String(dateString);
  return parsed.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
}


const CLIENT_TYPE_FILTERS = [
  { key: 'all', label: 'All Clients' },
  { key: 'Residential', label: 'Residential' },
  { key: 'Commercial', label: 'Commercial' },
];

const RECENT_BOOKINGS_LIMIT = 5;

function Dashboard() {
  const [bookings, setBookings] = useState([]);
  const [activeStaffCount, setActiveStaffCount] = useState(0);
  const [workload, setWorkload] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeClientType, setActiveClientType] = useState('all');
  const [selectedBooking, setSelectedBooking] = useState(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [bookingsData, staffData, workloadData] = await Promise.all([
          orFallback(listBookings(), []),
          orFallback(listUsers('staff'), []),
          orFallback(getTechnicianWorkload(), []),
        ]);
        setWorkload(Array.isArray(workloadData) ? workloadData : []);

        setBookings(Array.isArray(bookingsData) ? bookingsData : []);
        setActiveStaffCount(
          Array.isArray(staffData) ? staffData.filter((s) => s.isActive).length : 0
        );
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const filteredBookings = useMemo(() => {
    if (activeClientType === 'all') return bookings;
    return bookings.filter(
      (b) => (b.customer?.clientType || 'Residential') === activeClientType
    );
  }, [bookings, activeClientType]);

  const stats = useMemo(() => [
    {
      title: 'Total Bookings',
      value: filteredBookings.length,
      icon: <FiClipboard />,
    },
    {
      title: 'Pending Requests',
      value: filteredBookings.filter((b) => b.status === BOOKING_STATUS.PENDING).length,
      icon: <FiClock />,
    },
    {
      title: 'Completed Services',
      value: filteredBookings.filter((b) => b.status === BOOKING_STATUS.COMPLETED).length,
      icon: <FiCheckCircle />,
    },
    {
      title: 'Active Staff',
      value: activeStaffCount,
      icon: <FiUsers />,
    },
  ], [filteredBookings, activeStaffCount]);

  const recentBookings = filteredBookings.slice(0, RECENT_BOOKINGS_LIMIT);

  const handleBookingUpdated = (updatedBooking) => {
    setBookings((prev) =>
      prev.map((b) => (b.bookingId === updatedBooking.bookingId ? updatedBooking : b))
    );
    setSelectedBooking(updatedBooking);
  };

  return (
    <AdminLayout title="Dashboard">
      <div className="dashboard">
        <div className="dashboard-header">
          <h1 className="dashboard-welcome">Welcome, Admin</h1>
          <p>Manage bookings, staff, and services from one place.</p>
        </div>

        <div className="dash-filters">
          {CLIENT_TYPE_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`filter-pill ${activeClientType === filter.key ? 'filter-pill--active' : ''}`}
              onClick={() => setActiveClientType(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="stats-container">
          {stats.map((stat) => (
            <div className="stat-card" key={stat.title}>
              <div className="stat-icon">{stat.icon}</div>
              <h3>{loading ? '-' : stat.value}</h3>
              <p>{stat.title}</p>
            </div>
          ))}
        </div>

        <DashboardCharts bookings={filteredBookings} />

        <div className="recent-bookings">
          <h2>Technician Workload</h2>
          <p className="recent-bookings-body admin-dashboard-x1">
            Approved and in-progress bookings from today onward. Not affected by the client type filter.
          </p>
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Technician</th>
                <th>Upcoming Bookings</th>
                <th>Scheduled Today</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3}>Loading...</td></tr>
              ) : workload.length === 0 ? (
                <tr><td colSpan={3}>No active technicians.</td></tr>
              ) : (
                workload.map((t) => (
                  <tr key={t.technicianId}>
                    <td>{t.name}</td>
                    <td>{t.upcoming}</td>
                    <td>{t.today}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="recent-bookings">
          <h2>Recent Bookings</h2>

          {loading ? (
            <p className="recent-bookings-body">Loading bookings...</p>
          ) : recentBookings.length === 0 ? (
            <p className="recent-bookings-body admin-dashboard-x2">No bookings found.</p>
          ) : (
            <div className="tech-job-list recent-bookings-body">
              {recentBookings.map((b) => (
                <div className="tech-job-card" key={b._id}>
                  <div className="tech-job-info">
                    <div className="tech-job-top-row">
                      <small className="tech-job-date-label">{formatDate(b.createdAt)}</small>
                      <span className={`tech-job-status-badge ${STATUS_BADGE_CLASS[b.status] || ''}`}>
                        {b.status}
                      </span>
                    </div>
                    <div className="tech-job-service">{b.service?.name || 'N/A'}</div>
                    <small className="tech-job-booking">{b.bookingId} · {b.customer?.name || 'N/A'}</small>
                  </div>

                  <div className="tech-job-meta">
                    <FiClock /> {typeof b.date === 'string' ? b.date : 'N/A'}
                  </div>

                  <div className="tech-job-meta">
                    <FiMapPin /> {formatAddress(b.address)}
                  </div>

                  <button
                    className="view-details-btn"
                    onClick={() => setSelectedBooking(b)}
                  >
                    <FiEye size={14} /> View Details
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedBooking && (
        <AdminServiceDetailsModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onUpdated={handleBookingUpdated}
        />
      )}
    </AdminLayout>
  );
}

export default Dashboard;

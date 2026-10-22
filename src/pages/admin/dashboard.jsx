import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './admin_layout';
import DashboardCharts from '../../components/dashboard_charts';

import {
  FiClipboard,
  FiClock,
  FiCheckCircle,
  FiUsers,
  FiMapPin,
  FiEye,
  FiRotateCcw,
} from 'react-icons/fi';
import LoadError from '../../components/load_error';
import { clientGroupOf } from '../../utils/clientGroup';
import { listBookings, getTechnicianWorkload } from '../../services/bookingService';
import { listUsers } from '../../services/userService';
import { BOOKING_STATUS } from '../../constants/bookingStatus';
import { customerLabel } from '../../utils/customerLabel';
import { isFieldTechnician } from '../../utils/technicians';

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
  { key: 'Unknown', label: 'Deleted accounts' },
];

const RECENT_BOOKINGS_LIMIT = 5;

function Dashboard() {
  const [bookings, setBookings] = useState([]);
  const [activeStaffCount, setActiveStaffCount] = useState(0);
  const [workload, setWorkload] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [activeClientType, setActiveClientType] = useState('all');
  const navigate = useNavigate();

  // A failed load is an error with a Retry, never zeros and empty tables that look like "no bookings".
  const fetchData = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [bookingsData, staffData, workloadData] = await Promise.all([
        listBookings(),
        listUsers('staff'),
        getTechnicianWorkload(),
      ]);
      if (![bookingsData, staffData, workloadData].every(Array.isArray)) throw new Error('Unexpected reply');
      setWorkload(workloadData);
      setBookings(bookingsData);
      setActiveStaffCount(staffData.filter((s) => s.isActive && isFieldTechnician(s)).length);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredBookings = useMemo(() => {
    if (activeClientType === 'all') return bookings;
    return bookings.filter((b) => clientGroupOf(b.customer) === activeClientType);
  }, [bookings, activeClientType]);

  const stats = useMemo(() => [
    {
      title: 'Total Bookings',
      value: filteredBookings.filter((b) => !b.isBackJob).length,
      icon: <FiClipboard />,
    },
    {
      title: 'Back Job Visits',
      value: filteredBookings.filter((b) => b.isBackJob).length,
      icon: <FiRotateCcw />,
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

  return (
    <AdminLayout title="Dashboard">
      <div className="dashboard">
        <div className="dashboard-header">
          <h1 className="dashboard-welcome">Welcome, Admin</h1>
          <p>Manage bookings, staff, and services from one place.</p>
        </div>

        {failed && <LoadError message="Could not load the dashboard." onRetry={fetchData} />}

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
              <h3>{loading || failed ? '-' : stat.value}</h3>
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
              {failed ? null : loading ? (
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

          {failed ? null : loading ? (
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
                    <small className="tech-job-booking">{b.bookingId} · {customerLabel(b.customer)}</small>
                  </div>

                  <div className="tech-job-meta">
                    <FiClock /> {typeof b.date === 'string' ? b.date : 'N/A'}
                  </div>

                  <div className="tech-job-meta">
                    <FiMapPin /> {formatAddress(b.address)}
                  </div>

                  <button
                    className="view-details-btn"
                    onClick={() => navigate(`/admin/services/requests/${encodeURIComponent(b.bookingId)}`)}
                  >
                    <FiEye size={14} /> View Details
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </AdminLayout>
  );
}

export default Dashboard;

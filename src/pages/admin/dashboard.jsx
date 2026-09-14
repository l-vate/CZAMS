import { useState, useEffect, useMemo } from 'react';
import AdminLayout from './admin_layout';

import {
  FiClipboard,
  FiClock,
  FiCheckCircle,
  FiUsers,
} from 'react-icons/fi';

const API_BASE = 'http://localhost:5000';

const CLIENT_TYPE_FILTERS = [
  { key: 'all', label: 'All Clients' },
  { key: 'Residential', label: 'Residential' },
  { key: 'Commercial', label: 'Commercial' },
];

const RECENT_BOOKINGS_LIMIT = 5;

function getStatusColor(status) {
  switch (status) {
    case 'Completed': return '#22c55e';
    case 'Approved': return '#3b82f6';
    case 'In Progress': return '#8b5cf6';
    case 'Cancelled': return '#ef4444';
    case 'Pending': return '#f97316';
    default: return '#64748b';
  }
}

function Dashboard() {
  const [bookings, setBookings] = useState([]);
  const [activeStaffCount, setActiveStaffCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeClientType, setActiveClientType] = useState('all');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };

        const [bookingsRes, staffRes] = await Promise.all([
          fetch(`${API_BASE}/api/bookings`, { headers }),
          fetch(`${API_BASE}/api/users?role=staff`, { headers }),
        ]);

        const bookingsData = bookingsRes.ok ? await bookingsRes.json() : [];
        const staffData = staffRes.ok ? await staffRes.json() : [];

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
      value: filteredBookings.filter((b) => b.status === 'Pending').length,
      icon: <FiClock />,
    },
    {
      title: 'Completed Services',
      value: filteredBookings.filter((b) => b.status === 'Completed').length,
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
          <h1>Welcome, Admin</h1>
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
              <h3>{loading ? '—' : stat.value}</h3>
              <p>{stat.title}</p>
            </div>
          ))}
        </div>

        <div className="recent-bookings">
          <h2>Recent Bookings</h2>

          <table>
            <thead>
              <tr>
                <th>Booking ID</th>
                <th>Customer</th>
                <th>Service</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr><td colSpan={4}>Loading bookings...</td></tr>
              ) : recentBookings.length === 0 ? (
                <tr><td colSpan={4}>No bookings found.</td></tr>
              ) : (
                recentBookings.map((b) => (
                  <tr key={b._id}>
                    <td>{b.bookingId}</td>
                    <td>{b.customer?.name || 'N/A'}</td>
                    <td>{b.service?.name || 'N/A'}</td>
                    <td>
                      <span className="req-status-badge" style={{ background: getStatusColor(b.status) }}>
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

export default Dashboard;

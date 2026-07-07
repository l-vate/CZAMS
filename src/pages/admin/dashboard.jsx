import AdminLayout from './admin_layout';
import '../../css/admin.css';
import {
  FiClipboard,
  FiClock,
  FiCheckCircle,
  FiUsers,
} from 'react-icons/fi';

function Dashboard() {
  const stats = [
    { title: 'Total Bookings', value: 128, icon: <FiClipboard /> },
    { title: 'Pending Requests', value: 15, icon: <FiClock /> },
    { title: 'Completed Services', value: 98, icon: <FiCheckCircle /> },
    { title: 'Active Staff', value: 12, icon: <FiUsers /> },
  ];

  const bookings = [
    { id: 'CZ-2026-7523', customer: 'John Doe', service: 'Cleaning', status: 'Pending' },
    { id: 'CZ-2026-7524', customer: 'Jane Smith', service: 'Repair', status: 'Approved' },
    { id: 'CZ-2026-7525', customer: 'Michael Cruz', service: 'Installation', status: 'Completed' },
  ];

  const statusClass = {
    Pending: 'admin-status-pending',
    Approved: 'admin-status-approved',
    Completed: 'admin-status-completed',
  };

  return (
    <AdminLayout title="Dashboard">
      <div className="dashboard">
        <div className="dashboard-header">
          <h1>Welcome, Admin</h1>
          <p>Manage bookings, staff, and services from one place.</p>
        </div>

        <div className="stats-container">
          {stats.map((stat) => (
            <div className="stat-card" key={stat.title}>
              <div className="stat-icon">{stat.icon}</div>
              <h3>{stat.value}</h3>
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
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>{b.id}</td>
                  <td>{b.customer}</td>
                  <td>{b.service}</td>
                  <td>
                    <span className={`admin-status-badge ${statusClass[b.status]}`}>
                      {b.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

export default Dashboard;
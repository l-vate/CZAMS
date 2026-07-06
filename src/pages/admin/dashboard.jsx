import AdminLayout from './admin_layout';
import '../../css/admin.css';

function Dashboard() {
    const stats = [
        { title: 'Total Bookings', value: 128, icon: '📋' },
        { title: 'Pending Requests', value: 15, icon: '⏳' },
        { title: 'Completed Services', value: 98, icon: '✅' },
        { title: 'Active Staff', value: 12, icon: '👨‍🔧' }
    ];

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
                            <tr>
                                <td>BK-001</td>
                                <td>John Doe</td>
                                <td>Cleaning</td>
                                <td>Pending</td>
                            </tr>
                            <tr>
                                <td>BK-002</td>
                                <td>Jane Smith</td>
                                <td>Repair</td>
                                <td>Approved</td>
                            </tr>
                            <tr>
                                <td>BK-003</td>
                                <td>Michael Cruz</td>
                                <td>Installation</td>
                                <td>Completed</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </AdminLayout>
    );
}

export default Dashboard;
import AdminLayout from './admin_layout';

function Analytics() {
    const serviceAnalytics = [
        { service: 'Cleaning', requests: 145 },
        { service: 'Repair', requests: 98 },
        { service: 'Installation', requests: 76 }
    ];

    const technicianAnalytics = [
        {
            name: 'Juan Dela Cruz',
            completedJobs: 52,
            avgTime: '2.1 hrs',
            delays: 3,
            missedAssignments: 0
        },
        {
            name: 'Maria Santos',
            completedJobs: 47,
            avgTime: '1.8 hrs',
            delays: 1,
            missedAssignments: 1
        },
        {
            name: 'Carlo Reyes',
            completedJobs: 39,
            avgTime: '2.4 hrs',
            delays: 4,
            missedAssignments: 2
        }
    ];

    const customerFeedback = [
        {
            customer: 'John Doe',
            rating: 5,
            feedback: 'Excellent service and very professional.'
        },
        {
            customer: 'Jane Smith',
            rating: 4,
            feedback: 'Quick response and good communication.'
        },
        {
            customer: 'Mark Cruz',
            rating: 3,
            feedback: 'Service completed but arrived late.'
        }
    ];

    return (
        <AdminLayout title="Analytics">
            <div className="analytics-page">

                <h1 className="dashboard-welcome">Analytics Dashboard</h1>

                {/* Overview Cards */}
                <div className="analytics-cards">
                    <div className="analytics-card">
                        <h3>Total Service Requests</h3>
                        <p>319</p>
                    </div>

                    <div className="analytics-card">
                        <h3>Average Response Time</h3>
                        <p>1.7 Hours</p>
                    </div>

                    <div className="analytics-card">
                        <h3>New Customers</h3>
                        <p>124</p>
                    </div>

                    <div className="analytics-card">
                        <h3>Returning Customers</h3>
                        <p>286</p>
                    </div>
                </div>

                {/* Service Request Analytics */}
                <section className="analytics-section">
                    <h2>Service Request Analytics</h2>

                    <table className="analytics-table">
                        <thead>
                            <tr>
                                <th>Service</th>
                                <th>Total Requests</th>
                            </tr>
                        </thead>
                        <tbody>
                            {serviceAnalytics.map((service, index) => (
                                <tr key={index}>
                                    <td>{service.service}</td>
                                    <td>{service.requests}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="analytics-info">
                        <p><strong>Most Requested Service:</strong> Cleaning</p>
                        <p><strong>Average Response Time:</strong> 1.7 Hours</p>
                    </div>
                </section>

                {/* Technician Performance */}
                <section className="analytics-section">
                    <h2>Technician Performance Analytics</h2>

                    <table className="analytics-table">
                        <thead>
                            <tr>
                                <th>Technician</th>
                                <th>Completed Jobs</th>
                                <th>Average Service Time</th>
                                <th>Delays</th>
                                <th>Missed Assignments</th>
                            </tr>
                        </thead>
                        <tbody>
                            {technicianAnalytics.map((tech, index) => (
                                <tr key={index}>
                                    <td>{tech.name}</td>
                                    <td>{tech.completedJobs}</td>
                                    <td>{tech.avgTime}</td>
                                    <td>{tech.delays}</td>
                                    <td>{tech.missedAssignments}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>

                {/* Customer Analytics */}
                <section className="analytics-section">
                    <h2>Customer Analytics</h2>

                    <div className="analytics-cards">
                        <div className="analytics-card">
                            <h3>New Customers</h3>
                            <p>124</p>
                        </div>

                        <div className="analytics-card">
                            <h3>Returning Customers</h3>
                            <p>286</p>
                        </div>

                        <div className="analytics-card">
                            <h3>Average Rating</h3>
                            <p>4.4 / 5</p>
                        </div>
                    </div>

                    <table className="analytics-table">
                        <thead>
                            <tr>
                                <th>Customer</th>
                                <th>Rating</th>
                                <th>Feedback</th>
                            </tr>
                        </thead>
                        <tbody>
                            {customerFeedback.map((item, index) => (
                                <tr key={index}>
                                    <td>{item.customer}</td>
                                    <td>{item.rating}/5</td>
                                    <td>{item.feedback}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>

                {/* Additional Analytics */}
                <section className="analytics-section">
                    <h2>Additional Business Analytics</h2>

                    <div className="analytics-cards">
                        <div className="analytics-card">
                            <h3>Completed Bookings</h3>
                            <p>245</p>
                        </div>

                        <div className="analytics-card">
                            <h3>Pending Requests</h3>
                            <p>34</p>
                        </div>

                        <div className="analytics-card">
                            <h3>Cancelled Bookings</h3>
                            <p>18</p>
                        </div>

                        <div className="analytics-card">
                            <h3>Service Completion Rate</h3>
                            <p>92%</p>
                        </div>
                    </div>
                </section>

            </div>
        </AdminLayout>
    );
}

export default Analytics;
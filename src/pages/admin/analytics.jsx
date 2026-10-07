import { useState, useEffect, useMemo } from 'react';
import AdminLayout from './admin_layout';
import { buildTechnicianStats } from '../../utils/technicianStats';
import DashboardCharts from '../../components/dashboard_charts';
import { loadAnalyticsData } from '../../services/analyticsService';
import { BOOKING_STATUS } from '../../constants/bookingStatus';


const CLIENT_TYPE_FILTERS = [
    { key: 'all', label: 'All Clients' },
    { key: 'Residential', label: 'Residential' },
    { key: 'Commercial', label: 'Commercial' },
];

// How many bookings must have a recorded delay condition before a technician's
// row is flagged as having a real delay pattern (kept as-is here for row display,
// no threshold needed - every booking with a delay condition is counted directly).
const REQUEST_VOLUME_MONTHS = 6;

// Service Request Analytics: "average response time" = time between a booking
// being created and an admin approving it (bookingSchema.approvedAt, set once on
// first approval in bookingRoutes.js admin-update) minus createdAt. Bookings never
// approved (still Pending/Cancelled before approval) have no approvedAt and are
// excluded from the average, not counted as zero.
function computeAvgResponseHours(bookings) {
    const withResponse = bookings.filter((b) => b.approvedAt && b.createdAt);
    if (withResponse.length === 0) return null;
    const totalMs = withResponse.reduce(
        (sum, b) => sum + (new Date(b.approvedAt) - new Date(b.createdAt)),
        0
    );
    return totalMs / withResponse.length / (1000 * 60 * 60);
}

function monthKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
    const [year, month] = key.split('-');
    const d = new Date(Number(year), Number(month) - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function Analytics() {
    const [bookings, setBookings] = useState([]);
    const [reports, setReports] = useState([]);
    const [backJobs, setBackJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeClientType, setActiveClientType] = useState('all');

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                const data = await loadAnalyticsData();
                setBookings(data.bookings);
                setReports(data.reports);
                setBackJobs(data.backJobs);
            } catch (err) {
                console.error('Error loading analytics data:', err);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, []);

    const filteredBookings = useMemo(() => {
        if (activeClientType === 'all') return bookings;
        return bookings.filter((b) => (b.customer?.clientType || 'Residential') === activeClientType);
    }, [bookings, activeClientType]);

    const filteredReports = useMemo(() => {
        if (activeClientType === 'all') return reports;
        return reports.filter(
            (r) => (r.bookingDetails?.customer?.clientType || 'Residential') === activeClientType
        );
    }, [reports, activeClientType]);

    // ── Service Request Analytics ──
    // A free back-job repair visit is a redo of a service already counted, not a new
    // request from a customer, so it is left out of every request metric below.
    // Back jobs are reported separately in the Back Jobs card.
    const requestBookings = useMemo(() => filteredBookings.filter((b) => !b.isBackJob), [filteredBookings]);

    const serviceAnalytics = useMemo(() => {
        const counts = {};
        requestBookings.forEach((b) => {
            const name = b.service?.name || 'Unknown';
            counts[name] = (counts[name] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([service, requests]) => ({ service, requests }))
            .sort((a, b) => b.requests - a.requests);
    }, [requestBookings]);

    const requestVolumeByMonth = useMemo(() => {
        const counts = {};
        requestBookings.forEach((b) => {
            if (!b.createdAt) return;
            const key = monthKey(b.createdAt);
            counts[key] = (counts[key] || 0) + 1;
        });
        return Object.entries(counts)
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .slice(-REQUEST_VOLUME_MONTHS)
            .map(([key, count]) => ({ label: monthLabel(key), count }));
    }, [requestBookings]);

    const avgResponseHours = useMemo(() => computeAvgResponseHours(requestBookings), [requestBookings]);

    // Back jobs come straight from the BackJob collection (not the free bookings they
    // spawn). Within warranty = a free visit was scheduled; Not Covered = outside the
    // warranty window at the time the claim was filed.
    const backJobWithin = backJobs.filter((bj) => bj.warrantyCheck?.withinWarranty === true).length;
    const backJobNotCovered = backJobs.filter((bj) => bj.warrantyCheck?.withinWarranty === false).length;

    // ── Technician Performance Analytics ──
    const technicianAnalytics = useMemo(
        () => buildTechnicianStats(filteredBookings, filteredReports),
        [filteredBookings, filteredReports]
    );

    // ── Customer Analytics ──
    // New vs. Returning is deliberately independent of the Customer Classification
    // Module (User.manualClassification / the 3-completed-bookings-in-12-months perk threshold) -
    // that field answers a different question and would call a genuinely returning
    // customer "new" until they cross that count. Here: total completed bookings per
    // customer, 1 = New, 2+ = Returning. A customer with 0 completed bookings hasn't
    // been served yet and isn't counted as either.
    const customerCompletedCounts = useMemo(() => {
        const counts = {};
        filteredBookings.forEach((b) => {
            if (b.status !== BOOKING_STATUS.COMPLETED) return;
            const id = b.customer?._id;
            if (!id) return;
            counts[id] = (counts[id] || 0) + 1;
        });
        return counts;
    }, [filteredBookings]);

    const newCustomerCount = Object.values(customerCompletedCounts).filter((c) => c === 1).length;
    const returningCustomerCount = Object.values(customerCompletedCounts).filter((c) => c >= 2).length;

    const ratedBookings = useMemo(
        () => filteredBookings.filter((b) => typeof b.feedback?.rating === 'number'),
        [filteredBookings]
    );
    const avgRating = ratedBookings.length
        ? ratedBookings.reduce((sum, b) => sum + b.feedback.rating, 0) / ratedBookings.length
        : null;

    const recentFeedback = useMemo(
        () =>
            filteredBookings
                .filter((b) => b.feedback?.text)
                .sort((a, b) => new Date(b.feedback.createdAt || 0) - new Date(a.feedback.createdAt || 0))
                .slice(0, 10),
        [filteredBookings]
    );

    // ── Additional Business Analytics ──
    const completedCount = filteredBookings.filter((b) => b.status === BOOKING_STATUS.COMPLETED).length;
    const pendingCount = filteredBookings.filter((b) => b.status === BOOKING_STATUS.PENDING).length;
    const cancelledCount = filteredBookings.filter((b) => b.status === BOOKING_STATUS.CANCELLED).length;
    const completionRate = filteredBookings.length
        ? (completedCount / filteredBookings.length) * 100
        : 0;

    const fmtHours = (h) => (h === null || h === undefined ? 'N/A' : `${h.toFixed(1)} hrs`);

    return (
        <AdminLayout title="Analytics">
            <div className="analytics-page">

                <h1 className="dashboard-welcome">Analytics Dashboard</h1>

                <div className="analytics-filters">
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

                {/* Overview Cards */}
                <div className="analytics-cards">
                    <div className="analytics-card">
                        <h3>Total Service Requests</h3>
                        <p>{loading ? '-' : requestBookings.length}</p>
                    </div>

                    <div className="analytics-card">
                        <h3>Average Response Time</h3>
                        <p>{loading ? '-' : fmtHours(avgResponseHours)}</p>
                    </div>

                    <div className="analytics-card">
                        <h3>New Customers</h3>
                        <p>{loading ? '-' : newCustomerCount}</p>
                    </div>

                    <div className="analytics-card">
                        <h3>Back Jobs</h3>
                        <p>{loading ? '-' : backJobs.length}</p>
                        {!loading && (
                            <small>Within warranty: {backJobWithin} · Not covered: {backJobNotCovered}</small>
                        )}
                    </div>

                    <div className="analytics-card">
                        <h3>Returning Customers</h3>
                        <p>{loading ? '-' : returningCustomerCount}</p>
                    </div>
                </div>

                <DashboardCharts bookings={filteredBookings} />

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
                            {serviceAnalytics.length === 0 ? (
                                <tr><td colSpan={2}>No requests yet.</td></tr>
                            ) : (
                                serviceAnalytics.map((service) => (
                                    <tr key={service.service}>
                                        <td>{service.service}</td>
                                        <td>{service.requests}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>

                    <table className="analytics-table">
                        <thead>
                            <tr>
                                <th>Month</th>
                                <th>Requests</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requestVolumeByMonth.length === 0 ? (
                                <tr><td colSpan={2}>No requests yet.</td></tr>
                            ) : (
                                requestVolumeByMonth.map((row) => (
                                    <tr key={row.label}>
                                        <td>{row.label}</td>
                                        <td>{row.count}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>

                    <div className="analytics-info">
                        <p><strong>Most Requested Service:</strong> {serviceAnalytics[0]?.service || 'N/A'}</p>
                        <p><strong>Average Response Time:</strong> {fmtHours(avgResponseHours)}</p>
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
                            </tr>
                        </thead>
                        <tbody>
                            {technicianAnalytics.length === 0 ? (
                                <tr><td colSpan={4}>No technician activity yet.</td></tr>
                            ) : (
                                technicianAnalytics.map((tech) => (
                                    <tr key={tech.id}>
                                        <td>{tech.name}</td>
                                        <td>{tech.completedJobs}</td>
                                        <td>{fmtHours(tech.avgTime)}</td>
                                        <td>{tech.delays}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </section>

                {/* Customer Analytics */}
                <section className="analytics-section">
                    <h2>Customer Analytics</h2>

                    <div className="analytics-cards">
                        <div className="analytics-card">
                            <h3>New Customers</h3>
                            <p>{newCustomerCount}</p>
                        </div>

                        <div className="analytics-card">
                            <h3>Returning Customers</h3>
                            <p>{returningCustomerCount}</p>
                        </div>

                        <div className="analytics-card">
                            <h3>Average Rating</h3>
                            <p>{avgRating === null ? 'N/A' : `${avgRating.toFixed(1)} / 5`}</p>
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
                            {recentFeedback.length === 0 ? (
                                <tr><td colSpan={3}>No feedback yet.</td></tr>
                            ) : (
                                recentFeedback.map((b) => (
                                    <tr key={b._id}>
                                        <td>{b.customer?.name || 'N/A'}</td>
                                        <td>{b.feedback.rating}/5</td>
                                        <td>{b.feedback.text}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </section>

                {/* Additional Analytics */}
                <section className="analytics-section">
                    <h2>Additional Business Analytics</h2>

                    <div className="analytics-cards">
                        <div className="analytics-card">
                            <h3>Completed Bookings</h3>
                            <p>{completedCount}</p>
                        </div>

                        <div className="analytics-card">
                            <h3>Pending Requests</h3>
                            <p>{pendingCount}</p>
                        </div>

                        <div className="analytics-card">
                            <h3>Cancelled Bookings</h3>
                            <p>{cancelledCount}</p>
                        </div>

                        <div className="analytics-card">
                            <h3>Service Completion Rate</h3>
                            <p>{filteredBookings.length ? `${completionRate.toFixed(0)}%` : 'N/A'}</p>
                        </div>
                    </div>
                </section>

            </div>
        </AdminLayout>
    );
}

export default Analytics;

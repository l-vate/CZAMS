import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import AdminLayout from './admin_layout';
import PersonFilterBanner from '../../components/person_filter_banner';
import { getStatusColor, getFilterPillStyle, textOnFill } from '../../utils/statusColors';
import { FiEye } from 'react-icons/fi';
import { orFallback } from '../../services/apiClient';
import { listBookings } from '../../services/bookingService';
import { getMembers, getMemberNames } from '../../utils/assignments';
import PendingQueue from '../../components/pending_queue';
import { customerLabel } from '../../utils/customerLabel';
import { BOOKING_STATUS_VALUES } from '../../constants/bookingStatus';

function ServiceRequests() {
    const navigate = useNavigate();
    const location = useLocation();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    // 'all' = every booking; 'queue' = the Pending queue (first come, first served, reorderable)
    const [view, setView] = useState('all');
    // Manage Accounts' "View Job History" (technician) / "View Bookings" (client)
    // links land here with a person filter pre-applied via navigation state, rather
    // than this page having its own duplicate list of every technician/client.
    const [personFilter, setPersonFilter] = useState(location.state?.personFilter || null);

    const filters = ['All', ...BOOKING_STATUS_VALUES];

    // A notification links here with ?booking=<id>: go straight to that booking's page.
    const [searchParams] = useSearchParams();
    const bookingFromLink = searchParams.get('booking');
    useEffect(() => {
        if (bookingFromLink) navigate(`/admin/services/requests/${encodeURIComponent(bookingFromLink)}`, { replace: true });
    }, [bookingFromLink, navigate]);

    useEffect(() => {
        fetchRequests();
    }, []);

    const filteredRequests = requests
        .filter((req) => activeFilter === 'All' || req.status === activeFilter)
        .filter((req) => {
            if (!personFilter) return true;
            if (personFilter.type === 'technician') return getMembers(req).some((m) => m._id === personFilter.id);
            return req.customer?._id === personFilter.id;
        })
        .filter((req) => {
            const term = searchQuery.trim().toLowerCase();
            if (!term) return true;
            const haystack = [
                req.bookingId,
                req.service?.name,
                customerLabel(req.customer, ''),
                getMemberNames(req, ''),
            ].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(term);
        });

    const fetchRequests = async () => {
        try {
            const data = await orFallback(listBookings(), []);
            setRequests(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error fetching bookings:', error);
        } finally {
            setLoading(false);
        }
    };

    // A booking opens on its own page (pages/admin/booking_details_page.jsx).
    const handleViewDetails = (booking) => {
        navigate(`/admin/services/requests/${encodeURIComponent(booking.bookingId)}`);
    };

    return (
        <AdminLayout
            title="Bookings"
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Search by booking ID, service, customer, or technician..."
        >
            <div className="page-container">
                <h1 className="dashboard-welcome">Bookings</h1>
                <div className="req-filters admin-service-requests-x1">
                    {[['all', 'All Bookings'], ['queue', 'Pending Queue']].map(([key, label]) => (
                        <button
                            key={key}
                            className={`filter-pill ${view === key ? 'filter-pill--active' : ''}`}
                            onClick={() => setView(key)}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {view === 'queue' && (
                    <PendingQueue onViewDetails={handleViewDetails} />
                )}

                {view === 'all' && (<>
                <div className="req-toolbar">
                    <div className="req-filters">
                        {filters.map((filter) => (
                            <button
                                key={filter}
                                className={`filter-pill ${activeFilter === filter ? 'filter-pill--active' : ''}`}
                                style={getFilterPillStyle(filter, activeFilter === filter)}
                                onClick={() => setActiveFilter(filter)}
                            >
                                {filter}
                            </button>
                        ))}
                    </div>
                    <button
                        className="req-new-btn"
                        onClick={() => navigate('/admin/services/requests/new')}
                    >
                        + New Booking
                    </button>
                </div>

                <PersonFilterBanner filter={personFilter} onClear={() => setPersonFilter(null)} />

                {loading ? (
                    <p>Loading bookings...</p>
                ) : filteredRequests.length === 0 ? (
                    <p className="req-empty">No bookings found.</p>
                ) : (
                    <div className="req-grid">
                        {filteredRequests.map((req) => (
                            <div className="req-card" key={req._id}>
                                <div className="req-card-top">
                                    <span className="req-date">
                                        {req.createdAt
                                            ? new Date(req.createdAt).toLocaleDateString('en-US', {
                                                  month: '2-digit',
                                                  day: '2-digit',
                                                  year: '2-digit',
                                              })
                                            : 'N/A'}
                                    </span>
                                    <span
                                        className="req-status-badge"
                                        style={{ background: getStatusColor(req.status), color: textOnFill(getStatusColor(req.status)) }}
                                    >
                                        {req.status}
                                    </span>
                                </div>

                                <div className="req-card-body">
                                    <p className="req-title">{req.service?.name || 'N/A'}</p>
                                    <p className="req-id">{req.bookingId}</p>
                                    <p className="req-tech">
                                        Technicians: {getMemberNames(req, 'Not Assigned')}{req.needsReassignment ? ' (needs a new technician)' : ''}
                                    </p>
                                    
                                    <div className="req-info-item">
                                        <svg
                                            className="req-info-icon"
                                            width="16" height="16" viewBox="0 0 24 24"
                                            fill="none" stroke="currentColor" strokeWidth="2"
                                            strokeLinecap="round" strokeLinejoin="round"
                                        >
                                            <circle cx="12" cy="12" r="10" />
                                            <polyline points="12 6 12 12 16 14" />
                                        </svg>
                                        <span>{req.date || 'N/A'}</span>
                                    </div>
                                </div>

                                <div className="req-card-bottom">
                                    <button
                                        className="view-details-btn"
                                        onClick={() => handleViewDetails(req)}
                                    >
                                        <FiEye size={14} /> View Details
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                </>)}
            </div>
        </AdminLayout>
    );
}

export default ServiceRequests;
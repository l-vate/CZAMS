import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import AdminLayout from './admin_layout';
import PersonFilterBanner from '../../components/person_filter_banner';
import { getStatusColor, textOnFill } from '../../utils/statusColors';
import { FiClock, FiPlus } from 'react-icons/fi';
import { orFallback } from '../../services/apiClient';
import { listBookings } from '../../services/bookingService';
import { getMembers, getMemberNames } from '../../utils/assignments';
import PendingQueue from '../../components/pending_queue';
import { customerLabel } from '../../utils/customerLabel';
import { BOOKING_STATUS_VALUES } from '../../constants/bookingStatus';
import { manilaTodayKey } from '../../utils/manilaTime';
import { addDaysKey } from '../../utils/needsAttention';
import { bookedForText, createdText, techniciansSummary, statusCounts } from '../../utils/bookingCardText';

function ServiceRequests() {
    const navigate = useNavigate();
    const location = useLocation();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    // The "Needs attention" panel links here with ?filter=<status> (View all) and ?when=soon (bookings dated today or tomorrow).
    const [linkParams] = useSearchParams();
    const linkedFilter = linkParams.get('filter');
    const [activeFilter, setActiveFilter] = useState(BOOKING_STATUS_VALUES.includes(linkedFilter) ? linkedFilter : 'All');
    const [soonOnly, setSoonOnly] = useState(linkParams.get('when') === 'soon');
    const [searchQuery, setSearchQuery] = useState('');
    // 'all' = every booking; 'queue' = the Pending queue (first come, first served, reorderable)
    const [view, setView] = useState('all');
    // Manage Accounts' "View Job History" (technician) / "View Bookings" (client)
    // links land here with a person filter pre-applied via navigation state, rather
    // than this page having its own duplicate list of every technician/client.
    const [personFilter, setPersonFilter] = useState(location.state?.personFilter || null);

    const filters = ['All', ...BOOKING_STATUS_VALUES];
    const counts = statusCounts(requests, BOOKING_STATUS_VALUES);
    const tabRefs = useRef({});
    const VIEWS = [['all', 'All Bookings'], ['queue', 'Pending Queue']];
    // arrow keys move between the two tabs, as a tab list does
    const onTabKey = (e, index) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const next = VIEWS[(index + (e.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length][0];
        setView(next);
        tabRefs.current[next]?.focus();
    };

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
            if (!soonOnly) return true;
            const today = manilaTodayKey();
            return ['Pending', 'Approved'].includes(req.status) && Boolean(req.date) && req.date <= addDaysKey(today, 1);
        })
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
                <div className="req-page-head">
                    <h1 className="dashboard-welcome">Bookings</h1>
                    <button
                        type="button"
                        className="req-new-btn"
                        onClick={() => navigate('/admin/services/requests/new')}
                    >
                        <FiPlus aria-hidden="true" /> New Booking
                    </button>
                </div>
                <div className="req-tabs admin-service-requests-x1" role="tablist" aria-label="Bookings view">
                    {VIEWS.map(([key, label], index) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            id={`req-tab-${key}`}
                            ref={(el) => { tabRefs.current[key] = el; }}
                            aria-selected={view === key}
                            aria-controls="req-view-panel"
                            tabIndex={view === key ? 0 : -1}
                            className={`req-tab${view === key ? ' req-tab--active' : ''}`}
                            onClick={() => setView(key)}
                            onKeyDown={(e) => onTabKey(e, index)}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div id="req-view-panel" role="tabpanel" aria-labelledby={`req-tab-${view}`}>
                {view === 'queue' && (
                    <PendingQueue onViewDetails={handleViewDetails} />
                )}

                {view === 'all' && (<>
                <div className="req-chips" role="group" aria-label="Filter by status">
                    {filters.map((filter) => (
                        <button
                            key={filter}
                            type="button"
                            className={`req-chip${activeFilter === filter ? ' req-chip--active' : ''}`}
                            aria-pressed={activeFilter === filter}
                            onClick={() => setActiveFilter(filter)}
                        >
                            {filter} <span className="req-chip-count">{counts[filter]}</span>
                        </button>
                    ))}
                </div>

                {soonOnly && (
                    <p className="req-soon-note" role="status">
                        Showing the Pending and Approved bookings dated today or tomorrow, and any that missed their date.{' '}
                        <button type="button" className="req-soon-clear" onClick={() => setSoonOnly(false)}>Show all</button>
                    </p>
                )}

                <PersonFilterBanner filter={personFilter} onClear={() => setPersonFilter(null)} />

                {loading ? (
                    <p>Loading bookings...</p>
                ) : filteredRequests.length === 0 ? (
                    <p className="req-empty">No bookings found.</p>
                ) : (
                    <div className="req-grid">
                        {filteredRequests.map((req) => {
                            const tech = techniciansSummary(getMembers(req), req.needsReassignment);
                            return (
                                <article className="req-card" key={req._id}>
                                    <div className="req-card-top">
                                        <span className="req-date">{createdText(req.createdAt)}</span>
                                        <span
                                            className="req-status-badge"
                                            style={{ background: getStatusColor(req.status), color: textOnFill(getStatusColor(req.status)) }}
                                        >
                                            {req.status}
                                        </span>
                                    </div>

                                    <div className="req-card-body">
                                        <p className="req-booked"><FiClock aria-hidden="true" /> {bookedForText(req.date)}</p>
                                        <p className="req-title">{req.service?.name || 'N/A'}</p>
                                        <p className="req-id">{req.bookingId}</p>
                                        {req.expiredBySystem && <p className="req-expired">Expired (not confirmed in time)</p>}
                                        {req.noShow?.status === 'Reported' && <p className="req-expired">Technician no show reported</p>}
                                        <p className="req-tech">
                                            <span className="req-tech-count">{tech.count}</span>
                                            {tech.names && <span className="req-tech-names" title={tech.names}>{tech.names}</span>}
                                            {tech.needsNew && <span className="req-tech-note">Needs a new technician</span>}
                                        </p>
                                    </div>

                                    <div className="req-card-bottom">
                                        {/* the link's ::after covers the whole card, so the card is one link to the details */}
                                        <Link
                                            className="req-card-link"
                                            to={`/admin/services/requests/${encodeURIComponent(req.bookingId)}`}
                                            aria-label={`View details for booking ${req.bookingId}`}
                                        >
                                            View details
                                        </Link>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
                </>)}
                </div>
            </div>
        </AdminLayout>
    );
}

export default ServiceRequests;
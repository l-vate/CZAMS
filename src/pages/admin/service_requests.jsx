import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './admin_layout';
import AdminServiceDetailsModal from '../../components/admin_service_details_modal';
import { getStatusColor } from '../../utils/statusColors';

function ServiceRequests() {
    const navigate = useNavigate();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('All');
    const [selectedBooking, setSelectedBooking] = useState(null);

    const filters = ['All', 'Pending', 'Approved', 'In Progress', 'Completed', 'Cancelled'];

    useEffect(() => {
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('http://localhost:5000/api/bookings', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json();
            setRequests(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error fetching bookings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleViewDetails = (booking) => {
        setSelectedBooking(booking);
    };

    const handleBookingUpdated = (updatedBooking) => {
        setRequests((prev) =>
            prev.map((req) => (req.bookingId === updatedBooking.bookingId ? updatedBooking : req))
        );
        setSelectedBooking(updatedBooking);
    };

    const filteredRequests =
        activeFilter === 'All' ? requests : requests.filter((req) => req.status === activeFilter);

    return (
        <AdminLayout title="Bookings">
            <div className="page-container">
                <h1 className="dashboard-welcome">Bookings</h1>
                <div className="req-toolbar">
                    <div className="req-filters">
                        {filters.map((filter) => (
                            <button
                                key={filter}
                                className={`filter-pill ${activeFilter === filter ? 'filter-pill--active' : ''}`}
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
                                        style={{ background: getStatusColor(req.status) }}
                                    >
                                        {req.status}
                                    </span>
                                </div>

                                <div className="req-card-body">
                                    <p className="req-title">{req.service?.name || 'N/A'}</p>
                                    <p className="req-id">{req.bookingId}</p>
                                    <p className="req-tech">
                                        Technician: {req.technician?.name || 'Not Assigned'}
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
                                        className="req-view-btn"
                                        onClick={() => handleViewDetails(req)}
                                    >
                                        <svg
                                            width="15" height="15" viewBox="0 0 24 24"
                                            fill="none" stroke="currentColor" strokeWidth="2"
                                            strokeLinecap="round" strokeLinejoin="round"
                                        >
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                            <circle cx="12" cy="12" r="3" />
                                        </svg>
                                        View Details
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
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

export default ServiceRequests;
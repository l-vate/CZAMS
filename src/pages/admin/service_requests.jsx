import React, { useState, useEffect } from 'react';
import AdminLayout from './admin_layout';

function ServiceRequests() {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('All');

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

    const getStatusColor = (status) => {
        switch (status) {
            case 'Completed': return '#22c55e';
            case 'Approved': return '#3b82f6';
            case 'In Progress': return '#f59e0b';
            case 'Cancelled': return '#ef4444';
            case 'Pending': return '#f97316';
            default: return '#6b7280';
        }
    };

    const handleViewDetails = (bookingId) => {
        // e.g. navigate(`/admin/bookings/${bookingId}`)
        console.log('View details for', bookingId);
    };

    const filteredRequests =
        activeFilter === 'All' ? requests : requests.filter((req) => req.status === activeFilter);

    return (
        <AdminLayout title="Bookings">
            <div className="page-container">
                <div className="req-toolbar">
                    <div className="req-filters">
                        {filters.map((filter) => (
                            <button
                                key={filter}
                                className={`req-filter-pill ${activeFilter === filter ? 'active' : ''}`}
                                onClick={() => setActiveFilter(filter)}
                            >
                                {filter}
                            </button>
                        ))}
                    </div>
                    <button className="req-new-btn">+ New Booking</button>
                </div>

                {loading ? (
                    <p>Loading bookings...</p>
                ) : filteredRequests.length === 0 ? (
                    <p className="req-empty">No bookings found.</p>
                ) : (
                    <div className="req-list">
                        {filteredRequests.map((req) => (
                            <div className="req-card" key={req._id}>
                                <div className="req-card-left">
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

                                    <p className="req-title">{req.service?.name || 'N/A'}</p>
                                    <p className="req-id">{req.bookingId}</p>
                                    <p className="req-tech">
                                        Technician: {req.technician || 'Not Assigned'}
                                    </p>
                                </div>

                                <div className="req-card-mid">
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
                                        {req.date || 'N/A'}
                                    </div>

                                    <div className="req-info-item">
                                        <svg
                                            className="req-info-icon"
                                            width="16" height="16" viewBox="0 0 24 24"
                                            fill="none" stroke="currentColor" strokeWidth="2"
                                            strokeLinecap="round" strokeLinejoin="round"
                                        >
                                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                            <circle cx="12" cy="10" r="3" />
                                        </svg>
                                        {req.address || 'N/A'}
                                    </div>
                                </div>

                                <button
                                    className="req-view-btn"
                                    onClick={() => handleViewDetails(req.bookingId)}
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
                        ))}
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}

export default ServiceRequests;
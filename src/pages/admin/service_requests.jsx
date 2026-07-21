import React, { useState, useEffect } from 'react';
import AdminLayout from './admin_layout';

function ServiceRequests() {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('All');

    const filters = [
        'All',
        'Pending',
        'Approved',
        'In Progress',
        'Completed',
        'Cancelled'
    ];

    useEffect(() => {
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        try {
            const token = localStorage.getItem('token');

            const response = await fetch(
                'http://localhost:5000/api/service-requests',
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            const data = await response.json();
            setRequests(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error fetching service requests:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (requestId, newStatus) => {
        try {
            const token = localStorage.getItem('token');

            const response = await fetch(
                `http://localhost:5000/api/service-requests/${requestId}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        status: newStatus,
                    }),
                }
            );

            if (response.ok) {
                fetchRequests();
            }
        } catch (error) {
            console.error('Error updating status:', error);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'Completed':
                return '#22c55e';
            case 'Approved':
                return '#3b82f6';
            case 'In Progress':
                return '#f59e0b';
            case 'Cancelled':
                return '#ef4444';
            case 'Pending':
                return '#f97316';
            default:
                return '#6b7280';
        }
    };

    const filteredRequests =
        activeFilter === 'All'
            ? requests
            : requests.filter((req) => req.status === activeFilter);

    return (
        <AdminLayout title="Service Requests">
            <div className="page-container">
                <h1 className="dashboard-welcome">Service Requests</h1>

                {/* Filter Buttons */}
                <div
                    style={{
                        display: 'flex',
                        gap: '12px',
                        flexWrap: 'wrap',
                        marginBottom: '20px',
                    }}
                >
                    {filters.map((filter) => (
                        <button
                            key={filter}
                            onClick={() => setActiveFilter(filter)}
                            style={{
                                padding: '10px 18px',
                                borderRadius: '999px',
                                border: '1px solid #1b9ce5',
                                background:
                                    activeFilter === filter
                                        ? '#1b9ce5'
                                        : '#fff',
                                color:
                                    activeFilter === filter
                                        ? '#fff'
                                        : '#333',
                                cursor: 'pointer',
                                fontWeight: '600',
                            }}
                        >
                            {filter}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <p>Loading requests...</p>
                ) : filteredRequests.length === 0 ? (
                    <p>No service requests found.</p>
                ) : (
                    <div
                        style={{
                            overflowX: 'auto',
                            background: '#fff',
                            borderRadius: '12px',
                            border: '1px solid #e5e7eb',
                        }}
                    >
                        <table
                            style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                            }}
                        >
                            <thead>
                                <tr
                                    style={{
                                        background: '#f8fafc',
                                        borderBottom: '1px solid #e5e7eb',
                                    }}
                                >
                                    <th style={{ padding: '14px', textAlign: 'left' }}>
                                        Client Name
                                    </th>
                                    <th style={{ padding: '14px', textAlign: 'left' }}>
                                        Service
                                    </th>
                                    <th style={{ padding: '14px', textAlign: 'left' }}>
                                        Date Requested
                                    </th>
                                    <th style={{ padding: '14px', textAlign: 'left' }}>
                                        Status
                                    </th>
                                    <th style={{ padding: '14px', textAlign: 'left' }}>
                                        Action
                                    </th>
                                </tr>
                            </thead>

                            <tbody>
                                {filteredRequests.map((req) => (
                                    <tr
                                        key={req._id}
                                        style={{
                                            borderBottom:
                                                '1px solid #f1f5f9',
                                        }}
                                    >
                                        <td style={{ padding: '14px' }}>
                                            {req.clientName || 'N/A'}
                                        </td>

                                        <td style={{ padding: '14px' }}>
                                            {req.service?.name ||
                                                req.serviceName ||
                                                'N/A'}
                                        </td>

                                        <td style={{ padding: '14px' }}>
                                            {req.createdAt
                                                ? new Date(
                                                      req.createdAt
                                                  ).toLocaleDateString()
                                                : 'N/A'}
                                        </td>

                                        <td style={{ padding: '14px' }}>
                                            <span
                                                style={{
                                                    background:
                                                        getStatusColor(
                                                            req.status
                                                        ),
                                                    color: '#fff',
                                                    padding: '4px 10px',
                                                    borderRadius:
                                                        '999px',
                                                    fontSize: '12px',
                                                    fontWeight: '600',
                                                }}
                                            >
                                                {req.status}
                                            </span>
                                        </td>

                                        <td style={{ padding: '14px' }}>
                                            <select
                                                value={req.status}
                                                onChange={(e) =>
                                                    handleStatusChange(
                                                        req._id,
                                                        e.target.value
                                                    )
                                                }
                                                style={{
                                                    padding:
                                                        '8px 12px',
                                                    border:
                                                        '1px solid #d1d5db',
                                                    borderRadius:
                                                        '6px',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <option value="Pending">
                                                    Pending
                                                </option>
                                                <option value="Approved">
                                                    Approved
                                                </option>
                                                <option value="In Progress">
                                                    In Progress
                                                </option>
                                                <option value="Completed">
                                                    Completed
                                                </option>
                                                <option value="Cancelled">
                                                    Cancelled
                                                </option>
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}

export default ServiceRequests;
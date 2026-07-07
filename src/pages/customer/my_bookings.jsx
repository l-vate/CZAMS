import { useState } from 'react';
import CustomerLayout from './customer_layout';
import { useNavigate } from 'react-router-dom';
import { FiClock, FiMapPin } from 'react-icons/fi';


function MyBookings() {
    const navigate = useNavigate();
    const [activeFilter, setActiveFilter] = useState('All');

    const filters = [
        'All',
        'Pending',
        'Approved',
        'In Progress',
        'Completed',
        'Cancelled'
    ];

    const bookings = [
        {
            id: 'CZ-001',
            service: 'Aircon Cleaning',
            status: 'Completed',
            date: '07-06-26',
            technician: 'Juan Dela Cruz',
            address: 'Davao City'
        },
        {
            id: 'CZ-002',
            service: 'Aircon Repair',
            status: 'Pending',
            date: '07-08-26',
            technician: 'Pedro Santos',
            address: 'Davao City'
        },
        {
            id: 'CZ-003',
            service: 'Aircon Installation',
            status: 'Pending',
            date: '07-10-26',
            technician: 'Not Assigned',
            address: 'Tagum City'
        },
        {
            id: 'CZ-004',
            service: 'Maintenance Check',
            status: 'Pending',
            date: '07-12-26',
            technician: 'Not Assigned',
            address: 'Panabo City'
        }
    ];

    const filteredBookings =
        activeFilter === 'All'
            ? bookings
            : bookings.filter(
                (booking) => booking.status === activeFilter
            );

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
            default:
                return '#f59e0b';
        }
    };

    return (
        <CustomerLayout title="My Bookings">
            {/* Filters */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px'
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        gap: '12px',
                        flexWrap: 'wrap'
                    }}
                >
                    {filters.map((filter) => (
                        <button
                            key={filter}
                            onClick={() => setActiveFilter(filter)}
                            style={{
                                padding: '10px 18px',
                                borderRadius: '999px',
                                border:
                                    '1px solid #1b9ce5',
                                background:
                                    activeFilter === filter
                                        ? '#1b9ce5'
                                        : '#fff',
                                color:
                                    activeFilter === filter
                                        ? '#fff'
                                        : '#333',
                                cursor: 'pointer'
                            }}
                        >
                            {filter}
                        </button>
                    ))}
                </div>

                <button
                    onClick={() => navigate('/customer/book_service')}
                    style={{
                        background: '#1b9ce5',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '10px 16px',
                        cursor: 'pointer',
                        fontWeight: '600'
                    }}
                >
                    New Booking
                </button>
            </div>

            {/* Booking Cards */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                }}
            >
                {filteredBookings.map((booking) => (
                    <div
                        key={booking.id}
                        style={{
                            background: '#fff',
                            border: '1px solid #d9d9d9',
                            borderRadius: '12px',
                            padding: '18px 20px',
                            display: 'grid',
                            gridTemplateColumns:
                                '2fr 1.5fr 1.5fr 1fr',
                            alignItems: 'center'
                        }}
                    >
                        <div>
                            <div
                                style={{
                                    display: 'flex',
                                    gap: '10px',
                                    alignItems: 'center',
                                    marginBottom: '8px'
                                }}
                            >
                                <small
                                    style={{
                                        color: '#888'
                                    }}
                                >
                                    {booking.date}
                                </small>

                                <span
                                    style={{
                                        background:
                                            getStatusColor(
                                                booking.status
                                            ),
                                        color: '#fff',
                                        padding:
                                            '2px 8px',
                                        borderRadius:
                                            '999px',
                                        fontSize:
                                            '11px'
                                    }}
                                >
                                    {booking.status}
                                </span>
                            </div>

                            <h3
                                style={{
                                    margin: 0,
                                    fontSize: '18px'
                                }}
                            >
                                {booking.service}
                            </h3>

                            <p
                                style={{
                                    margin: '4px 0',
                                    color: '#666'
                                }}
                            >
                                {booking.id}
                            </p>

                            <small>
                                Technician:{' '}
                                {booking.technician}
                            </small>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <FiClock /> {booking.date}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <FiMapPin /> {booking.address}
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                justifyContent:
                                    'flex-end'
                            }}
                        >
                            <button
                                style={{
                                    background:
                                        'transparent',
                                    border: 'none',
                                    color: '#333',
                                    cursor: 'pointer'
                                }}
                            >
                                View Details
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </CustomerLayout>
    );
}

export default MyBookings;
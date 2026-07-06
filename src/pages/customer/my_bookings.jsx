import CustomerSidebar from '../../components/customer_sidebar';
import { useState } from 'react';

const BOOKINGS = [
    {
        id: 'BK-2026-001',
        service: 'Cleaning',
        date: '2026-07-10',
        time: 'Morning',
        technician: 'Juan Dela Cruz',
        status: 'Pending',
        payment: '50% Paid',
        total: 650,
    },
    {
        id: 'BK-2026-001',
        service: 'Cleaning',
        date: '2026-07-10',
        time: 'Morning',
        technician: 'Juan Dela Cruz',
        status: 'Pending',
        payment: '50% Paid',
        total: 650,
    },
    {
        id: 'BK-2026-001',
        service: 'Cleaning',
        date: '2026-07-10',
        time: 'Morning',
        technician: 'Juan Dela Cruz',
        status: 'Pending',
        payment: '50% Paid',
        total: 650,
    },
    {
        id: 'BK-2026-001',
        service: 'Cleaning',
        date: '2026-07-10',
        time: 'Morning',
        technician: 'Juan Dela Cruz',
        status: 'Pending',
        payment: '50% Paid',
        total: 650,
    },
    {
        id: 'BK-2026-002',
        service: 'Repair',
        date: '2026-07-15',
        time: 'Afternoon',
        technician: 'Pedro Santos',
        status: 'Confirmed',
        payment: '50% Paid',
        total: 1200,
    },
];

function MyBookings() {

    const [selectedBooking, setSelectedBooking] = useState(null);

    return (
        <div className="dashboard-shell">
            <CustomerSidebar />

            <div className="dashboard-main">
                <div className="dashboard-topbar">
                    My Bookings
                </div>

                <div className="dashboard-body">
                    <h1 className="dashboard-welcome">
                        My Service Bookings
                    </h1>


                    <div className="bookings-list">
                        {BOOKINGS.map((booking) => (
                            <div className="booking-item" key={booking.id}>
                                <div className="booking-item-header">
                                    <div>
                                        <h3>{booking.service}</h3>
                                        <p>{booking.id}</p>
                                    </div>

                                    <span
                                        className={`booking-badge ${booking.status.toLowerCase()}`}
                                    >
                                        {booking.status}
                                    </span>
                                </div>

                                <div className="booking-item-body">
                                    <div>
                                        <span>Date</span>
                                        <strong>{booking.date}</strong>
                                    </div>

                                    <div>
                                        <span>Time</span>
                                        <strong>{booking.time}</strong>
                                    </div>

                                    <div>
                                        <span>Technician</span>
                                        <strong>{booking.technician}</strong>
                                    </div>

                                    <div>
                                        <span>Payment</span>
                                        <strong>{booking.payment}</strong>
                                    </div>
                                </div>

                                <div className="booking-item-footer">
                                    <div>
                                        <span>Total Cost</span>
                                        <strong>₱{booking.total.toLocaleString()}</strong>
                                    </div>

                                    <button
                                        className="info-card-view-all"
                                        onClick={() => setSelectedBooking(booking)}
                                    >
                                        View Details →
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    {selectedBooking && (
                        <div
                            className="booking-modal-overlay"
                            onClick={() => setSelectedBooking(null)}
                        >
                            <div
                                className="booking-modal"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="booking-modal-header">
                                    <h2>Booking Details</h2>

                                    <button
                                        className="booking-modal-close"
                                        onClick={() => setSelectedBooking(null)}
                                    >
                                        ✕
                                    </button>
                                </div>

                                <div className="summary-grid">
                                    <div>
                                        <p className="summary-section-title">
                                            Service Information
                                        </p>

                                        <div className="summary-row">
                                            <span>Booking ID</span>
                                            <span>{selectedBooking.id}</span>
                                        </div>

                                        <div className="summary-row">
                                            <span>Service</span>
                                            <span>{selectedBooking.service}</span>
                                        </div>

                                        <div className="summary-row">
                                            <span>Status</span>
                                            <span>{selectedBooking.status}</span>
                                        </div>

                                        <div className="summary-row">
                                            <span>Technician</span>
                                            <span>{selectedBooking.technician}</span>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="summary-section-title">
                                            Schedule & Payment
                                        </p>

                                        <div className="summary-row">
                                            <span>Date</span>
                                            <span>{selectedBooking.date}</span>
                                        </div>

                                        <div className="summary-row">
                                            <span>Time</span>
                                            <span>{selectedBooking.time}</span>
                                        </div>

                                        <div className="summary-row">
                                            <span>Payment</span>
                                            <span>{selectedBooking.payment}</span>
                                        </div>

                                        <div className="summary-row total">
                                            <span>Total Cost</span>
                                            <span>
                                                ₱{selectedBooking.total.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}

export default MyBookings;
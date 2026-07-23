import React, { useState, useEffect } from 'react';

const NEXT_STATUS = {
    Pending: [{ label: 'Approve', value: 'Approved' }],
    Approved: [{ label: 'Mark In Progress', value: 'In Progress' }],
    'In Progress': [{ label: 'Mark Completed', value: 'Completed' }],
};

const STATUS_COLORS = {
    Pending: '#f97316',
    Approved: '#3b82f6',
    'In Progress': '#f59e0b',
    Completed: '#22c55e',
    Cancelled: '#ef4444',
};

function Icon({ name }) {
    const common = {
        width: 16, height: 16, viewBox: '0 0 24 24',
        fill: 'none', stroke: 'currentColor', strokeWidth: 2,
        strokeLinecap: 'round', strokeLinejoin: 'round',
    };
    switch (name) {
        case 'calendar': return <svg {...common}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>;
        case 'clock': return <svg {...common}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
        case 'pin': return <svg {...common}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>;
        case 'info': return <svg {...common}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>;
        case 'card': return <svg {...common}><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>;
        case 'user': return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>;
        case 'file': return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
        default: return null;
    }
}

function AdminServiceDetailsModal({ booking, onClose, onUpdated }) {
    const [technicians, setTechnicians] = useState([]);
    const [busyTechIds, setBusyTechIds] = useState([]);
    const [selectedTechnician, setSelectedTechnician] = useState(booking?.technician?._id || '');
    
    const [isReassigning, setIsReassigning] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchTechnicians();
    }, []);

    useEffect(() => {
        setSelectedTechnician(booking?.technician?._id || '');
        setIsReassigning(false); // Reset reassignment state when booking changes
        fetchBusyTechs();
    }, [booking]);

    const fetchTechnicians = async () => {
        try {
            const response = await fetch('http://localhost:5000/api/auth/technicians');
            const data = await response.json();
            setTechnicians(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Error fetching technicians:', err);
        }
    };

    const fetchBusyTechs = async () => {
        if (!booking?.date) return;
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`http://localhost:5000/api/bookings/busy-technicians?date=${booking.date}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            setBusyTechIds(data.busyTechIds || []);
        } catch (err) {
            console.error('Error fetching busy technicians:', err);
        }
    };

    const patchBooking = async (body) => {
        setSaving(true);
        setError('');
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(
                `http://localhost:5000/api/bookings/${booking.bookingId}/admin-update`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(body),
                }
            );
            const data = await response.json();
            if (!response.ok) {
                setError(data.message || 'Something went wrong.');
                return false;
            }
            onUpdated?.(data);
            return true;
        } catch (err) {
            console.error('Error updating booking:', err);
            setError('Network error. Please try again.');
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleAssign = async () => {
        if (!selectedTechnician) return;
        const success = await patchBooking({ technician: selectedTechnician });
        if (success) {
            setIsReassigning(false);
        }
    };

    const handleStatusChange = (status) => {
        const body = { status };
        if (status === 'Approved' && selectedTechnician && selectedTechnician !== booking?.technician?._id) {
            body.technician = selectedTechnician;
        }
        patchBooking(body);
    };

    const handleCancel = () => {
        if (window.confirm('Cancel this booking? This cannot be undone.')) {
            patchBooking({ status: 'Cancelled' });
        }
    };

    if (!booking) return null;

    const canCancel = !['Completed', 'Cancelled'].includes(booking.status);
    const nextSteps = NEXT_STATUS[booking.status] || [];
    const technicianDirty = selectedTechnician && selectedTechnician !== (booking.technician?._id || '');

    // Rule checks for technician assignment dropdown
    const isPending = booking.status === 'Pending';
    const isActive = ['Approved', 'In Progress'].includes(booking.status);
    const isCompletedOrCancelled = ['Completed', 'Cancelled'].includes(booking.status);

    const isEditable = isPending || (isActive && isReassigning);
    const isDisabled = !isEditable || saving || isCompletedOrCancelled;

    // Filter available technicians
    const availableTechnicians = technicians.filter(tech => {
        // Always show the currently assigned technician in the list so it doesn't blank out
        if (tech._id === booking?.technician?._id) return true;
        return !busyTechIds.includes(tech._id);
    });

    return (
        <div className="sdm-overlay" onClick={onClose}>
            <div className="sdm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="sdm-body">
                    <div className="sdm-titlebar">
                        <div>
                            <h2 className="sdm-title">Booking Details</h2>
                            <p className="sdm-subtitle">Booking ID: {booking.bookingId}</p>
                        </div>
                        <span
                            className="sdm-badge"
                            style={{ background: STATUS_COLORS[booking.status] || '#6b7280' }}
                        >
                            {booking.status}
                        </span>
                    </div>

                    {error && <div className="sdm-error">{error}</div>}

                    <div className="sdm-customer-line">
                        <Icon name="user" />
                        <span>{booking.customer?.name || 'N/A'}</span>
                        {booking.customer?.email && <span className="sdm-muted">· {booking.customer.email}</span>}
                    </div>

                    <div className="sdm-columns">
                        <div className="sdm-col">
                            <h4 className="sdm-service-name">{booking.service?.name || 'Service'}</h4>
                            {booking.unitTypes?.length > 0 && (
                                <p className="sdm-unit-line">
                                    Unit: {booking.unitTypes.join(', ')}
                                    {booking.brandModel ? ` · ${booking.brandModel}` : ''}
                                </p>
                            )}

                            <div className="sdm-row">
                                <div className="sdm-row-icon"><Icon name="calendar" /></div>
                                <div>
                                    <span className="sdm-row-label">DATE</span>
                                    <p className="sdm-row-value">{booking.date || 'N/A'}</p>
                                </div>
                            </div>

                            <div className="sdm-row">
                                <div className="sdm-row-icon"><Icon name="clock" /></div>
                                <div>
                                    <span className="sdm-row-label">TIME</span>
                                    <p className="sdm-row-value">{booking.time || 'N/A'}</p>
                                </div>
                            </div>

                            <div className="sdm-row">
                                <div className="sdm-row-icon"><Icon name="pin" /></div>
                                <div>
                                    <span className="sdm-row-label">ADDRESS</span>
                                    <p className="sdm-row-value">{booking.address || 'N/A'}</p>
                                </div>
                            </div>

                            <div className="sdm-row">
                                <div className="sdm-row-icon"><Icon name="info" /></div>
                                <div>
                                    <span className="sdm-row-label">PROBLEM DESCRIPTION</span>
                                    <p className="sdm-row-value">{booking.problemDescription || '—'}</p>
                                </div>
                            </div>

                            {booking.rescheduleRequest?.status === 'Pending' && (
                                <div className="sdm-notice">
                                    Reschedule requested: {booking.rescheduleRequest.requestedDate} at{' '}
                                    {booking.rescheduleRequest.requestedTime}
                                </div>
                            )}
                        </div>

                        <div className="sdm-col">
                            <h5 className="sdm-col-heading">
                                <Icon name="card" /> PAYMENT DETAILS
                            </h5>

                            <div className="sdm-list">
                                <div className="sdm-list-row">
                                    <span>Down Payment</span>
                                    <span className="sdm-list-value">{booking.downPaymentPercent ?? 'N/A'}%</span>
                                </div>
                                <div className="sdm-list-row">
                                    <span>Payment Status</span>
                                    <span className="sdm-list-value">{booking.paymentStatus || 'N/A'}</span>
                                </div>
                                <div className="sdm-list-row">
                                    <span>Payment Mode</span>
                                    <span className="sdm-list-value">
                                        {[booking.paymentMode, booking.paymentMode2].filter(Boolean).join(' / ') || 'N/A'}
                                    </span>
                                </div>
                                <div className="sdm-list-row">
                                    <span>Proof of Payment</span>
                                    <span className="sdm-list-value">
                                        {booking.proofFile ? (
                                            <a
                                                href={`http://localhost:5000${booking.proofFile}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="sdm-link"
                                            >
                                                View File
                                            </a>
                                        ) : (
                                            'N/A'
                                        )}
                                    </span>
                                </div>
                                <div className="sdm-list-row">
                                    <span>Balance Paid</span>
                                    <span className="sdm-list-value">{booking.balancePaid ? 'Yes' : 'No'}</span>
                                </div>
                                {booking.balanceProofFile && (
                                    <div className="sdm-list-row">
                                        <span>Balance Proof</span>
                                        <span className="sdm-list-value">
                                            <a
                                                href={`http://localhost:5000${booking.balanceProofFile}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="sdm-link"
                                            >
                                                View File
                                            </a>
                                        </span>
                                    </div>
                                )}
                            </div>

                            {booking.report?.submittedAt && (
                                <>
                                    <h5 className="sdm-col-heading sdm-col-heading-spaced">
                                        <Icon name="file" /> JOB REPORT
                                    </h5>
                                    <div className="sdm-list">
                                        <div className="sdm-list-row sdm-list-row-block">
                                            <span>Work Summary</span>
                                            <p className="sdm-list-value">{booking.report.workSummary || 'N/A'}</p>
                                        </div>
                                        <div className="sdm-list-row sdm-list-row-block">
                                            <span>Parts Used</span>
                                            <p className="sdm-list-value">{booking.report.partsUsed || 'N/A'}</p>
                                        </div>
                                        <div className="sdm-list-row sdm-list-row-block">
                                            <span>Recommendations</span>
                                            <p className="sdm-list-value">{booking.report.recommendations || 'N/A'}</p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="sdm-tech-strip">
                        <div className="sdm-tech-avatar">
                            <Icon name="user" />
                        </div>
                        <div className="sdm-tech-info">
                            <span className="sdm-row-label">ASSIGNED TECHNICIAN</span>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <select
                                    className="sdm-tech-select"
                                    value={selectedTechnician}
                                    onChange={(e) => setSelectedTechnician(e.target.value)}
                                    disabled={isDisabled}
                                >
                                    <option value="">Unassigned</option>
                                    {availableTechnicians.map((tech) => (
                                        <option key={tech._id} value={tech._id}>
                                            {tech.name}
                                        </option>
                                    ))}
                                </select>
                                
                                {isActive && !isReassigning && (
                                    <button 
                                        className="sdm-btn sdm-btn-outline" 
                                        onClick={() => setIsReassigning(true)}
                                    >
                                        Reassign
                                    </button>
                                )}
                                
                                {isReassigning && technicianDirty && (
                                    <button 
                                        className="sdm-btn sdm-btn-primary" 
                                        onClick={handleAssign} 
                                        disabled={saving}
                                    >
                                        Save Reassignment
                                    </button>
                                )}
                                {isReassigning && (
                                    <button 
                                        className="sdm-btn sdm-btn-outline" 
                                        onClick={() => {
                                            setIsReassigning(false);
                                            setSelectedTechnician(booking?.technician?._id || '');
                                        }}
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="sdm-footer">
                    {canCancel && (
                        <button className="sdm-btn sdm-btn-danger" onClick={handleCancel} disabled={saving}>
                            Cancel Booking
                        </button>
                    )}
                    <div className="sdm-footer-actions">
                        {nextSteps.map((step) => (
                            <button
                                key={step.value}
                                className="sdm-btn sdm-btn-primary"
                                onClick={() => handleStatusChange(step.value)}
                                disabled={
                                    saving ||
                                    (step.value === 'Approved' && !selectedTechnician && !booking.technician)
                                }
                            >
                                {step.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AdminServiceDetailsModal;
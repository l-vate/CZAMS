import React, { useState, useEffect } from 'react';
import { getBookingLineItems } from '../utils/bookingPricing';

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

const PAYMENT_STATUS_LABELS = {
    Unpaid: 'Unpaid',
    to_verify: 'To Verify',
    partially_paid: 'Partially Paid',
    fully_paid: 'Fully Paid',
    rejected: 'Rejected',
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
    const [disruptionDate, setDisruptionDate] = useState('');
    const [disruptionTime, setDisruptionTime] = useState('');
    const [instructionsDraft, setInstructionsDraft] = useState(booking?.technicianInstructions || '');
    const [editingInstructions, setEditingInstructions] = useState(false);

    useEffect(() => {
        fetchTechnicians();
    }, []);

    useEffect(() => {
        setSelectedTechnician(booking?.technician?._id || '');
        setIsReassigning(false); // Reset reassignment state when booking changes
        setInstructionsDraft(booking?.technicianInstructions || '');
        setEditingInstructions(false);
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

    const handleSaveInstructions = async () => {
        const success = await patchBooking({ technicianInstructions: instructionsDraft });
        if (success) {
            setEditingInstructions(false);
        }
    };

    const handleCancel = () => {
        if (window.confirm('Cancel this booking? This cannot be undone.')) {
            patchBooking({ status: 'Cancelled' });
        }
    };

    const handleDisruptionReschedule = async () => {
        if (!disruptionDate || !disruptionTime) return;
        setSaving(true);
        setError('');
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(
                `http://localhost:5000/api/bookings/${booking.bookingId}/disruption/reschedule`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ date: disruptionDate, time: disruptionTime }),
                }
            );
            const data = await response.json();
            if (!response.ok) {
                setError(data.message || 'Failed to reschedule.');
                return;
            }
            onUpdated?.(data);
        } catch (err) {
            console.error('Error rescheduling after disruption:', err);
            setError('Network error. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleExtensionDecision = async (decision) => {
        setSaving(true);
        setError('');
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(
                `http://localhost:5000/api/bookings/${booking.bookingId}/extension/${decision}`,
                {
                    method: 'PATCH',
                    headers: { Authorization: `Bearer ${token}` },
                }
            );
            const data = await response.json();
            if (!response.ok) {
                setError(data.message || 'Failed to update extension request.');
                return;
            }
            onUpdated?.(data);
        } catch (err) {
            console.error('Error updating extension request:', err);
            setError('Network error. Please try again.');
        } finally {
            setSaving(false);
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

    const { lineItems, basePrice } = getBookingLineItems(booking);
    const downPaymentAmount = Math.round(basePrice * ((booking.downPaymentPercent ?? 0) / 100));

    // Filter available technicians
    const availableTechnicians = technicians.filter(tech => {
        // Always show the currently assigned technician in the list so it doesn't blank out
        if (tech._id === booking?.technician?._id) return true;
        return !busyTechIds.includes(tech._id);
    });

    return (
        <div className="sdm-overlay" onClick={onClose}>
            <div className="sdm-modal" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="modal-close-btn sdm-close-position" onClick={onClose}>✕</button>
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

                    {booking.isBackJob && (
                        <div className="sdm-notice">
                            Back Job — free of charge (warranty repair visit for booking {booking.backJobId ? `linked to ${booking.backJobId}` : ''}). No payment is expected on this booking.
                        </div>
                    )}

                    {error && <div className="sdm-error">{error}</div>}

                    <div className="sdm-customer-line">
                        <Icon name="user" />
                        <span>{booking.customer?.name || 'N/A'}</span>
                        {booking.customer?.email && <span className="sdm-muted">· {booking.customer.email}</span>}
                    </div>

                    <div className="sdm-columns">
                        <div className="sdm-col">
                            <h4 className="sdm-service-name">{booking.service?.name || 'Service'}</h4>
                            {lineItems.map((li, i) => (
                                <p className="sdm-unit-line" key={i}>
                                    Unit: {li.quantity}× {li.type}
                                    {li.brandModel ? ` · ${li.brandModel}` : ''}
                                </p>
                            ))}

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

                            <div className="sdm-row">
                                <div className="sdm-row-icon"><Icon name="file" /></div>
                                <div style={{ flex: 1 }}>
                                    <span className="sdm-row-label">TECHNICIAN INSTRUCTIONS</span>
                                    {editingInstructions ? (
                                        <>
                                            <textarea
                                                className="ma-textarea"
                                                rows={3}
                                                placeholder="Care requirements, access instructions, client-specific handling..."
                                                value={instructionsDraft}
                                                onChange={(e) => setInstructionsDraft(e.target.value)}
                                                style={{ width: '100%', marginTop: '4px' }}
                                            />
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                                                <button
                                                    className="sdm-btn sdm-btn-outline"
                                                    onClick={() => {
                                                        setEditingInstructions(false);
                                                        setInstructionsDraft(booking.technicianInstructions || '');
                                                    }}
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    className="sdm-btn sdm-btn-primary"
                                                    onClick={handleSaveInstructions}
                                                    disabled={saving}
                                                >
                                                    Save Instructions
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <p className="sdm-row-value">{booking.technicianInstructions || '—'}</p>
                                            <button
                                                className="sdm-btn sdm-btn-outline"
                                                style={{ marginTop: '4px' }}
                                                onClick={() => setEditingInstructions(true)}
                                            >
                                                {booking.technicianInstructions ? 'Edit' : 'Add'} Instructions
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {booking.rescheduleRequest?.status === 'Pending' && (
                                <div className="sdm-notice">
                                    Reschedule requested: {booking.rescheduleRequest.requestedDate} at{' '}
                                    {booking.rescheduleRequest.requestedTime}
                                </div>
                            )}

                            {booking.disruption?.status === 'Reported' && (
                                <div className="sdm-notice">
                                    <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Disruption reported by technician:</p>
                                    <p style={{ margin: '0 0 10px' }}>"{booking.disruption.reason}"</p>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                        <div>
                                            <label className="sdm-row-label" style={{ display: 'block', marginBottom: '4px' }}>New Date</label>
                                            <input
                                                type="date"
                                                className="ma-input"
                                                value={disruptionDate}
                                                onChange={(e) => setDisruptionDate(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="sdm-row-label" style={{ display: 'block', marginBottom: '4px' }}>New Time</label>
                                            <select
                                                className="sdm-tech-select"
                                                value={disruptionTime}
                                                onChange={(e) => setDisruptionTime(e.target.value)}
                                            >
                                                <option value="">Select</option>
                                                <option value="Morning">Morning</option>
                                                <option value="Afternoon">Afternoon</option>
                                            </select>
                                        </div>
                                        <button
                                            className="sdm-btn sdm-btn-primary"
                                            onClick={handleDisruptionReschedule}
                                            disabled={saving || !disruptionDate || !disruptionTime}
                                        >
                                            Reschedule &amp; Notify
                                        </button>
                                    </div>
                                </div>
                            )}

                            {booking.disruption?.status === 'Rescheduled' && (
                                <div className="sdm-notice">
                                    Disruption resolved — rescheduled on{' '}
                                    {new Date(booking.disruption.rescheduledAt).toLocaleDateString()}.
                                </div>
                            )}
                        </div>

                        <div className="sdm-col">
                            <h5 className="sdm-col-heading">
                                <Icon name="card" /> PAYMENT DETAILS
                            </h5>

                            <div className="sdm-list">
                                {!booking.isBackJob && (
                                    <>
                                        {lineItems.map((li, i) => (
                                            <div className="sdm-list-row" key={i}>
                                                <span>{li.quantity}× {li.type} @ ₱{li.unitPrice.toLocaleString()}</span>
                                                <span className="sdm-list-value">₱{li.subtotal.toLocaleString()}</span>
                                            </div>
                                        ))}
                                        <div className="sdm-list-row">
                                            <span><strong>Total Price</strong></span>
                                            <span className="sdm-list-value"><strong>₱{basePrice.toLocaleString()}</strong></span>
                                        </div>
                                    </>
                                )}
                                <div className="sdm-list-row">
                                    <span>Down Payment</span>
                                    <span className="sdm-list-value">
                                        {booking.downPaymentPercent ?? 'N/A'}%
                                        {!booking.isBackJob && booking.downPaymentPercent != null && ` (₱${downPaymentAmount.toLocaleString()})`}
                                    </span>
                                </div>
                                {!booking.isBackJob && booking.downPaymentPercent != null && (
                                    <div className="sdm-list-row">
                                        <span>Remaining Balance</span>
                                        <span className="sdm-list-value">₱{(basePrice - downPaymentAmount).toLocaleString()}</span>
                                    </div>
                                )}
                                <div className="sdm-list-row">
                                    <span>Payment Status</span>
                                    <span className="sdm-list-value">
                                        {PAYMENT_STATUS_LABELS[booking.paymentStatus] || booking.paymentStatus || 'N/A'}
                                    </span>
                                </div>
                                {/* paymentMode = how the down payment is paid, paymentMode2 = how the balance is
                                    paid. Two different payments that can legitimately share a mode, so they're
                                    shown labelled rather than joined; a 100% payment has no separate balance. */}
                                {booking.downPaymentPercent === 100 ? (
                                    <div className="sdm-list-row">
                                        <span>Payment Mode</span>
                                        <span className="sdm-list-value">{booking.paymentMode || 'N/A'}</span>
                                    </div>
                                ) : (
                                    <>
                                        <div className="sdm-list-row">
                                            <span>Down Payment Mode</span>
                                            <span className="sdm-list-value">{booking.paymentMode || 'N/A'}</span>
                                        </div>
                                        <div className="sdm-list-row">
                                            <span>Balance Payment Mode</span>
                                            <span className="sdm-list-value">{booking.paymentMode2 || 'N/A'}</span>
                                        </div>
                                    </>
                                )}
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

                            {booking.warranty?.applicable && (
                                <>
                                    <h5 className="sdm-col-heading sdm-col-heading-spaced">
                                        <Icon name="info" /> WARRANTY STATUS
                                    </h5>
                                    <div className="sdm-list">
                                        <div className="sdm-list-row">
                                            <span>Coverage Type</span>
                                            <span className="sdm-list-value">{booking.warranty.type}</span>
                                        </div>
                                        <div className="sdm-list-row">
                                            <span>Workmanship</span>
                                            <span className="sdm-list-value" style={{ color: booking.warranty.workmanship.active ? '#22c55e' : '#ef4444' }}>
                                                {booking.warranty.workmanship.active ? 'Active' : 'Expired'} — until {new Date(booking.warranty.workmanship.expiresAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                        {booking.warranty.unit && (
                                            <>
                                                <div className="sdm-list-row">
                                                    <span>Compressor</span>
                                                    <span className="sdm-list-value" style={{ color: booking.warranty.unit.compressorActive ? '#22c55e' : '#ef4444' }}>
                                                        {booking.warranty.unit.compressorActive ? 'Active' : 'Expired'} — until {new Date(booking.warranty.unit.compressorExpiresAt).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <div className="sdm-list-row">
                                                    <span>Minor Parts</span>
                                                    <span className="sdm-list-value" style={{ color: booking.warranty.unit.minorPartsActive ? '#22c55e' : '#ef4444' }}>
                                                        {booking.warranty.unit.minorPartsActive ? 'Active' : 'Expired'} — until {new Date(booking.warranty.unit.minorPartsExpiresAt).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </>
                                        )}
                                        {booking.unitWaiver?.acknowledged && (
                                            <div className="sdm-list-row sdm-list-row-block">
                                                <span>Unit Waiver</span>
                                                <p className="sdm-list-value">
                                                    Signed by {booking.unitWaiver.customerName} on {new Date(booking.unitWaiver.acknowledgedAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}

                            {booking.extensionRequest?.status === 'Pending' && (
                                <>
                                    <h5 className="sdm-col-heading sdm-col-heading-spaced">
                                        <Icon name="clock" /> EXTENSION REQUEST
                                    </h5>
                                    <div className="sdm-notice">
                                        <p style={{ margin: '0 0 10px' }}>"{booking.extensionRequest.reason}"</p>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                className="sdm-btn sdm-btn-danger"
                                                onClick={() => handleExtensionDecision('deny')}
                                                disabled={saving}
                                            >
                                                Deny
                                            </button>
                                            <button
                                                className="sdm-btn sdm-btn-primary"
                                                onClick={() => handleExtensionDecision('approve')}
                                                disabled={saving}
                                            >
                                                Approve
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}

                            {['Approved', 'Denied'].includes(booking.extensionRequest?.status) && (
                                <>
                                    <h5 className="sdm-col-heading sdm-col-heading-spaced">
                                        <Icon name="clock" /> EXTENSION REQUEST
                                    </h5>
                                    <div className="sdm-list">
                                        <div className="sdm-list-row sdm-list-row-block">
                                            <span>"{booking.extensionRequest.reason}"</span>
                                            <p className="sdm-list-value">{booking.extensionRequest.status}</p>
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
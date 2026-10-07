import { useState, useEffect } from 'react';
import { getBookingLineItems, getPaymentBreakdown, formatPeso } from '../utils/bookingPricing';
import AssignmentPanel from './assignment_panel';
import { getMemberIds } from '../utils/assignments';
import { isWithinQuezonCity } from '../utils/serviceArea';
import { API_BASE } from '../config/api';
import { BOOKING_STATUS } from '../constants/bookingStatus';
import { TIME_BLOCK } from '../constants/timeBlocks';
import { SERVICE_TYPE } from '../constants/serviceTypes';

// Admin only approves (and cancels). A booking becomes In Progress by itself when its
// time block starts and Completed when the technician submits the service report.
const NEXT_STATUS = {
    Pending: [{ label: 'Approve', value: 'Approved' }],
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
    
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [disruptionDate, setDisruptionDate] = useState('');
    const [disruptionTime, setDisruptionTime] = useState('');
    const [instructionsDraft, setInstructionsDraft] = useState(booking?.technicianInstructions || '');
    const [editingInstructions, setEditingInstructions] = useState(false);
    const [editingCharges, setEditingCharges] = useState(false);
    const [distanceDraft, setDistanceDraft] = useState(booking?.distanceAdjustment || 0);
    const [mobilizationDraft, setMobilizationDraft] = useState(booking?.mobilizationFee || 0);
    const [uploadingProof, setUploadingProof] = useState(false);
    const [report, setReport] = useState(null);
    const [rejectingDiscount, setRejectingDiscount] = useState(false);
    const [discountRejectReason, setDiscountRejectReason] = useState('');

    useEffect(() => {
        setInstructionsDraft(booking?.technicianInstructions || '');
        setEditingInstructions(false);
        setDistanceDraft(booking?.distanceAdjustment || 0);
        setMobilizationDraft(booking?.mobilizationFee || 0);
        setEditingCharges(false);
        fetchReport();
    }, [booking]);

    // Reports live in the separate Report collection, not the deprecated embedded
    // booking.report field (never populated by the current report-submission flow).
    const fetchReport = async () => {
        if (!booking?.reportSubmitted && !booking?.reportId) {
            setReport(null);
            return;
        }
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE}/api/reports/booking/${booking.bookingId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) {
                setReport(null);
                return;
            }
            const data = await response.json();
            setReport(data);
        } catch (err) {
            console.error('Error fetching report:', err);
            setReport(null);
        }
    };

    const patchBooking = async (body) => {
        setSaving(true);
        setError('');
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(
                `${API_BASE}/api/bookings/${booking.bookingId}/admin-update`,
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

    const handleStatusChange = (status) => {
        patchBooking({ status });
    };

    const handleSaveInstructions = async () => {
        const success = await patchBooking({ technicianInstructions: instructionsDraft });
        if (success) {
            setEditingInstructions(false);
        }
    };

    // Distance/Mobilization Charges: admin-entered, not system-computed.
    const handleSaveCharges = async () => {
        const success = await patchBooking({ distanceAdjustment: distanceDraft, mobilizationFee: mobilizationDraft });
        if (success) {
            setEditingCharges(false);
        }
    };

    // Proof of purchase for a CZA-supplied unit - backs a future Unit Warranty
    // claim. Admin-side upload (mirrors the customer-facing pay/pay-balance proof
    // uploads, same multer/proofs storage), not a JSON PATCH like the others.
    const handleUnitPurchaseProofUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingProof(true);
        setError('');
        try {
            const token = localStorage.getItem('token');
            const formData = new FormData();
            formData.append('proof', file);
            const response = await fetch(
                `${API_BASE}/api/bookings/${booking.bookingId}/unit-purchase-proof`,
                { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: formData }
            );
            const data = await response.json();
            if (!response.ok) {
                setError(data.message || 'Failed to upload proof of purchase.');
                return;
            }
            onUpdated?.(data);
        } catch (err) {
            console.error('Error uploading unit purchase proof:', err);
            setError('Network error. Please try again.');
        } finally {
            setUploadingProof(false);
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
                `${API_BASE}/api/bookings/${booking.bookingId}/disruption/reschedule`,
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

    // Approve or reject the customer's Senior Citizen / PWD discount request. Nothing
    // changes in the booking's totals until the server accepts an approval.
    const handleDiscountDecision = async (decision) => {
        if (decision === 'reject' && !discountRejectReason.trim()) {
            setError('Please give a short reason for rejecting the discount.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(
                `${API_BASE}/api/bookings/${booking.bookingId}/discount/${decision}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify(decision === 'reject' ? { reason: discountRejectReason.trim() } : {}),
                }
            );
            const data = await response.json();
            if (!response.ok) {
                setError(data.message || 'Failed to update the discount request.');
                return;
            }
            setRejectingDiscount(false);
            setDiscountRejectReason('');
            onUpdated?.(data);
        } catch (err) {
            console.error('Error updating discount request:', err);
            setError('Network error. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    // Approve or deny the customer's reschedule request. The server re-checks the
    // technician's availability for the requested slot and answers 409 on a clash.
    const handleRescheduleDecision = async (decision) => {
        setSaving(true);
        setError('');
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(
                `${API_BASE}/api/bookings/${booking.bookingId}/reschedule/${decision}`,
                {
                    method: 'PATCH',
                    headers: { Authorization: `Bearer ${token}` },
                }
            );
            const data = await response.json();
            if (!response.ok) {
                setError(data.message || 'Failed to update the reschedule request.');
                return;
            }
            onUpdated?.(data);
        } catch (err) {
            console.error('Error updating reschedule request:', err);
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
                `${API_BASE}/api/bookings/${booking.bookingId}/extension/${decision}`,
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

    const canCancel = ![BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED].includes(booking.status);
    const nextSteps = NEXT_STATUS[booking.status] || [];
    const hasAssignment = getMemberIds(booking).length > 0;

    const { lineItems, basePrice } = getBookingLineItems(booking);
    const paymentBreakdown = getPaymentBreakdown({ ...booking, downPaymentPercent: booking.downPaymentPercent ?? 0 });
    const downPaymentAmount = paymentBreakdown.downPayment;
    const discountIdIsPdf = /\.pdf$/i.test(booking.discount?.idFile || '');

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
                            Back Job - free of charge (warranty repair visit for booking {booking.backJobId ? `linked to ${booking.backJobId}` : ''}). No payment is expected on this booking.
                        </div>
                    )}

                    {!booking.isBackJob
                        && booking.status === BOOKING_STATUS.PENDING
                        && !isWithinQuezonCity(booking.address)
                        && !booking.distanceAdjustment && !booking.mobilizationFee && (
                        <div className="sdm-notice">
                            ⚠ This address is outside Quezon City - add a {booking.service?.serviceType === SERVICE_TYPE.INSTALLATION ? 'mobilization fee' : 'distance based charge'} below before approving, if one applies.
                        </div>
                    )}

                    {booking.serviceAreaCheck && !booking.serviceAreaCheck.withinArea && (
                        <div className="sdm-notice">
                            ⚠ This address didn't match any of CZA's confirmed service areas at booking time - flagged for review.
                        </div>
                    )}

                    {error && <div className="sdm-error">{error}</div>}

                    <div className="sdm-customer-line">
                        <Icon name="user" />
                        <span>{booking.customer?.name || 'N/A'}</span>
                        {booking.customer?.email && <span className="sdm-muted">· {booking.customer.email}</span>}
                        <span className="sdm-muted">· Contact: {booking.contactNumber || booking.customer?.phone || 'N/A'}</span>
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
                                    <p className="sdm-row-value">{booking.problemDescription || '-'}</p>
                                </div>
                            </div>

                            <div className="sdm-row">
                                <div className="sdm-row-icon"><Icon name="file" /></div>
                                <div className="admin-service-details-modal-x1">
                                    <span className="sdm-row-label">TECHNICIAN INSTRUCTIONS</span>
                                    {editingInstructions ? (
                                        <>
                                            <textarea
                                                className="ma-textarea admin-service-details-modal-x2"
                                                rows={3}
                                                placeholder="Care requirements, access instructions, client-specific handling..."
                                                value={instructionsDraft}
                                                onChange={(e) => setInstructionsDraft(e.target.value)}
                                            />
                                            <div className="admin-service-details-modal-x3">
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
                                            <p className="sdm-row-value">{booking.technicianInstructions || '-'}</p>
                                            <button
                                                className="sdm-btn sdm-btn-outline admin-service-details-modal-x4"
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
                                    <p className="admin-service-details-modal-x5">Reschedule requested by the customer</p>
                                    <p className="admin-service-details-modal-x6">
                                        Current: {booking.date || 'N/A'}, {booking.time || 'N/A'}
                                    </p>
                                    <p className="admin-service-details-modal-x7">
                                        Requested: <strong>{booking.rescheduleRequest.requestedDate}, {booking.rescheduleRequest.requestedTime}</strong>
                                    </p>
                                    <div className="admin-service-details-modal-x8">
                                        <button
                                            className="sdm-btn sdm-btn-danger"
                                            onClick={() => handleRescheduleDecision('deny')}
                                            disabled={saving}
                                        >
                                            Deny
                                        </button>
                                        <button
                                            className="sdm-btn sdm-btn-primary"
                                            onClick={() => handleRescheduleDecision('approve')}
                                            disabled={saving}
                                        >
                                            Approve
                                        </button>
                                    </div>
                                </div>
                            )}

                            {booking.disruption?.status === 'Reported' && (
                                <div className="sdm-notice">
                                    <p className="admin-service-details-modal-x5">Disruption reported by technician:</p>
                                    <p className="admin-service-details-modal-x7">"{booking.disruption.reason}"</p>
                                    <div className="admin-service-details-modal-x9">
                                        <div>
                                            <label className="sdm-row-label admin-service-details-modal-x10">New Date</label>
                                            <input
                                                type="date"
                                                className="ma-input"
                                                value={disruptionDate}
                                                onChange={(e) => setDisruptionDate(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="sdm-row-label admin-service-details-modal-x10">New Time</label>
                                            <select
                                                className="sdm-tech-select"
                                                value={disruptionTime}
                                                onChange={(e) => setDisruptionTime(e.target.value)}
                                            >
                                                <option value="">Select</option>
                                                <option value={TIME_BLOCK.MORNING}>{TIME_BLOCK.MORNING}</option>
                                                <option value={TIME_BLOCK.AFTERNOON}>{TIME_BLOCK.AFTERNOON}</option>
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
                                    Disruption resolved - rescheduled on{' '}
                                    {new Date(booking.disruption.rescheduledAt).toLocaleDateString()}.
                                </div>
                            )}
                        </div>

                        <div className="sdm-col">
                            {booking.discount?.status && booking.discount.status !== 'None' && (
                                <>
                                    <h5 className="sdm-col-heading">
                                        <Icon name="card" /> SENIOR / PWD DISCOUNT
                                    </h5>
                                    <div className="sdm-list admin-service-details-modal-x11">
                                        <div className="sdm-list-row">
                                            <span>Type</span>
                                            <span className="sdm-list-value">{booking.discount.type === 'PWD' ? 'PWD' : 'Senior Citizen'}</span>
                                        </div>
                                        <div className="sdm-list-row">
                                            <span>Status</span>
                                            <span className="sdm-list-value">{booking.discount.status}</span>
                                        </div>
                                        {booking.discount.status === 'Approved' && (
                                            <div className="sdm-list-row">
                                                <span>Discount</span>
                                                <span className="sdm-list-value">{booking.discount.percent}% ({formatPeso(-paymentBreakdown.discountAmount)})</span>
                                            </div>
                                        )}
                                        {booking.discount.status === 'Rejected' && booking.discount.rejectionReason && (
                                            <div className="sdm-list-row sdm-list-row-block">
                                                <span>Reason given to the customer</span>
                                                <p className="sdm-list-value">{booking.discount.rejectionReason}</p>
                                            </div>
                                        )}
                                        <div className="sdm-list-row sdm-list-row-block">
                                            <span>Valid ID</span>
                                            {booking.discount.idFile ? (
                                                discountIdIsPdf ? (
                                                    <a className="sdm-link" href={`${API_BASE}${booking.discount.idFile}`} target="_blank" rel="noreferrer">Open ID (PDF)</a>
                                                ) : (
                                                    <a href={`${API_BASE}${booking.discount.idFile}`} target="_blank" rel="noreferrer">
                                                        <img
                                                            src={`${API_BASE}${booking.discount.idFile}`}
                                                            alt="Uploaded valid ID"
                                                            className="admin-service-details-modal-x12"
                                                        />
                                                    </a>
                                                )
                                            ) : (
                                                <p className="sdm-list-value">None uploaded (checked in person)</p>
                                            )}
                                        </div>
                                    </div>

                                    {paymentBreakdown.overpaid > 0 && (
                                        <div className="sdm-notice">
                                            Overpayment: the customer already paid ₱{paymentBreakdown.downPayment.toLocaleString()}, which is
                                            ₱{paymentBreakdown.overpaid.toLocaleString()} more than the discounted total. The balance is shown as ₱0
                                            and nothing was refunded automatically. Settle the difference with the customer.
                                        </div>
                                    )}

                                    {booking.discount.status === 'Pending' && (
                                        rejectingDiscount ? (
                                            <div className="sdm-notice">
                                                <label className="sdm-row-label admin-service-details-modal-x10">
                                                    Reason (shown to the customer)
                                                </label>
                                                <input
                                                    type="text"
                                                    className="ma-input"
                                                    maxLength={200}
                                                    value={discountRejectReason}
                                                    onChange={(e) => setDiscountRejectReason(e.target.value)}
                                                    placeholder="e.g. The ID photo is not readable"
                                                />
                                                <div className="admin-service-details-modal-x13">
                                                    <button
                                                        className="sdm-btn sdm-btn-outline"
                                                        onClick={() => { setRejectingDiscount(false); setDiscountRejectReason(''); }}
                                                        disabled={saving}
                                                    >
                                                        Back
                                                    </button>
                                                    <button
                                                        className="sdm-btn sdm-btn-danger"
                                                        onClick={() => handleDiscountDecision('reject')}
                                                        disabled={saving}
                                                    >
                                                        Confirm Reject
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="admin-service-details-modal-x14">
                                                <button className="sdm-btn sdm-btn-danger" onClick={() => setRejectingDiscount(true)} disabled={saving}>
                                                    Reject
                                                </button>
                                                <button className="sdm-btn sdm-btn-primary" onClick={() => handleDiscountDecision('approve')} disabled={saving}>
                                                    Approve Discount
                                                </button>
                                            </div>
                                        )
                                    )}
                                </>
                            )}

                            <h5 className="sdm-col-heading">
                                <Icon name="card" /> PAYMENT DETAILS
                            </h5>

                            <div className="sdm-list">
                                {!booking.isBackJob && (
                                    <>
                                        {lineItems.map((li, i) => (
                                            <div className="sdm-list-row" key={i}>
                                                <span>{li.isDiscount ? li.type : `${li.quantity}× ${li.type} @ ${formatPeso(li.unitPrice)}`}</span>
                                                <span className="sdm-list-value">{formatPeso(li.subtotal)}</span>
                                            </div>
                                        ))}
                                        <div className="sdm-list-row">
                                            <span><strong>Total Price</strong></span>
                                            <span className="sdm-list-value"><strong>₱{basePrice.toLocaleString()}</strong></span>
                                        </div>
                                    </>
                                )}
                                {/* Distance/Mobilization Charges: admin-entered, not system-computed -
                                    CZA has no full price-by-zone table to auto-derive this from. Distance
                                    adjustment applies to Cleaning jobs; mobilization/demobilization is the
                                    (typically ~₱2,500 but admin-adjustable) vehicle charge for a far
                                    Installation. Shown as an editable row only for the relevant service type. */}
                                {!booking.isBackJob && (
                                    editingCharges ? (
                                        <div className="sdm-list-row sdm-list-row-block">
                                            <span>Admin Pricing Adjustments</span>
                                            <div className="admin-service-details-modal-x15">
                                                {booking.service?.serviceType === SERVICE_TYPE.INSTALLATION ? (
                                                    <label className="admin-service-details-modal-x16">
                                                        Mobilization/Demobilization Fee (₱)
                                                        <input
                                                            type="number" min="0" className="ma-input admin-service-details-modal-x17"
                                                            value={mobilizationDraft}
                                                            onChange={(e) => setMobilizationDraft(Number(e.target.value) || 0)}
                                                        />
                                                    </label>
                                                ) : (
                                                    <label className="admin-service-details-modal-x16">
                                                        Distance Based Charge (₱)
                                                        <input
                                                            type="number" min="0" className="ma-input admin-service-details-modal-x17"
                                                            value={distanceDraft}
                                                            onChange={(e) => setDistanceDraft(Number(e.target.value) || 0)}
                                                        />
                                                    </label>
                                                )}
                                                <div className="admin-service-details-modal-x18">
                                                    <button className="sdm-btn sdm-btn-outline" onClick={() => {
                                                        setEditingCharges(false);
                                                        setDistanceDraft(booking.distanceAdjustment || 0);
                                                        setMobilizationDraft(booking.mobilizationFee || 0);
                                                    }}>Cancel</button>
                                                    <button className="sdm-btn sdm-btn-primary" onClick={handleSaveCharges} disabled={saving}>Save</button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        (!isWithinQuezonCity(booking.address) || booking.distanceAdjustment || booking.mobilizationFee) && (
                                            <div
                                                className="sdm-list-row admin-service-details-modal-x19"
                                            >
                                                <span className="admin-service-details-modal-x20">
                                                    {booking.service?.serviceType === SERVICE_TYPE.INSTALLATION ? 'Mobilization Fee' : 'Distance Based Charge'}
                                                </span>
                                                <span className="sdm-list-value admin-service-details-modal-x21">
                                                    ₱{(booking.service?.serviceType === SERVICE_TYPE.INSTALLATION ? (booking.mobilizationFee || 0) : (booking.distanceAdjustment || 0)).toLocaleString()}
                                                    <button className="sdm-btn sdm-btn-outline admin-service-details-modal-x22" onClick={() => setEditingCharges(true)}>Edit</button>
                                                </span>
                                            </div>
                                        )
                                    )
                                )}
                                {booking.isCommercial && (
                                    <>
                                        <div className="sdm-list-row">
                                            <span>VAT (12%)</span>
                                            <span className="sdm-list-value">₱{(booking.vatAmount || 0).toLocaleString()}</span>
                                        </div>
                                        {booking.poNumber && (
                                            <div className="sdm-list-row">
                                                <span>PO Number</span>
                                                <span className="sdm-list-value">{booking.poNumber}</span>
                                            </div>
                                        )}
                                        {booking.paymentTermsDays && (
                                            <div className="sdm-list-row">
                                                <span>Payment Terms</span>
                                                <span className="sdm-list-value">
                                                    {booking.paymentDueAt
                                                        ? `Due ${new Date(booking.paymentDueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                                                        : `${booking.paymentTermsDays} days after completion`}
                                                </span>
                                            </div>
                                        )}
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
                                        <span className="sdm-list-value">₱{paymentBreakdown.balance.toLocaleString()}</span>
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
                                                href={`${API_BASE}${booking.proofFile}`}
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
                                                href={`${API_BASE}${booking.balanceProofFile}`}
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

                            {/* Proof of purchase for a CZA-supplied unit - mirrors the client-supplied-
                                unit waiver's role but for the opposite case, backing a future 5yr/1yr
                                Unit Warranty claim. Not gated on completion, unlike Warranty Status below
                                (admin should be able to attach this as soon as the unit is sourced). */}
                            {booking.service?.serviceType === SERVICE_TYPE.INSTALLATION && !booking.clientSuppliedUnit && (
                                <>
                                    <h5 className="sdm-col-heading sdm-col-heading-spaced">
                                        <Icon name="file" /> UNIT PURCHASE PROOF
                                    </h5>
                                    <div className="sdm-list">
                                        <div className="sdm-list-row">
                                            <span>Proof of Purchase</span>
                                            <span className="sdm-list-value admin-service-details-modal-x23">
                                                {booking.unitPurchaseProof ? (
                                                    <a
                                                        href={`${API_BASE}${booking.unitPurchaseProof}`}
                                                        target="_blank" rel="noreferrer" className="sdm-link"
                                                    >
                                                        View File
                                                    </a>
                                                ) : 'Not uploaded'}
                                                <label className="sdm-btn sdm-btn-outline admin-service-details-modal-x24">
                                                    {uploadingProof ? 'Uploading...' : booking.unitPurchaseProof ? 'Replace' : 'Upload'}
                                                    <input
                                                        type="file" accept="image/*,.pdf" className="admin-service-details-modal-x25"
                                                        onChange={handleUnitPurchaseProofUpload}
                                                        disabled={uploadingProof}
                                                    />
                                                </label>
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}

                            {report?.submittedAt && (
                                <>
                                    <h5 className="sdm-col-heading sdm-col-heading-spaced">
                                        <Icon name="file" /> JOB REPORT
                                    </h5>
                                    <div className="sdm-list">
                                        <div className="sdm-list-row sdm-list-row-block">
                                            <span>Work Summary</span>
                                            <p className="sdm-list-value">{report.workSummary || 'N/A'}</p>
                                        </div>
                                        <div className="sdm-list-row sdm-list-row-block">
                                            <span>Parts Used</span>
                                            <p className="sdm-list-value">{report.partsUsed || 'N/A'}</p>
                                        </div>
                                        <div className="sdm-list-row sdm-list-row-block">
                                            <span>Recommendations</span>
                                            <p className="sdm-list-value">{report.recommendations || 'N/A'}</p>
                                        </div>
                                        {report.followUpRequired && (
                                            <div className="sdm-list-row sdm-list-row-block">
                                                <span>Follow-up Required</span>
                                                <p className="sdm-list-value">
                                                    Yes{report.followUpDate ? ` - by ${new Date(report.followUpDate).toLocaleDateString()}` : ''}
                                                </p>
                                            </div>
                                        )}
                                        {report.preExistingIssue?.flagged && (
                                            <div className="sdm-list-row sdm-list-row-block">
                                                <span>Pre-existing Issue Flagged</span>
                                                <p className="sdm-list-value">{report.preExistingIssue.description || 'N/A'}</p>
                                            </div>
                                        )}
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
                                            <span className={`sdm-list-value ${booking.warranty.workmanship.active ? 'sdm-state-ok' : 'sdm-state-bad'}`}>
                                                {booking.warranty.workmanship.active ? 'Active' : 'Expired'} - until {new Date(booking.warranty.workmanship.expiresAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                        {booking.warranty.unit && (
                                            <>
                                                <div className="sdm-list-row">
                                                    <span>Compressor</span>
                                                    <span className={`sdm-list-value ${booking.warranty.unit.compressorActive ? 'sdm-state-ok' : 'sdm-state-bad'}`}>
                                                        {booking.warranty.unit.compressorActive ? 'Active' : 'Expired'} - until {new Date(booking.warranty.unit.compressorExpiresAt).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <div className="sdm-list-row">
                                                    <span>Minor Parts</span>
                                                    <span className={`sdm-list-value ${booking.warranty.unit.minorPartsActive ? 'sdm-state-ok' : 'sdm-state-bad'}`}>
                                                        {booking.warranty.unit.minorPartsActive ? 'Active' : 'Expired'} - until {new Date(booking.warranty.unit.minorPartsExpiresAt).toLocaleDateString()}
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
                                        <p className="admin-service-details-modal-x7">"{booking.extensionRequest.reason}"</p>
                                        <div className="admin-service-details-modal-x8">
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

                    <AssignmentPanel booking={booking} onUpdated={onUpdated} />
                </div>

                <div className="sdm-footer">
                    {canCancel && (
                        <button className="sdm-btn sdm-btn-danger" onClick={handleCancel} disabled={saving}>
                            Cancel Booking
                        </button>
                    )}
                    <div className="sdm-footer-actions">
                        {booking.status === BOOKING_STATUS.APPROVED && (
                            <span className="sdm-muted">Starts automatically when its time block begins.</span>
                        )}
                        {booking.status === BOOKING_STATUS.IN_PROGRESS && (
                            <span className="sdm-muted">Completes when the technician submits the service report.</span>
                        )}
                        {nextSteps.map((step) => (
                            <button
                                key={step.value}
                                className="sdm-btn sdm-btn-primary"
                                onClick={() => handleStatusChange(step.value)}
                                disabled={
                                    saving ||
                                    (step.value === 'Approved' && !hasAssignment)
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
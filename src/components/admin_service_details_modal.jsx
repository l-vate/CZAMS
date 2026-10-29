import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiArrowRight } from 'react-icons/fi';
import { getBookingLineItems, getPaymentBreakdown, formatPeso } from '../utils/bookingPricing';
import AssignmentPanel from './assignment_panel';
import CancelBookingDialog from './cancel_booking_dialog';
import SuggestedDates from './suggested_dates';
import PaymentReference from './payment_reference';
import ScopeOfWorksEditor from './scope_of_works_editor';
import QuotationEditor from './quotation_editor';
import UnitRequestPanel from './unit_request_panel';
import { unitChangeOf } from '../utils/suppliedUnitChoice';
import CannotSupplyPanel from './cannot_supply_panel';
import { legacyDistanceAmount } from '../utils/chargeRows';
import { describeWorks } from '../utils/mayNeedWorks';
import ClosureDateInput from './closure_date_input';
import { warrantyStatusText } from '../utils/warrantyText';
import { BRAND_SHORT } from '../config/company';
import ReceiptModal from './receipt_modal';
import { buildReceiptForm } from '../utils/receiptData';
import { getMemberIds } from '../utils/assignments';
import { isWithinQuezonCity } from '../utils/serviceArea';
import { ApiError, attempt, orFallback } from '../services/apiClient';
import { getReportForBooking } from '../services/reportService';
import {
    adminUpdateBooking, recordPayment, moveToDate, uploadUnitPurchaseProof, rescheduleAfterDisruption, decideDiscount, decideReschedule, decideExtension,
} from '../services/bookingService';
import { BOOKING_STATUS } from '../constants/bookingStatus';
import { TIME_BLOCK } from '../constants/timeBlocks';
import { SERVICE_TYPE } from '../constants/serviceTypes';
import { ProofLink, ProofImage } from './proof_file';
import { customerLabel } from '../utils/customerLabel';

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

// asPage: drawn as the body of the booking details page (pages/admin/booking_details_page.jsx) instead of a popup over the list: no
// overlay, no close button; the page has its own Back link.
function AdminServiceDetailsModal({ booking, onClose, onUpdated, asPage = false }) {
    
    const [saving, setSaving] = useState(false);
    const [offeredDates, setOfferedDates] = useState([]); // dates offered after an approval is refused because nobody is free
    const [recordDraft, setRecordDraft] = useState(null); // a payment being recorded: received in person
    const [error, setError] = useState('');
    const [cancelOpen, setCancelOpen] = useState(false);
    const [disruptionDate, setDisruptionDate] = useState('');
    const [disruptionTime, setDisruptionTime] = useState('');
    const [disruptionReason, setDisruptionReason] = useState('');
    const [instructionsDraft, setInstructionsDraft] = useState(booking?.technicianInstructions || '');
    // the extra day to approve: what the lead asked for, which the admin can change
    const [extraDate, setExtraDate] = useState(booking?.extensionRequest?.requestedDate || '');
    const [extraTime, setExtraTime] = useState(booking?.extensionRequest?.requestedTime || booking?.time || 'Morning');
    const [editingInstructions, setEditingInstructions] = useState(false);
    const [editingCharges, setEditingCharges] = useState(false);
    const [mobilizationDraft, setMobilizationDraft] = useState(booking?.mobilizationFee || 0);
    const [uploadingProof, setUploadingProof] = useState(false);
    const [showReceipt, setShowReceipt] = useState(false);
const [report, setReport] = useState(null);
    const [rejectingDiscount, setRejectingDiscount] = useState(false);
    const [discountRejectReason, setDiscountRejectReason] = useState('');

    useEffect(() => {
        setInstructionsDraft(booking?.technicianInstructions || '');
        setEditingInstructions(false);
        setMobilizationDraft(booking?.mobilizationFee || 0);
        setEditingCharges(false);
        fetchReport();
    }, [booking]);

    if (!booking) return null;

    const canCancel = ![BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED].includes(booking.status);
    const nextSteps = NEXT_STATUS[booking.status] || [];
    const hasAssignment = getMemberIds(booking).length > 0;

    const { lineItems, basePrice } = getBookingLineItems(booking);
    const paymentBreakdown = getPaymentBreakdown({ ...booking, downPaymentPercent: booking.downPaymentPercent ?? 0 });
    const downPaymentAmount = paymentBreakdown.downPayment;
    const discountIdIsPdf = /\.pdf$/i.test(booking.discount?.idFile || '');

    // Reports live in the separate Report collection, not the deprecated embedded
    // booking.report field (never populated by the current report-submission flow).
    const fetchReport = async () => {
        if (!booking?.reportSubmitted && !booking?.reportId) {
            setReport(null);
            return;
        }
        try {
            const data = await orFallback(getReportForBooking(booking.bookingId), null);
            setReport(data);
        } catch (err) {
            console.error('Error fetching report:', err);
            setReport(null);
        }
    };

    const patchBooking = async (body) => {
        setSaving(true);
        setError('');
        setOfferedDates([]);
        try {
            let data;
            try {
                data = await adminUpdateBooking(booking.bookingId, body);
            } catch (err) {
                if (!(err instanceof ApiError)) throw err;
                setError(err.message || 'Something went wrong.');
                setOfferedDates((err.data && err.data.suggestedDates) || []); // when nobody is free, the dates that work
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

    // A payment received in person: method, amount and an optional reference, recorded with who received it.
    const handleRecordPayment = async () => {
        setSaving(true);
        setError('');
        try {
            const recorded = await attempt(recordPayment(booking.bookingId, recordDraft), 'Could not record the payment.');
            if (recorded.error) {
                setError(recorded.error);
                return;
            }
            setRecordDraft(null);
            onUpdated?.(recorded.data);
        } catch (err) {
            console.error('Error recording payment:', err);
            setError('Network error. Please try again.');
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
        // Only the mobilization fee is edited here. A distance charge is a "distance" line in the Scope of works (the one place for it).
        const success = await patchBooking({ mobilizationFee: mobilizationDraft });
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
            const uploaded = await attempt(uploadUnitPurchaseProof(booking.bookingId, file), 'Failed to upload proof of purchase.');
            if (uploaded.error) {
                setError(uploaded.error);
                return;
            }
            onUpdated?.(uploaded.data);
        } catch (err) {
            console.error('Error uploading unit purchase proof:', err);
            setError('Network error. Please try again.');
        } finally {
            setUploadingProof(false);
        }
    };

    // Cancel Booking opens a dialog that asks why (see components/cancel_booking_dialog.jsx) and is the confirmation step.
    const handleCancel = () => {
        setError('');
        setCancelOpen(true);
    };
    const confirmCancel = async (body) => {
        if (await patchBooking(body)) setCancelOpen(false);
    };

    const handleDisruptionReschedule = async () => {
        if (!disruptionDate || !disruptionTime) return;
        // With no report from the lead, the admin starts it and says why.
        const startedByAdmin = booking.disruption?.status !== 'Reported';
        if (startedByAdmin && !disruptionReason.trim()) {
            setError('Say what happened: a reason is required to reschedule a disrupted job.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const moved = await attempt(
                rescheduleAfterDisruption(booking.bookingId, { date: disruptionDate, time: disruptionTime, reason: startedByAdmin ? disruptionReason.trim() : undefined }),
                'Failed to reschedule.'
            );
            if (moved.error) {
                setError(moved.error);
                return;
            }
            onUpdated?.(moved.data);
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
            const decided = await attempt(
                decideDiscount(booking.bookingId, decision, discountRejectReason.trim()),
                'Failed to update the discount request.'
            );
            if (decided.error) {
                setError(decided.error);
                return;
            }
            setRejectingDiscount(false);
            setDiscountRejectReason('');
            onUpdated?.(decided.data);
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
            const decided = await attempt(decideReschedule(booking.bookingId, decision), 'Failed to update the reschedule request.');
            if (decided.error) {
                setError(decided.error);
                return;
            }
            onUpdated?.(decided.data);
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
            // on approve, the day asked for, or the one the admin picked here
            const slot = decision === 'approve' && extraDate ? { date: extraDate, time: extraTime } : undefined;
            const decided = await attempt(decideExtension(booking.bookingId, decision, slot), 'Failed to update extension request.');
            if (decided.error) {
                setError(decided.error);
                return;
            }
            onUpdated?.(decided.data);
        } catch (err) {
            console.error('Error updating extension request:', err);
            setError('Network error. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
        <div className={asPage ? 'sdm-page' : 'sdm-overlay'} onClick={asPage ? undefined : onClose}>
            <div className={asPage ? 'sdm-page-card' : 'sdm-modal'} onClick={asPage ? undefined : (e) => e.stopPropagation()}>
                {!asPage && <button type="button" className="modal-close-btn sdm-close-position" onClick={onClose}>✕</button>}
                <div className="sdm-body">
                    {asPage && (
                        <button type="button" className="sdm-back sdm-back--in-card" onClick={onClose}>
                            <FiArrowLeft /> Back to Bookings
                        </button>
                    )}
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

                    {/* One notice for an address outside Quezon City or outside the confirmed service areas: both mean the same thing for the
                        owner (check whether a mobilization fee belongs in the Scope of works). */}
                    {(() => {
                        const noDistanceYet = !booking.distanceAdjustment && !booking.mobilizationFee;
                        const outsideToPrice = !booking.isBackJob && booking.status === BOOKING_STATUS.PENDING && !isWithinQuezonCity(booking.address) && noDistanceYet;
                        // a cancelled booking is already decided, so the review flag is no longer shown
                        const flagged = booking.status !== BOOKING_STATUS.CANCELLED && booking.serviceAreaCheck && !booking.serviceAreaCheck.withinArea;
                        if (outsideToPrice) {
                            return <div className="sdm-notice">⚠ This address is outside Quezon City or CZA's confirmed service areas. Add a mobilization fee in the Scope of works before approving, if one applies.</div>;
                        }
                        if (flagged) {
                            return <div className="sdm-notice">⚠ This address didn't match any of CZA's confirmed service areas at booking time - flagged for review.</div>;
                        }
                        return null;
                    })()}

                    {error && !cancelOpen && <div className="sdm-error">{error}</div>}
                    {(/down payment/i.test(error) || booking.paymentStatus === 'to_verify' || booking.balancePaymentStatus === 'to_verify') && (
                        <Link to={`/admin/payments?filter=to_verify&q=${encodeURIComponent(booking.bookingId)}`} className="sdm-verify-payment">
                            Verify payment <FiArrowRight aria-hidden="true" />
                        </Link>
                    )}
                    <SuggestedDates
                        dates={offeredDates}
                        time={booking.time}
                        disabled={saving}
                        onUse={async (date, block) => {
                            setSaving(true);
                            try {
                                const moved = await attempt(moveToDate(booking.bookingId, { date, time: block }), 'Could not move the booking.');
                                if (moved.error) { setError(moved.error); return; }
                                setOfferedDates([]);
                                setError('');
                                onUpdated?.(moved.data);
                            } finally {
                                setSaving(false);
                            }
                        }}
                    />

                    {/* once the customer was told the unit cannot be supplied, there is nothing left to settle for the requested unit */}
                    {!booking.unitDecline?.reason && <UnitRequestPanel booking={booking} onUpdated={onUpdated} />}
                    <CannotSupplyPanel booking={booking} onUpdated={onUpdated} />

                    <div className="sdm-customer-line">
                        <Icon name="user" />
                        <span>{customerLabel(booking.customer)}</span>
                        {booking.customer?.email && <span className="sdm-muted">· {booking.customer.email}</span>}
                        <span className="sdm-muted">· Contact: {booking.contactNumber || booking.customer?.phone || 'N/A'}</span>
                        {booking.customer?.companyName && <span className="sdm-muted">· Company: {booking.customer.companyName}</span>}
                        {booking.customer?.representativeName && <span className="sdm-muted">· Representative: {booking.customer.representativeName}</span>}
                    </div>

                    <div className="sdm-columns">
                        <div className="sdm-col">
                            <h4 className="sdm-service-name">{booking.service?.name || 'Service'}</h4>
                            {lineItems.filter((li) => !li.isCharge).map((li, i) => (
                                <p className="sdm-unit-line" key={i}>
                                    Unit: {li.quantity}× {li.type}
                                    {li.brandModel ? ` · ${li.brandModel}` : ''}
                                    {li.hp ? ` · ${li.hp} HP` : ''}
                                    {li.supplied?.source === 'requested' ? ` · ${li.supplied.status === 'Declined' ? 'request declined' : 'needs owner confirmation'}` : ''}
                                    {unitChangeOf(li) && (
                                        <span className="unit-change-note">
                                            <span>Requested: {unitChangeOf(li).requested} (not available)</span>
                                            <span>Changed to: {unitChangeOf(li).changedTo}</span>
                                        </span>
                                    )}
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

                            {describeWorks(booking.mayNeedWorks) && (
                                <div className="sdm-row">
                                    <div className="sdm-row-icon"><Icon name="info" /></div>
                                    <div>
                                        <span className="sdm-row-label">CUSTOMER MAY NEED THESE WORKS</span>
                                        <p className="sdm-row-value">{describeWorks(booking.mayNeedWorks)}</p>
                                        <p className="sdm-muted">A heads-up only. It does not change the price. Send a quotation if it applies.</p>
                                    </div>
                                </div>
                            )}

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
                                            <ClosureDateInput
                                                className="ma-input"
                                                value={disruptionDate}
                                                onChange={setDisruptionDate}
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

                            {['Approved', 'In Progress'].includes(booking.status) && booking.disruption?.status !== 'Reported' && (
                                <div className="sdm-notice">
                                    <p className="admin-service-details-modal-x5">Job disrupted? Reschedule it now, without waiting for a report:</p>
                                    <textarea
                                        className="sdm-tech-select"
                                        rows={2}
                                        maxLength={300}
                                        aria-label="What happened"
                                        placeholder="What happened (required, the technicians see it)"
                                        value={disruptionReason}
                                        onChange={(e) => setDisruptionReason(e.target.value)}
                                    />
                                    <div className="admin-service-details-modal-x9">
                                        <div>
                                            <label className="sdm-row-label admin-service-details-modal-x10">New Date</label>
                                            <ClosureDateInput className="ma-input" value={disruptionDate} onChange={setDisruptionDate} />
                                        </div>
                                        <div>
                                            <label className="sdm-row-label admin-service-details-modal-x10">New Time</label>
                                            <select className="sdm-tech-select" value={disruptionTime} onChange={(e) => setDisruptionTime(e.target.value)}>
                                                <option value="">Select</option>
                                                <option value={TIME_BLOCK.MORNING}>{TIME_BLOCK.MORNING}</option>
                                                <option value={TIME_BLOCK.AFTERNOON}>{TIME_BLOCK.AFTERNOON}</option>
                                            </select>
                                        </div>
                                        <button
                                            className="sdm-btn sdm-btn-primary"
                                            onClick={handleDisruptionReschedule}
                                            disabled={saving || !disruptionDate || !disruptionTime || !disruptionReason.trim()}
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
                                            <span className="sdm-list-value">
                                                {booking.discount.status}
                                                {booking.discount.reviewedBy?.name && ['Approved', 'Rejected'].includes(booking.discount.status)
                                                    ? ` by ${booking.discount.reviewedBy.name}`
                                                    : ''}
                                            </span>
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
                                                    <ProofLink path={booking.discount.idFile} className="sdm-link">Open ID (PDF)</ProofLink>
                                                ) : (
                                                    <ProofLink path={booking.discount.idFile}>
                                                        <ProofImage
                                                            path={booking.discount.idFile}
                                                            alt="Uploaded valid ID"
                                                            className="admin-service-details-modal-x12"
                                                        />
                                                    </ProofLink>
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
                                                <span>{li.isDiscount ? li.type : li.isScope ? `${li.type}: ${li.quantity} ${li.unitLabel || 'unit'} @ ${formatPeso(li.unitPrice)}` : `${li.quantity}× ${li.type} @ ${formatPeso(li.unitPrice)}`}</span>
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
                                                ) : null}
                                                <div className="admin-service-details-modal-x18">
                                                    <button className="sdm-btn sdm-btn-outline" onClick={() => {
                                                        setEditingCharges(false);
                                                        setMobilizationDraft(booking.mobilizationFee || 0);
                                                    }}>Cancel</button>
                                                    <button className="sdm-btn sdm-btn-primary" onClick={handleSaveCharges} disabled={saving}>Save</button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        booking.service?.serviceType === SERVICE_TYPE.INSTALLATION ? (
                                            // A distance charge is a line in the Scope of works. Only an older booking that already holds a mobilization fee
                                            // shows it here, read-only, so the figure in the total is still explained.
                                            booking.mobilizationFee > 0 && (
                                                <div className="sdm-list-row admin-service-details-modal-x19">
                                                    <span className="admin-service-details-modal-x20">Mobilization Fee</span>
                                                    <span className="sdm-list-value admin-service-details-modal-x21">
                                                        ₱{(booking.mobilizationFee || 0).toLocaleString()}
                                                        <small className="sdm-muted"> Entered before the Scope of works had a mobilization fee.</small>
                                                    </span>
                                                </div>
                                            )
                                        ) : (
                                            // An older booking that holds a value in the old distance field shows it read-only. A booking with a distance line in
                                            // its Scope of works shows the charge there, once. Nothing new is entered here.
                                            legacyDistanceAmount(booking) !== null && (
                                                <div className="sdm-list-row admin-service-details-modal-x19">
                                                    <span className="admin-service-details-modal-x20">Mobilization Fee</span>
                                                    <span className="sdm-list-value admin-service-details-modal-x21">
                                                        ₱{legacyDistanceAmount(booking).toLocaleString()}
                                                        <small className="sdm-muted"> Entered before the Scope of works had a mobilization fee.</small>
                                                    </span>
                                                </div>
                                            )
                                        )
                                    )
                                )}
                                {booking.isCommercial && (
                                    <>
                                        <div className="sdm-list-row">
                                            <span>{booking.taxInclusive ? 'VAT included (12%)' : 'VAT (12%)'}</span>
                                            <span className="sdm-list-value">₱{(booking.vatAmount || 0).toLocaleString()}</span>
                                        </div>
                                        {booking.poNumber && (
                                            <div className="sdm-list-row">
                                                <span>PO Number</span>
                                                <span className="sdm-list-value">{booking.poNumber}</span>
                                            </div>
                                        )}
                                        {booking.paymentTermsDays > 0 && (
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
                                            <ProofLink path={booking.proofFile} className="sdm-link">View File</ProofLink>
                                        ) : (
                                            'N/A'
                                        )}
                                    </span>
                                </div>
                                <div className="sdm-list-row">
                                    <span>Reference Number</span>
                                    <span className="sdm-list-value">
                                        <PaymentReference booking={booking} />
                                    </span>
                                </div>
                                <div className="sdm-list-row">
                                    <span>Invoice / Receipt</span>
                                    <span className="sdm-list-value">
                                        <button type="button" className="sdm-btn sdm-btn-outline" onClick={() => setShowReceipt(true)}>
                                            View and print
                                        </button>
                                    </span>
                                </div>
                                {Array.isArray(booking.paymentEvents) && booking.paymentEvents.length > 0 && (
                                    <div className="sdm-list-row">
                                        <span>Payment history</span>
                                        <span className="sdm-list-value">
                                            <ul className="assignment-list">
                                                {booking.paymentEvents.map((e, i) => (
                                                    <li key={i}>
                                                        {new Date(e.at).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}: {e.track === 'balance' ? 'Balance' : 'Down payment'} {e.status}
                                                        {e.amount ? `, ${formatPeso(e.amount)}` : ''}{e.method ? ` by ${e.method}` : ''}{e.reference ? ` (${e.reference})` : ''}
                                                        {' '}by {e.by?.name || 'an admin'}{e.reason ? `. Reason: ${e.reason}` : ''}
                                                    </li>
                                                ))}
                                            </ul>
                                        </span>
                                    </div>
                                )}
                                {booking.status !== 'Cancelled' && (
                                    <div className="sdm-list-row">
                                        <span>Received in person</span>
                                        <span className="sdm-list-value">
                                            {recordDraft ? (
                                                <span>
                                                    <select className="sdm-tech-select" aria-label="Which payment" value={recordDraft.track} onChange={(e) => setRecordDraft({ ...recordDraft, track: e.target.value })}>
                                                        <option value="down">Down payment</option>
                                                        <option value="balance">Balance</option>
                                                    </select>
                                                    <select className="sdm-tech-select" aria-label="Method" value={recordDraft.method} onChange={(e) => setRecordDraft({ ...recordDraft, method: e.target.value })}>
                                                        {['Cash', 'Cheque', 'GCash', 'Bank Transfer'].map((m) => <option key={m} value={m}>{m}</option>)}
                                                    </select>
                                                    <input className="ma-input" type="number" min="1" step="0.01" aria-label="Amount received" placeholder="Amount received" value={recordDraft.amount} onChange={(e) => setRecordDraft({ ...recordDraft, amount: e.target.value })} />
                                                    <input className="ma-input" type="text" maxLength={60} aria-label="Reference or cheque number" placeholder="Reference or cheque no. (optional)" value={recordDraft.reference} onChange={(e) => setRecordDraft({ ...recordDraft, reference: e.target.value })} />
                                                    <button type="button" className="sdm-btn sdm-btn-primary" onClick={handleRecordPayment} disabled={saving || !recordDraft.amount}>Record payment</button>
                                                    <button type="button" className="sdm-btn sdm-btn-outline" onClick={() => setRecordDraft(null)} disabled={saving}>Cancel</button>
                                                </span>
                                            ) : (
                                                <button type="button" className="sdm-btn sdm-btn-outline" onClick={() => setRecordDraft({ track: 'down', method: 'Cash', amount: '', reference: '' })}>
                                                    Record a payment
                                                </button>
                                            )}
                                        </span>
                                    </div>
                                )}
                                <div className="sdm-list-row">
                                    <span>Balance Paid</span>
                                    <span className="sdm-list-value">{booking.balancePaid ? 'Yes' : 'No'}</span>
                                </div>
                                {booking.balanceProofFile && (
                                    <div className="sdm-list-row">
                                        <span>Balance Proof</span>
                                        <span className="sdm-list-value">
                                            <ProofLink path={booking.balanceProofFile} className="sdm-link">View File</ProofLink>
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Where the unit of an Installation came from. The admin can correct it; the warranty window follows it
                                (6 months for a company unit, 3 months for the customer's own). */}
                            {booking.service?.serviceType === SERVICE_TYPE.INSTALLATION && (
                                <>
                                    <h5 className="sdm-col-heading sdm-col-heading-spaced">
                                        <Icon name="info" /> UNIT SOURCE
                                    </h5>
                                    <div className="sdm-list">
                                        <div className="sdm-list-row">
                                            <span>Unit supplied by</span>
                                            <select
                                                className="sdm-tech-select"
                                                aria-label="Unit supplied by"
                                                value={booking.unitSource || (booking.clientSuppliedUnit ? 'customer' : 'company')}
                                                onChange={(e) => patchBooking({ unitSource: e.target.value })}
                                            >
                                                <option value="company">{BRAND_SHORT}</option>
                                                <option value="customer">Customer (own unit)</option>
                                            </select>
                                        </div>
                                    </div>
                                </>
                            )}

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
                                                    <ProofLink path={booking.unitPurchaseProof} className="sdm-link">View File</ProofLink>
                                                ) : 'Not uploaded'}
                                                <label className="sdm-btn sdm-btn-outline admin-service-details-modal-x24">
                                                    {uploadingProof ? 'Uploading...' : booking.unitPurchaseProof ? 'Replace' : 'Upload'}
                                                    <input
                                                        type="file" accept="image/jpeg,image/png,image/webp,.pdf" className="admin-service-details-modal-x25"
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
                                                {warrantyStatusText(booking.warranty.workmanship.active, booking.warranty.workmanship.expiresAt)}
                                            </span>
                                        </div>
                                        {booking.warranty.unit && (
                                            <>
                                                <div className="sdm-list-row">
                                                    <span>Compressor</span>
                                                    <span className={`sdm-list-value ${booking.warranty.unit.compressorActive ? 'sdm-state-ok' : 'sdm-state-bad'}`}>
                                                        {warrantyStatusText(booking.warranty.unit.compressorActive, booking.warranty.unit.compressorExpiresAt)}
                                                    </span>
                                                </div>
                                                <div className="sdm-list-row">
                                                    <span>Minor Parts</span>
                                                    <span className={`sdm-list-value ${booking.warranty.unit.minorPartsActive ? 'sdm-state-ok' : 'sdm-state-bad'}`}>
                                                        {warrantyStatusText(booking.warranty.unit.minorPartsActive, booking.warranty.unit.minorPartsExpiresAt)}
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
                                        <div className="sdm-list-row">
                                            <span>Extra day</span>
                                            <span className="sdm-list-value">
                                                <input type="date" aria-label="Extra day" value={extraDate} onChange={(e) => setExtraDate(e.target.value)} />
                                                {' '}
                                                <select aria-label="Time block for the extra day" value={extraTime} onChange={(e) => setExtraTime(e.target.value)}>
                                                    <option value="Morning">Morning</option>
                                                    <option value="Afternoon">Afternoon</option>
                                                </select>
                                            </span>
                                        </div>
                                        <p className="sdm-muted">Approving holds every technician on this job for that day and block. If one of them is already booked, it is refused and you can pick another day.</p>
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
                                        {(booking.extensionDays || []).map((d) => (
                                            <div className="sdm-list-row" key={`${d.date}-${d.time}`}>
                                                <span>Extra day approved</span>
                                                <span className="sdm-list-value">{d.date}, {d.time}</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <ScopeOfWorksEditor booking={booking} onUpdated={onUpdated} />

                    <QuotationEditor booking={booking} onUpdated={onUpdated} />

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
        {cancelOpen && (
            <CancelBookingDialog bookingId={booking.bookingId} saving={saving} error={error} onConfirm={confirmCancel} onClose={() => setCancelOpen(false)} />
        )}
        {showReceipt && (
            <ReceiptModal
                form={buildReceiptForm(booking, {
                    customerName: customerLabel(booking.customer, '-'),
                    contactNumber: booking.contactNumber || booking.customer?.phone,
                })}
                booking={booking}
                billTo={{ companyName: booking.customer?.companyName, representativeName: booking.customer?.representativeName }}
                onClose={() => setShowReceipt(false)}
            />
        )}
        </>
    );
}

export default AdminServiceDetailsModal;
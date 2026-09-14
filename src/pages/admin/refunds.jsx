import React, { useState, useEffect, useMemo } from 'react';
import AdminLayout from './admin_layout';
import { FiSearch, FiX } from 'react-icons/fi';

const API_BASE = 'http://localhost:5000';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'Pending', label: 'Pending' },
  { key: 'Processed', label: 'Processed' },
];

// Reuses the existing status-pill color language: amber for "awaiting admin action",
// green for "done" — same as payments.jsx's to_verify/fully_paid colors.
const STATUS_META = {
  Pending: { label: 'Pending', className: 'status-pill status-pill--verify' },
  Processed: { label: 'Processed', className: 'status-pill status-pill--full' },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status];
  if (!meta) return null;
  return <span className={meta.className}>{meta.label}</span>;
}

function SearchIcon() {
  return <FiSearch className="icon-search" aria-hidden="true" />;
}

function CloseIcon() {
  return <FiX aria-hidden="true" />;
}

/* ── Refund Review Modal ──────────────────────────────── */
function RefundReviewModal({ refund, onClose, onSuccess }) {
  const [dispatchDeduction, setDispatchDeduction] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!refund) return null;

  const isPending = refund.status === 'Pending';
  const deductionNum = Number(dispatchDeduction) || 0;
  const previewRefundable = refund.isSameDay
    ? Math.max(refund.downPaymentAmount - deductionNum, 0)
    : refund.downPaymentAmount;

  const handleProcess = async () => {
    if (refund.isSameDay && (dispatchDeduction === '' || isNaN(Number(dispatchDeduction)) || Number(dispatchDeduction) < 0)) {
      setError('Enter a valid dispatch/transportation deduction amount.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/bookings/${refund.bookingId}/refund`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(refund.isSameDay ? { dispatchDeduction: deductionNum } : {}),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to process refund.');
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Error processing refund:', err);
      setError(err.message || 'Network error while processing refund.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card payment-review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ marginBottom: '4px' }}>
          <h4 className="modal-title">{isPending ? 'Review Refund Request' : 'Refund Details'}</h4>
          <button className="modal-close-btn" onClick={onClose} disabled={submitting}>
            <CloseIcon />
          </button>
        </div>

        <p className="payment-review-booking">{refund.serviceType} · {refund.bookingId}</p>

        {error && (
          <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '12px' }}>{error}</p>
        )}

        <div className="payment-review-grid">
          <div className="payment-review-cell">
            <span className="confirmation-detail-label">Client</span>
            <span className="confirmation-detail-value">{refund.clientName}</span>
          </div>

          <div className="payment-review-cell">
            <span className="confirmation-detail-label">Cancellation Type</span>
            <span className="confirmation-detail-value">{refund.isSameDay ? 'Same-day' : 'Pre-service'}</span>
          </div>

          <div className="payment-review-cell">
            <span className="confirmation-detail-label">Down Payment</span>
            <span className="confirmation-detail-value">₱{refund.downPaymentAmount?.toLocaleString()}</span>
          </div>

          <div className="payment-review-cell">
            <span className="confirmation-detail-label">Status</span>
            <span className="confirmation-detail-value"><StatusBadge status={refund.status} /></span>
          </div>
        </div>

        {refund.isSameDay && isPending && (
          <div className="bs-field-group">
            <label className="bs-label">Dispatch / Transportation Deduction (₱)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="bs-input"
              placeholder="0.00"
              value={dispatchDeduction}
              onChange={(e) => setDispatchDeduction(e.target.value)}
            />
          </div>
        )}

        {refund.isSameDay && !isPending && (
          <div className="payment-review-cell" style={{ marginBottom: '16px' }}>
            <span className="confirmation-detail-label">Dispatch / Transportation Deduction</span>
            <span className="confirmation-detail-value">₱{refund.dispatchDeduction?.toLocaleString()}</span>
          </div>
        )}

        <div className="payment-review-cell" style={{ marginBottom: '20px' }}>
          <span className="confirmation-detail-label">
            {isPending ? 'Refundable Amount' : 'Refunded Amount'}
          </span>
          <span className="confirmation-detail-value">
            ₱{(isPending ? previewRefundable : refund.refundableAmount)?.toLocaleString()}
          </span>
        </div>

        {isPending ? (
          <div className="cancel-confirm-actions">
            <button type="button" className="bs-back-btn" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="button" className="bs-next-btn" onClick={handleProcess} disabled={submitting}>
              {submitting ? 'Processing...' : 'Mark as Processed'}
            </button>
          </div>
        ) : (
          <button type="button" className="bs-next-btn" style={{ width: '100%' }} onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}

function RefundCard({ refund, onReview }) {
  return (
    <div className="refund-card">
      <div className="refund-card__main">
        <div className="refund-card__header">
          <span className="refund-card__client">{refund.clientName}</span>
          <span className="refund-card__dot">·</span>
          <StatusBadge status={refund.status} />
          {refund.isSameDay && <span className="refund-card__same-day-tag">Same-day cancellation</span>}
        </div>
        <div className="refund-card__service">
          <span className="refund-card__service-type">{refund.serviceType}</span>
          <span className="refund-card__dot">·</span>
          <span className="refund-card__detail">{refund.bookingId}</span>
        </div>
      </div>

      <div className="refund-card__amount">
        <span className="refund-card__amount-label">
          {refund.status === 'Processed' ? 'Refunded' : 'Down Payment'}
        </span>
        <span className="refund-card__amount-value">
          ₱{(refund.status === 'Processed' ? refund.refundableAmount : refund.downPaymentAmount)?.toLocaleString()}
        </span>
      </div>

      <div className="refund-card__action">
        <button type="button" className="refund-card__review-btn" onClick={() => onReview(refund)}>
          {refund.status === 'Pending' ? 'Review' : 'View'}
        </button>
      </div>
    </div>
  );
}

function Refunds() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedRefund, setSelectedRefund] = useState(null);
  const [rawBookings, setRawBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/bookings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch bookings');
      const data = await res.json();
      setRawBookings(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching refunds:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  // Only bookings that actually opened a refund request are relevant here —
  // a cancelled cleaning booking with no down payment never gets a refund object.
  const refundsList = useMemo(() => {
    return rawBookings
      .filter((b) => b.refund && b.refund.status !== 'None')
      .map((b) => {
        const clientName = typeof b.customer === 'object' ? (b.customer?.name || 'Customer') : 'Customer';
        const serviceType = typeof b.service === 'object' ? (b.service?.name || 'Service') : 'Service';

        return {
          id: b._id || b.bookingId,
          bookingId: b.bookingId,
          clientName,
          serviceType,
          status: b.refund.status,
          isSameDay: b.refund.isSameDay,
          downPaymentAmount: b.refund.downPaymentAmount,
          dispatchDeduction: b.refund.dispatchDeduction,
          refundableAmount: b.refund.refundableAmount,
          requestedAt: b.refund.requestedAt,
          raw: b,
        };
      })
      .sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0));
  }, [rawBookings]);

  const filteredRefunds = useMemo(() => {
    return refundsList.filter((refund) => {
      const matchesFilter = activeFilter === 'all' || refund.status === activeFilter;
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        refund.clientName.toLowerCase().includes(query) ||
        refund.bookingId.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [refundsList, activeFilter, search]);

  const handleReview = (refund) => {
    setSelectedRefund(refund);
  };

  return (
    <AdminLayout title="Refunds">
      <div className="refunds-toolbar">
        <div className="refunds-filters">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`filter-pill ${activeFilter === filter.key ? 'filter-pill--active' : ''}`}
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="refunds-search">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search by name, booking id..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="refunds-empty">Loading refund requests...</div>
      ) : (
        <div className="refunds-list">
          {filteredRefunds.length === 0 ? (
            <div className="refunds-empty">No refund requests match your search.</div>
          ) : (
            filteredRefunds.map((refund) => (
              <RefundCard key={refund.id} refund={refund} onReview={handleReview} />
            ))
          )}
        </div>
      )}

      {selectedRefund && (
        <RefundReviewModal
          refund={selectedRefund}
          onClose={() => setSelectedRefund(null)}
          onSuccess={fetchBookings}
        />
      )}
    </AdminLayout>
  );
}

export default Refunds;

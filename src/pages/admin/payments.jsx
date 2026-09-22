import { useMemo, useState, useEffect } from 'react';
import AdminLayout from './admin_layout';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'to_verify', label: 'To Verify' },
  { key: 'partially_paid', label: 'Partially Paid' },
  { key: 'fully_paid', label: 'Fully Paid' },
  { key: 'rejected', label: 'Rejected' },
];

const STATUS_META = {
  unpaid: { label: 'Unpaid', className: 'status-pill status-pill--unpaid' },
  to_verify: { label: 'To Verify', className: 'status-pill status-pill--verify' },
  partially_paid: { label: 'Partially Paid', className: 'status-pill status-pill--partial' },
  fully_paid: { label: 'Fully Paid', className: 'status-pill status-pill--full' },
  rejected: { label: 'Rejected', className: 'status-pill status-pill--rejected' },
  balance_rejected: { label: 'Balance Rejected', className: 'status-pill status-pill--rejected' },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status];
  if (!meta) return null;
  return <span className={meta.className}>{meta.label}</span>;
}

function ClockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="icon-clock"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

/* ── Review Request Modal ──────────────────────────────── */
function ReviewRequestModal({ payment, onClose, onSuccess }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!payment) return null;

  const handleUpdatePaymentStatus = async (status) => {
    setSubmitting(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const isBalanceProof = Boolean(payment.raw?.balanceProofFile && payment.raw?.balancePaymentStatus === 'to_verify');
      const isRejecting = status === 'rejected';

      // Decide target statuses based on whether it's a balance proof or down payment proof,
      // and whether this is an approval or a rejection. Rejecting a balance proof must NOT
      // mark it paid — each track (down payment / balance) is rejected or approved independently.
      const payload = isBalanceProof
        ? (isRejecting
            ? { balancePaymentStatus: 'rejected' }
            : { balancePaymentStatus: 'paid', balancePaid: true })
        : { paymentStatus: status }; // status can be 'partially_paid', 'fully_paid', or 'rejected'

      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/bookings/${payment.bookingId}/admin-update`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to update payment status.');
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Error updating payment status:', err);
      setError(err.message || 'Network error while processing request.');
    } finally {
      setSubmitting(false);
    }
  };

  const isPdf = payment.attachmentUrl?.toLowerCase().endsWith('.pdf');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card payment-review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ marginBottom: '4px' }}>
          <h4 className="modal-title">Review Payment Request</h4>
          <button className="modal-close-btn" onClick={onClose} disabled={submitting}>
            <CloseIcon />
          </button>
        </div>

        <p className="payment-review-booking" style={{ margin: '2px 0 16px', color: '#6b7280', fontSize: '14px' }}>
          {payment.serviceType} · {payment.bookingId}
        </p>

        {error && (
          <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '12px' }}>{error}</p>
        )}

        <div
          className="payment-review-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '14px 20px',
            marginBottom: '20px',
          }}
        >
          <div className="payment-review-cell" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="confirmation-detail-label">Client</span>
            <span className="confirmation-detail-value">{payment.clientName}</span>
          </div>

          <div className="payment-review-cell" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="confirmation-detail-label">Technician</span>
            <span className="confirmation-detail-value">{payment.technician}</span>
          </div>

          <div className="payment-review-cell" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="confirmation-detail-label">Date &amp; Time</span>
            <span className="confirmation-detail-value">{payment.date}, {payment.time}</span>
          </div>

          <div className="payment-review-cell" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="confirmation-detail-label">Amount</span>
            <span className="confirmation-detail-value">{payment.amount}</span>
          </div>

          <div className="payment-review-cell" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="confirmation-detail-label">Status</span>
            <span className="confirmation-detail-value"><StatusBadge status={payment.status} /></span>
          </div>
        </div>

        <div className="payment-review-attachment-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
          <span className="confirmation-detail-label">Attached File</span>
          {payment.hasAttachment ? (
            payment.attachmentUrl ? (
              isPdf ? (
                <div style={{ textAlign: 'center', padding: '16px', border: '1px dashed #d1d5db', borderRadius: '8px' }}>
                  <p style={{ fontSize: '13px', color: '#374151', marginBottom: '10px' }}>PDF Document Attached</p>
                  <a
                    href={payment.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-block',
                      padding: '8px 16px',
                      background: '#2563eb',
                      color: '#fff',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: '600',
                    }}
                  >
                    📄 View PDF Proof
                  </a>
                </div>
              ) : (
                <a href={payment.attachmentUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={payment.attachmentUrl}
                    alt="Payment proof"
                    className="payment-review-attachment-img"
                    style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  />
                </a>
              )
            ) : (
              <div
                className="payment-review-attachment-placeholder"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '24px 16px',
                  border: '1px dashed #d1d5db',
                  borderRadius: '8px',
                  color: '#6b7280',
                  textAlign: 'center',
                }}
              >
                <FileIcon />
                <span style={{ fontWeight: 600, fontSize: '14px' }}>proof_of_payment_{payment.bookingId}</span>
              </div>
            )
          ) : (
            <div
              className="payment-review-attachment-placeholder payment-review-attachment-placeholder--empty"
              style={{
                padding: '16px',
                border: '1px dashed #d1d5db',
                borderRadius: '8px',
                color: '#9ca3af',
                fontSize: '14px',
                textAlign: 'center',
              }}
            >
              No file was attached to this request.
            </div>
          )}
        </div>


          <div className="cancel-confirm-actions" style={{ marginTop: '4px' }}>
          <button
            type="button"
            className="cancel-booking-btn"
            onClick={() => handleUpdatePaymentStatus('rejected')} // Changed 'Rejected' to 'rejected'
            disabled={submitting}
          >
            {submitting ? 'Processing...' : 'Reject'}
          </button>
          <button
            type="button"
            className="bs-next-btn"
            onClick={() => {
              // Automatically check if it's 100% full payment or partial payment
              const dpPercent = payment.raw?.downPaymentPercent ?? 10;
              const targetStatus = dpPercent === 100 ? 'fully_paid' : 'partially_paid';
              handleUpdatePaymentStatus(targetStatus);
            }}
            disabled={submitting}
          >
            {submitting ? 'Processing...' : 'Approve'}
          </button>
        </div>

      </div>
    </div>
  );
}

function PaymentCard({ payment, onReviewRequest }) {
  return (
    <div className="payment-card">
      <div className="payment-card__main">
        <div className="payment-card__header">
          <span className="payment-card__client">{payment.clientName}</span>
          <span className="payment-card__dash">–</span>
          <StatusBadge status={payment.status} />
        </div>
        <div className="payment-card__service">
          <span className="payment-card__service-type">{payment.serviceType}</span>
          <span className="payment-card__dot">·</span>
          <span className="payment-card__detail">{payment.detail}</span>
        </div>
        <div className="payment-card__booking">{payment.bookingId}</div>
        <div className="payment-card__technician">Technician: {payment.technician}</div>
      </div>

      <div className="payment-card__datetime">
        <ClockIcon />
        <span>{payment.date} {payment.time}</span>
      </div>

      <div className="payment-card__attachment">
        <ClockIcon />
        <span className={`payment-card__link ${payment.hasAttachment ? '' : 'payment-card__link--muted'}`}>
          {payment.hasAttachment ? 'Attached file' : 'No file'}
        </span>
      </div>

      <div className="payment-card__action">
        <button
          type="button"
          className="payment-card__link payment-card__review-btn"
          onClick={() => onReviewRequest(payment)}
        >
          Review Request
        </button>
      </div>
    </div>
  );
}

function Payments() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [rawBookings, setRawBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch all bookings for Admin
  const fetchBookings = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/bookings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch bookings');
      const data = await res.json();
      setRawBookings(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching payments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  // Format backend records defensively
  const paymentsList = useMemo(() => {
    return rawBookings.map((b) => {
      const clientName = typeof b.customer === 'object' ? (b.customer?.name || 'Customer') : (b.customerName || 'Customer');
      const technician = typeof b.technician === 'object' ? (b.technician?.name || 'Unassigned') : (b.technician || 'Unassigned');
      const serviceType = typeof b.service === 'object' ? (b.service?.name || 'Service') : (b.service || 'Service');
      const detail = b.brandModel || b.unitTypes || b.problemDescription || 'Detail';

      const basePrice = b.service?.price || b.basePrice || 0;
      const dpPercent = b.downPaymentPercent ?? 10;

      // paymentStatus and balancePaymentStatus are the real schema fields (lowercase enum
      // values), and they're tracked independently: a balance rejection must never look
      // like the down payment itself was rejected, and vice versa.
      let status = 'unpaid';
      if (b.paymentStatus === 'rejected') {
        status = 'rejected';
      } else if (b.paymentStatus === 'fully_paid' || b.balancePaid || b.balancePaymentStatus === 'paid') {
        status = 'fully_paid';
      } else if (b.paymentStatus === 'partially_paid') {
        if (b.balancePaymentStatus === 'rejected') status = 'balance_rejected';
        else if (b.balancePaymentStatus === 'to_verify') status = 'to_verify';
        else status = 'partially_paid';
      } else if (b.paymentStatus === 'to_verify') {
        status = 'to_verify';
      } else {
        status = 'unpaid';
      }

      // Prefer showing whichever proof is actually awaiting review right now.
      const proofFile = b.balancePaymentStatus === 'to_verify'
        ? (b.balanceProofFile || b.proofFile)
        : (b.proofFile || b.balanceProofFile);
      const attachmentUrl = proofFile
        ? (proofFile.startsWith('http') ? proofFile : `${import.meta.env.VITE_API_URL}${proofFile}`)
        : null;

      return {
        id: b._id || b.bookingId,
        bookingId: b.bookingId,
        clientName,
        serviceType,
        detail,
        technician,
        date: b.date || 'N/A',
        time: b.time || 'N/A',
        status,
        hasAttachment: Boolean(attachmentUrl),
        attachmentUrl,
        amount: `₱${basePrice.toLocaleString()}`,
        raw: b,
      };
    });
  }, [rawBookings]);

  // Apply Search & Filter Pills
  const filteredPayments = useMemo(() => {
    return paymentsList.filter((payment) => {
      const matchesFilter =
        activeFilter === 'all' ||
        payment.status === activeFilter ||
        (activeFilter === 'rejected' && payment.status === 'balance_rejected');
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        payment.clientName.toLowerCase().includes(query) ||
        payment.bookingId.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [paymentsList, activeFilter, search]);

  const handleReviewRequest = (payment) => {
    setSelectedPayment(payment);
  };

  return (
    <AdminLayout title="Payments">
      <div className="payments-toolbar">
        <div className="payments-filters">
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

        <div className="payments-search">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, booking id..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="payments-empty">Loading payment requests...</div>
      ) : (
        <div className="payments-list">
          {filteredPayments.length === 0 ? (
            <div className="payments-empty">No payment requests match your search.</div>
          ) : (
            filteredPayments.map((payment) => (
              <PaymentCard
                key={payment.id}
                payment={payment}
                onReviewRequest={handleReviewRequest}
              />
            ))
          )}
        </div>
      )}

      {selectedPayment && (
        <ReviewRequestModal
          payment={selectedPayment}
          onClose={() => setSelectedPayment(null)}
          onSuccess={fetchBookings}
        />
      )}
    </AdminLayout>
  );
}

export default Payments;
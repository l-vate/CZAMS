import { useMemo, useState } from 'react';
  import AdminLayout from './admin_layout';
  
  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'to_verify', label: 'To Verify' },
    { key: 'partially_paid', label: 'Partially Paid' },
    { key: 'fully_paid', label: 'Fully Paid' },
  ];

  const STATUS_META = {
    to_verify: { label: 'To Verify', className: 'status-pill status-pill--verify' },
    partially_paid: { label: 'Partially Paid', className: 'status-pill status-pill--partial' },
    fully_paid: { label: 'Fully Paid', className: 'status-pill status-pill--full' },
  };

  // TODO: replace with data from the API once the payments endpoint is wired up.
  const MOCK_PAYMENTS = [
    {
      id: 'PAY-1042',
      clientName: 'Maria Santos',
      serviceType: 'Deep Clean',
      detail: 'Detail',
      bookingId: 'BK-20931',
      technician: 'Jomari Cruz',
      date: '07-02-26',
      time: '10:00 AM',
      status: 'partially_paid',
      hasAttachment: true,
      attachmentUrl: null,
      amount: '₱1,500.00',
    },
    {
      id: 'PAY-1043',
      clientName: 'Ronald Uy',
      serviceType: 'AC Repair',
      detail: 'Detail',
      bookingId: 'BK-20944',
      technician: 'Ella Reyes',
      date: '07-03-26',
      time: '01:30 PM',
      status: 'to_verify',
      hasAttachment: true,
      attachmentUrl: null,
      amount: '₱2,800.00',
    },
    {
      id: 'PAY-1044',
      clientName: 'Carla Dizon',
      serviceType: 'Plumbing',
      detail: 'Detail',
      bookingId: 'BK-20958',
      technician: 'Marco Villar',
      date: '07-04-26',
      time: '09:15 AM',
      status: 'fully_paid',
      hasAttachment: false,
      attachmentUrl: null,
      amount: '₱950.00',
    },
  ];

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
  function ReviewRequestModal({ payment, onClose }) {
    if (!payment) return null;

    const handleApprove = () => {
      // TODO: connect to Express backend to mark payment as verified.
      console.log('Approved', payment.id);
      onClose();
    };

    const handleReject = () => {
      // TODO: connect to Express backend to mark payment as rejected.
      console.log('Rejected', payment.id);
      onClose();
    };

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-card payment-review-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header" style={{ marginBottom: '4px' }}>
            <h4 className="modal-title">Review Payment Request</h4>
            <button className="modal-close-btn" onClick={onClose}>
              <CloseIcon />
            </button>
          </div>

          <p className="payment-review-booking" style={{ margin: '2px 0 16px', color: '#6b7280', fontSize: '14px' }}>
            {payment.serviceType} · {payment.bookingId}
          </p>

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
                <img
                  src={payment.attachmentUrl}
                  alt="Payment proof"
                  className="payment-review-attachment-img"
                  style={{ width: '100%', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                />
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
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>proof_of_payment_{payment.bookingId}.jpg</span>
                  <span className="payment-review-attachment-hint" style={{ fontSize: '12px' }}>
                    Preview unavailable — file will render here once uploads are wired up.
                  </span>
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
            <button type="button" className="cancel-booking-btn" onClick={handleReject}>
              Reject
            </button>
            <button type="button" className="bs-next-btn" onClick={handleApprove}>
              Approve
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

    const filteredPayments = useMemo(() => {
      return MOCK_PAYMENTS.filter((payment) => {
        const matchesFilter = activeFilter === 'all' || payment.status === activeFilter;
        const query = search.trim().toLowerCase();
        const matchesSearch =
          !query ||
          payment.clientName.toLowerCase().includes(query) ||
          payment.bookingId.toLowerCase().includes(query);
        return matchesFilter && matchesSearch;
      });
    }, [activeFilter, search]);

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

        {selectedPayment && (
          <ReviewRequestModal
            payment={selectedPayment}
            onClose={() => setSelectedPayment(null)}
          />
        )}
      </AdminLayout>
    );
  }

  export default Payments;
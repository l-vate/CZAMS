import { useMemo, useState } from 'react';
import AdminLayout from './admin_layout';
import '../../css/admin.css';

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
        {payment.hasAttachment ? (
          <a href={`#attachment-${payment.id}`} className="payment-card__link">
            Attached file
          </a>
        ) : (
          <span className="payment-card__link payment-card__link--muted">No file</span>
        )}
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
    // TODO: open the review request modal / navigate to the review flow.
    console.log('Review request for', payment.id);
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
    </AdminLayout>
  );
}

export default Payments;
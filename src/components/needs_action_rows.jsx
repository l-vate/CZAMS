import { Link } from 'react-router-dom';
import { FiChevronRight } from 'react-icons/fi';
import { URGENCY_META, formatBookedDate, formatWaiting } from '../utils/needsAttention';

// The rows of "Needs action", shared by the admin's notifications tab and the dashboard panel. Each row is one link to the screen where it is dealt
// with. They only read and link: nothing here changes a booking, a payment or a refund.

// a small marker only for Today and Soon; a booking that is just waiting gets none
function UrgencyMarker({ urgency }) {
  if (urgency !== 'today' && urgency !== 'soon') return null;
  return <span className={`nr-urgency nr-urgency--${urgency}`}>{URGENCY_META[urgency].short}</span>;
}

function BookingRow({ row }) {
  return (
    <Link to={row.link} className="nr-row" aria-label={`${row.title}, booking ${row.bookingId}${row.customerName ? `, ${row.customerName}` : ''}`}>
      <span className="nr-main">
        <span className="nr-line">
          <span className="nr-title">{row.title}</span>
          <UrgencyMarker urgency={row.urgency} />
        </span>
        <span className="nr-who"><span className="nr-booking">{row.bookingId}</span>{row.customerName ? ` · ${row.customerName}` : ''}</span>
        {row.tags.length > 0 && (
          <span className="nr-tags">{row.tags.map((tag) => <span className="nr-tag" key={tag}>{tag}</span>)}</span>
        )}
        <span className="nr-muted">Booked {formatBookedDate(row.date)} {'·'} Waiting {formatWaiting(row.waitingMinutes)}</span>
      </span>
      <FiChevronRight className="nr-chevron" aria-hidden="true" />
    </Link>
  );
}

function RollupRow({ row }) {
  return (
    <Link to={row.link} className="nr-row nr-row--rollup">
      <span className="nr-main"><span className="nr-title">{row.text}</span></span>
      <FiChevronRight className="nr-chevron" aria-hidden="true" />
    </Link>
  );
}

export function NeedsActionRows({ rows }) {
  return (
    <ul className="nr-list">
      {rows.map((row) => (
        <li className="nr-item" key={row.id}>
          {row.type === 'rollup' ? <RollupRow row={row} /> : <BookingRow row={row} />}
        </li>
      ))}
    </ul>
  );
}

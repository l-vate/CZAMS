import { Link } from 'react-router-dom';
import { FiAlertCircle, FiClock, FiCircle, FiCheckCircle, FiArrowRight } from 'react-icons/fi';
import { useNeedsAttention, isAdminUser } from '../hooks/useNeedsAttention';
import {
  GROUP_KEYS, GROUP_TITLES, URGENCY_META, formatWaiting, formatBookedDate, summaryText, isAllCaughtUp,
} from '../utils/needsAttention';

// "Needs attention": the top of the admin dashboard. Three groups of what the admin has to act on (Today, Needs a decision, Money), the top
// five of each with a count in its header, and one button per row that opens the screen where it is dealt with. It only reads and links:
// nothing here changes a booking, a payment or a refund.
const URGENCY_ICON = { today: FiAlertCircle, soon: FiClock, waiting: FiCircle };

function UrgencyBadge({ urgency }) {
  const meta = URGENCY_META[urgency] || URGENCY_META.waiting;
  const Icon = URGENCY_ICON[urgency] || FiCircle;
  // an icon and a word, so the urgency is never colour alone
  return (
    <span className={`na-urgency na-urgency--${urgency}`}>
      <Icon aria-hidden="true" /> {meta.text}
    </span>
  );
}

function Row({ item }) {
  return (
    <li className="na-row">
      <div className="na-row-main">
        <p className="na-row-label">{item.label}</p>
        <p className="na-row-meta">
          <span className="na-booking">{item.bookingId}</span>
          <span>{item.customerName}</span>
          <span>Booked: {formatBookedDate(item.date)}</span>
          <span>Waiting: {formatWaiting(item.waitingMinutes)}</span>
        </p>
      </div>
      <div className="na-row-side">
        <UrgencyBadge urgency={item.urgency} />
        <Link to={item.link} className="na-open" aria-label={`Open ${item.label}, booking ${item.bookingId}`}>
          Open <FiArrowRight aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}

function Group({ group, groupKey }) {
  const titleId = `na-group-${groupKey}`;
  return (
    <section className="na-group" aria-labelledby={titleId}>
      <h3 id={titleId} className="na-group-title">
        {GROUP_TITLES[groupKey]}
        <span className="na-count" aria-label={`${group.count} items`}>{group.count}</span>
      </h3>
      {group.items.length === 0 ? (
        <p className="na-group-empty">Nothing here.</p>
      ) : (
        <ul className="na-list">
          {group.items.map((item) => <Row key={item.id} item={item} />)}
        </ul>
      )}
      {group.count > 0 && (
        <Link to={group.viewAll} className="na-viewall">
          {group.count > group.items.length ? `View all (${group.count})` : 'View all'} <FiArrowRight aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="na-groups" aria-hidden="true">
      {GROUP_KEYS.map((key) => (
        <div className="na-group na-skeleton" key={key}>
          <div className="na-skel na-skel--title" />
          {[0, 1, 2].map((i) => <div className="na-skel na-skel--row" key={i} />)}
        </div>
      ))}
    </div>
  );
}

// The presentation on its own (props in, markup out), so it can be shown in every state without asking the server.
export function NeedsAttentionView({ status, data, onRetry }) {
  return (
    <section className="na-panel" aria-labelledby="na-title" aria-busy={status === 'loading'}>
      <header className="na-header">
        <h2 id="na-title" className="na-title">Needs attention</h2>
        <p className="na-sub">What to act on today, in one place.</p>
      </header>
      {/* heard by a screen reader whenever a count changes, without moving focus */}
      <p className="na-live" role="status" aria-live="polite">{status === 'ready' ? summaryText(data) : ''}</p>

      {(status === 'idle' || status === 'loading') && !data && <Skeleton />}

      {status === 'error' && !data && (
        <div className="na-error" role="alert">
          <p>Could not load what needs your attention.</p>
          <button type="button" className="na-retry" onClick={onRetry}>Try again</button>
        </div>
      )}

      {data && isAllCaughtUp(data) && (
        <div className="na-caught-up">
          <FiCheckCircle aria-hidden="true" />
          <div>
            <p className="na-caught-up-title">All caught up</p>
            <p className="na-caught-up-text">Nothing needs your attention right now.</p>
          </div>
        </div>
      )}

      {data && !isAllCaughtUp(data) && (
        <div className="na-groups">
          {GROUP_KEYS.map((key) => <Group key={key} groupKey={key} group={data.groups[key]} />)}
        </div>
      )}
    </section>
  );
}

// The panel for the dashboard. Only an admin sees it: for anyone else it draws nothing and asks the server for nothing.
function NeedsAttentionPanel() {
  const { status, data, retry } = useNeedsAttention();
  if (!isAdminUser()) return null;
  return <NeedsAttentionView status={status} data={data} onRetry={retry} />;
}

export default NeedsAttentionPanel;

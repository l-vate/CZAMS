import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { getAvailability } from '../services/availabilityService';
import { toLocalDateKey } from '../utils/date';
import { AVAILABILITY, BOOKING_LEAD_DAYS } from '../config/landingContent';
import { blocksText, closedDayText, dayLook } from '../utils/availabilityText';

const MONTHS_AHEAD = 3;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// What each status from GET /api/availability/public means (server/utils/availability.js):
//   open / limited / full  a normal shop day, with both blocks, one block or no block left; a block that is not open says why
//                          (utils/availabilityText.js): "No technicians available" or "Fully booked"
//   closed                 a Sunday (the shop is closed on Sundays)
//   shop-closed            a date the admin closed, with a reason (a holiday, for example)
//   too-soon / past        a date that cannot be booked: it is earlier than the lead time, or already gone
const STATUS_LABEL = {
  open: 'Available',
  limited: 'Limited',
  full: 'Fully booked',
  'no-technicians': 'No technicians available',
  closed: 'Closed on Sundays',
  'shop-closed': 'Closed by the shop',
  'too-soon': 'Not available (under the notice period)',
  past: 'Not available (past)',
};

// What a day says to a visitor: on hover, on keyboard focus, in its accessible label, and in the detail under the calendar.
function messageOf(day) {
  if (!day || day.status === 'past') return 'Not available (past)';
  if (day.status === 'closed' || day.status === 'shop-closed') return closedDayText(day);
  if (day.status === 'too-soon') return `${STATUS_LABEL['too-soon']}. Bookings need at least ${BOOKING_LEAD_DAYS} days notice`;
  return day.morning !== undefined ? blocksText(day) : STATUS_LABEL[day.status];
}

const monthStart = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const monthEnd = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

// Public calendar of dates that can still be booked. It shows only whether the Morning and
// Afternoon blocks are open, never who is assigned.
function AvailabilityCalendar() {
  const navigate = useNavigate();

  const [month, setMonth] = useState(monthStart(new Date()));
  const [days, setDays] = useState({});
  const [status, setStatus] = useState('loading');
  const [selected, setSelected] = useState(null);
  const [attempt, setAttempt] = useState(0); // bumped by "Try again" to load the month once more

  const firstMonth = monthStart(new Date());
  const lastMonth = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + MONTHS_AHEAD, 1);
  const monthLabel = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const selectedDay = selected ? days[selected] : null;

  // Monday-first grid: blank cells before the 1st, then each day of the month.
  const leadingBlanks = (month.getDay() + 6) % 7;
  const dayKeys = Array.from({ length: monthEnd(month).getDate() }, (_, i) =>
    toLocalDateKey(new Date(month.getFullYear(), month.getMonth(), i + 1))
  );

  useEffect(() => {
    let cancelled = false;
    getAvailability(toLocalDateKey(month), toLocalDateKey(monthEnd(month)))
      .then((list) => {
        if (cancelled) return;
        if (!Array.isArray(list)) throw new Error('Unexpected availability reply');
        setDays(Object.fromEntries(list.map((d) => [d.date, d])));
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => { cancelled = true; };
  }, [month, attempt]);

  const changeMonth = (offset) => {
    setStatus('loading');
    setSelected(null);
    setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1));
  };

  const retry = () => {
    setStatus('loading');
    setAttempt((n) => n + 1);
  };

  return (
    <div className="avail">
      <div className="avail-header">
        <button type="button" className="avail-nav" onClick={() => changeMonth(-1)} disabled={month <= firstMonth} aria-label="Previous month">
          <FiChevronLeft />
        </button>
        <h3 className="avail-month">{monthLabel}</h3>
        <button type="button" className="avail-nav" onClick={() => changeMonth(1)} disabled={month >= lastMonth} aria-label="Next month">
          <FiChevronRight />
        </button>
      </div>

      {status === 'error' ? (
        <div className="avail-error" role="alert">
          <strong>{AVAILABILITY.errorTitle}</strong>
          <p>{AVAILABILITY.errorText}</p>
          <button type="button" className="lp-btn lp-btn--primary" onClick={retry}>{AVAILABILITY.retry}</button>
        </div>
      ) : (
        <div className="avail-grid" role="group" aria-label={`Availability for ${monthLabel}`} aria-busy={status === 'loading'}>
          {WEEKDAYS.map((w) => <span className="avail-weekday" key={w}>{w}</span>)}
          {Array.from({ length: leadingBlanks }, (_, i) => <span key={`blank-${i}`} />)}
          {dayKeys.map((key, i) => {
            const day = days[key];
            const look = status === 'ready' ? dayLook(day || { status: 'past' }) : 'loading';
            const message = status === 'ready' ? messageOf(day) : '';
            const column = (leadingBlanks + i) % 7;
            const edge = column <= 1 ? ' avail-cell--left' : column >= 5 ? ' avail-cell--right' : '';
            const showTip = status === 'ready' && day && day.status !== 'open' && day.status !== 'past';
            return (
              <span className={`avail-cell${edge}`} key={key}>
                <button
                  type="button"
                  className={`avail-day avail-day--${look}${selected === key ? ' avail-day--selected' : ''}`}
                  onClick={() => setSelected(key)}
                  disabled={status !== 'ready'}
                  aria-label={`${Number(key.slice(8))} ${monthLabel}: ${status === 'ready' ? message : 'loading'}`}
                >
                  {Number(key.slice(8))}
                </button>
                {showTip && <span className="avail-tip" aria-hidden="true">{message}</span>}
              </span>
            );
          })}
        </div>
      )}

      <ul className="avail-legend">
        {AVAILABILITY.legend.map((item) => (
          <li key={item.status}><span className={`avail-swatch avail-day--${item.status}`} />{item.label}</li>
        ))}
      </ul>

      {status === 'ready' && selectedDay && (
        <div className="avail-detail">
          <strong>{new Date(`${selected}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</strong>
          <p>{messageOf(selectedDay)}{selectedDay.morning === undefined ? '.' : ''}</p>
          {(selectedDay.status === 'open' || selectedDay.status === 'limited') && (
            <button type="button" className="lp-btn lp-btn--primary" onClick={() => navigate('/login')}>Log In to Book</button>
          )}
        </div>
      )}
    </div>
  );
}

export default AvailabilityCalendar;

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { getAvailability } from '../services/availabilityService';
import { toLocalDateKey } from '../utils/date';

const MONTHS_AHEAD = 3;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATUS_LABEL = {
  open: 'Available',
  limited: 'Limited',
  full: 'Fully booked',
  closed: 'Closed',
  'shop-closed': 'Shop closed',
'too-soon': 'Too soon to book',
  past: 'Past',
};

const LEGEND = ['open', 'limited', 'full', 'closed', 'shop-closed'];

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
        setDays(Object.fromEntries(list.map((d) => [d.date, d])));
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => { cancelled = true; };
  }, [month]);

  const changeMonth = (offset) => {
    setStatus('loading');
    setSelected(null);
    setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1));
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

      {status === 'error' && <p className="avail-message">Availability could not be loaded right now. Please try again later.</p>}

      <div className="avail-grid" role="grid" aria-label={`Availability for ${monthLabel}`}>
        {WEEKDAYS.map((w) => <span className="avail-weekday" key={w}>{w}</span>)}
        {Array.from({ length: leadingBlanks }, (_, i) => <span key={`blank-${i}`} />)}
        {dayKeys.map((key) => {
          const dayStatus = days[key]?.status || 'past';
          const look = status === 'ready' ? dayStatus : 'loading';
          return (
            <button
              type="button"
              key={key}
              className={`avail-day avail-day--${look}${selected === key ? ' avail-day--selected' : ''}`}
              onClick={() => setSelected(key)}
              disabled={status !== 'ready'}
              aria-label={`${key}: ${STATUS_LABEL[dayStatus]}${days[key]?.reason ? `, ${days[key].reason}` : ''}`}
            >
              {Number(key.slice(8))}
            </button>
          );
        })}
      </div>

      <ul className="avail-legend">
        {LEGEND.map((s) => (
          <li key={s}><span className={`avail-swatch avail-day--${s}`} />{STATUS_LABEL[s]}</li>
        ))}
      </ul>

      {selectedDay && (
        <div className="avail-detail">
          <strong>{new Date(`${selected}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</strong>
          {selectedDay.morning !== undefined ? (
            <p>
              Morning: {selectedDay.morning ? 'Available' : 'Fully booked'} · Afternoon: {selectedDay.afternoon ? 'Available' : 'Fully booked'}
            </p>
          ) : (
            <p>
              {STATUS_LABEL[selectedDay.status]}.
              {selectedDay.status === 'too-soon' ? ' Bookings need at least 3 days notice.' : ''}
              {selectedDay.status === 'shop-closed' ? ` ${selectedDay.reason}` : ''}
            </p>
          )}
          {(selectedDay.status === 'open' || selectedDay.status === 'limited') && (
            <button type="button" className="cta" onClick={() => navigate('/login')}>Log In to Book</button>
          )}
        </div>
      )}
    </div>
  );
}

export default AvailabilityCalendar;

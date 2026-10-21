import { useEffect, useMemo, useRef, useState } from 'react';
import { listClosures } from '../services/closureService';
import { formatClosureDate } from '../utils/closureDates';
import { isSundayKey, firstOpenDay, SUNDAY_CLOSED } from '../utils/businessDays';
import { manilaTodayKey } from '../utils/manilaTime';

// A date picker that does not let a closed day be clicked: a Sunday (while Sundays are closed, utils/businessDays.js), a date the admin
// closed, and anything before `min` are greyed out and disabled. The calendar is drawn here because a browser date input cannot disable
// single days. With showEarliest it also says the earliest open day (the first day from `min` that is not closed).
// The closed dates coming up are listed underneath so the choice is clear before picking.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

function ClosureDateInput({ value, onChange, min, className = 'bs-input', id, showEarliest = false }) {
  const [closures, setClosures] = useState([]);
  const [open, setOpen] = useState(false);
  const today = manilaTodayKey();
  const startKey = value || min || today;
  const [view, setView] = useState(() => ({ year: Number(startKey.slice(0, 4)), month: Number(startKey.slice(5, 7)) - 1 }));
  const wrapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    listClosures()
      .then((list) => { if (!cancelled) setClosures(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setClosures([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    // eslint-disable-next-line no-restricted-syntax -- outside click: removed in this effect's cleanup
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const closedKeys = useMemo(() => new Set(closures.map((c) => c.date)), [closures]);
  const reasonOf = useMemo(() => new Map(closures.map((c) => [c.date, c.reason])), [closures]);
  const earliest = firstOpenDay(min || today, closedKeys);

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(view.year, view.month, 1)).getUTCDay();
    const days = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate();
    return [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  }, [view]);

  // why a day cannot be picked, or null when it can
  const problemOf = (key) => {
    if (key < today) return 'Past';
    if (min && key < min) return 'Too soon to book';
    if (SUNDAY_CLOSED && isSundayKey(key)) return 'Closed on Sundays';
    if (closedKeys.has(key)) return `Closed: ${reasonOf.get(key)}`;
    return null;
  };

  const shift = (delta) => setView((v) => {
    const total = v.year * 12 + v.month + delta;
    return { year: Math.floor(total / 12), month: total % 12 };
  });

  const pick = (key) => {
    if (problemOf(key)) return;
    onChange(key);
    setOpen(false);
  };

  return (
    <div className="date-picker" ref={wrapRef}>
      <button
        type="button"
        id={id}
        className={`${className} date-picker-trigger`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {value ? formatClosureDate(value) : 'Select a date'}
      </button>
      {open && (
        <div className="date-picker-pop" role="dialog" aria-label="Choose a date">
          <div className="date-picker-head">
            <button type="button" className="date-picker-nav" aria-label="Previous month" onClick={() => shift(-1)}>&lsaquo;</button>
            <strong>{MONTHS[view.month]} {view.year}</strong>
            <button type="button" className="date-picker-nav" aria-label="Next month" onClick={() => shift(1)}>&rsaquo;</button>
          </div>
          <div className="date-picker-grid">
            {WEEKDAYS.map((d) => <span key={d} className="date-picker-weekday">{d}</span>)}
            {cells.map((day, i) => {
              if (day === null) return <span key={`blank-${i}`} />;
              const key = keyOf(view.year, view.month, day);
              const problem = problemOf(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={`date-picker-day${key === value ? ' date-picker-day--selected' : ''}${problem ? ' date-picker-day--closed' : ''}`}
                  disabled={Boolean(problem)}
                  title={problem || undefined}
                  onClick={() => pick(key)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {showEarliest && (
        <p className="closure-upcoming">Earliest available date is {formatClosureDate(earliest)}.</p>
      )}
      {closures.length > 0 && (
        <p className="closure-upcoming">
          Closed: {closures.slice(0, 4).map((c) => `${formatClosureDate(c.date)} (${c.reason})`).join(', ')}
          {closures.length > 4 ? `, and ${closures.length - 4} more` : ''}
        </p>
      )}
    </div>
  );
}

export default ClosureDateInput;

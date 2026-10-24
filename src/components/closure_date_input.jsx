import { useEffect, useMemo, useRef, useState } from 'react';
import { listClosures } from '../services/closureService';
import { getAvailability } from '../services/availabilityService';
import { formatClosureDate } from '../utils/closureDates';
import { closedWords, takenDayText, isNoTechniciansDay } from '../utils/availabilityText';
import { isSundayKey, firstOpenDay, SUNDAY_CLOSED } from '../utils/businessDays';
import { manilaTodayKey } from '../utils/manilaTime';

// A date picker that does not let a closed day be clicked: a Sunday (while Sundays are closed, utils/businessDays.js), a date the admin
// closed, and anything before `min` are greyed out and disabled. The calendar is drawn here because a browser date input cannot disable
// single days. With showEarliest it also says the earliest open day (the first day from `min` that is not closed).
// The closed dates coming up are listed underneath so the choice is clear before picking, unless showClosedList is false (the customer
// pages: a customer is never shown a list of closed dates; the reason of one date is on that date, see below).
// A day that cannot be picked is not a disabled button: it stays focusable (aria-disabled) and says why, in a message above the day on hover
// and keyboard focus, in its accessible label, and in a note under the calendar when it is tapped ("Closed: Holiday", "Closed: Sunday",
// "Fully booked", "No technicians available"). The title attribute is not relied on.
// With blockFull (the customer pages) a day with no free pair of technicians in either block is not pickable either, read from the public
// availability calendar for the month on screen; if that cannot be loaded the day stays pickable and the server still refuses it.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

function ClosureDateInput({ value, onChange, min, className = 'bs-input', id, showEarliest = false, blockFull = false, showClosedList = true }) {
  const [closures, setClosures] = useState([]);
  const [fullDays, setFullDays] = useState(() => new Map()); // date key -> the public availability answer of a day with no block left
  const [note, setNote] = useState(''); // what a tapped day that cannot be picked says
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

  // the days of the month on screen that are fully booked; months already read are kept
  useEffect(() => {
    if (!blockFull || !open) return undefined;
    let cancelled = false;
    const from = keyOf(view.year, view.month, 1);
    const to = keyOf(view.year, view.month, new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate());
    getAvailability(from, to)
      .then((days) => {
        if (cancelled || !Array.isArray(days)) return;
        setFullDays((prev) => new Map([...prev, ...days.filter((d) => d.status === 'full').map((d) => [d.date, d])]));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [blockFull, open, view]);

  const closedKeys = useMemo(() => new Set(closures.map((c) => c.date)), [closures]);
  const reasonOf = useMemo(() => new Map(closures.map((c) => [c.date, c.reason])), [closures]);
  const earliest = firstOpenDay(min || today, closedKeys);

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(view.year, view.month, 1)).getUTCDay();
    const days = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate();
    return [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  }, [view]);

  // why a day cannot be picked, or null when it can: { text, kind } (kind decides the look: 'no-technicians' is neutral, not red)
  const problemOf = (key) => {
    if (key < today) return { text: 'Past', kind: 'past' };
    if (min && key < min) return { text: 'Too soon to book', kind: 'past' };
    if (SUNDAY_CLOSED && isSundayKey(key)) return { text: closedWords('Sunday'), kind: 'closed' };
    if (closedKeys.has(key)) return { text: closedWords(reasonOf.get(key)), kind: 'closed' };
    if (fullDays.has(key)) {
      const day = fullDays.get(key);
      return { text: takenDayText(day), kind: isNoTechniciansDay(day) ? 'no-technicians' : 'full' };
    }
    return null;
  };

  const shift = (delta) => { setNote(''); setView((v) => {
    const total = v.year * 12 + v.month + delta;
    return { year: Math.floor(total / 12), month: total % 12 };
  }); };

  const pick = (key) => {
    const problem = problemOf(key);
    if (problem) { setNote(problem.text); return; } // a tap on a day that cannot be picked says why
    setNote('');
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
        onClick={() => { setNote(''); setOpen((o) => !o); }}
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
              const column = i % 7;
              const edge = column <= 1 ? ' date-picker-cell--left' : column >= 5 ? ' date-picker-cell--right' : '';
              const label = `${day} ${MONTHS[view.month]} ${view.year}: ${problem ? problem.text : 'Available'}`;
              return (
                <span className={`date-picker-cell${edge}`} key={key}>
                  <button
                    type="button"
                    className={`date-picker-day${key === value ? ' date-picker-day--selected' : ''}${problem ? ` date-picker-day--closed date-picker-day--${problem.kind}` : ''}`}
                    aria-disabled={problem ? 'true' : undefined}
                    aria-label={label}
                    onClick={() => pick(key)}
                  >
                    {day}
                  </button>
                  {problem && problem.kind !== 'past' && <span className="date-picker-tip" aria-hidden="true">{problem.text}</span>}
                </span>
              );
            })}
          </div>
          {note && <p className="date-picker-note" role="status">{note}</p>}
        </div>
      )}
      {showEarliest && (
        <p className="closure-upcoming">Earliest available date is {formatClosureDate(earliest)}.</p>
      )}
      {showClosedList && closures.length > 0 && (
        <p className="closure-upcoming">
          Closed: {closures.slice(0, 4).map((c) => `${formatClosureDate(c.date)} (${c.reason})`).join(', ')}
          {closures.length > 4 ? `, and ${closures.length - 4} more` : ''}
        </p>
      )}
    </div>
  );
}

export default ClosureDateInput;

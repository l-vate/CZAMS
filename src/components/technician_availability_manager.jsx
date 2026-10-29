import { useEffect, useMemo, useState } from 'react';
import { listTechnicianOff, setTechnicianOff, clearTechnicianOff } from '../services/technicianOffService';
import { listTechniciansForBooking } from '../services/authService';
import { attempt } from '../services/apiClient';
import { formatClosureDate } from '../utils/closureDates';
import { pluralize } from '../utils/pluralize';
import { manilaTodayKey } from '../utils/manilaTime';
import { capitalizeReason, splitUpcoming, groupByDate, limitGroups, leaveSummary, SHORT_LIST } from '../utils/calendarPanels';
import CollapsiblePanel from './collapsible_panel';
import { usePanelOpen } from '../hooks/usePanelOpen';

const REASON_MAX = 200;
const WHOLE_DAY = ['Morning', 'Afternoon'];
const WHEN_CHOICES = [
  { key: 'day', label: 'Whole day', blocks: WHOLE_DAY },
  { key: 'morning', label: 'Morning only', blocks: ['Morning'] },
  { key: 'afternoon', label: 'Afternoon only', blocks: ['Afternoon'] },
];

const blocksLabel = (blocks) => (blocks.length === 2 ? 'Whole day' : `${blocks[0]} only`);

function DayEntries({ day, list, onClear }) {
  return (
    <li className="closure-item tech-off-day">
      <strong>{formatClosureDate(day)}</strong>
      <ul className="tech-off-entries">
        {list.map((entry) => (
          <li key={entry._id}>
            <span className="tech-off-entry-text">
              {entry.technicianName} <span className="closure-days">({blocksLabel(entry.blocks)})</span>
              {entry.reason && <span className="closure-reason">{capitalizeReason(entry.reason)}</span>}
            </span>
            <button type="button" className="cal-action-btn" onClick={() => onClear(entry._id)}>Available again</button>
          </li>
        ))}
      </ul>
    </li>
  );
}

// Admin panel: dates technicians are not available (leave, a day off, training). A technician marked off counts as busy for that date and
// block everywhere: the public calendar and the date pickers (a day with nobody left shows Fully booked), booking checks, the assignment
// panel and auto-assign. Marking someone off never cancels or moves a booking; the panel says which bookings they already have.
function TechnicianAvailabilityManager() {
  const [technicians, setTechnicians] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [date, setDate] = useState('');
  const [when, setWhen] = useState('day');
  const [picked, setPicked] = useState([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = usePanelOpen('technician-leave');
  const [showPast, setShowPast] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const loadEntries = async () => {
    try {
      setEntries(await listTechnicianOff());
      setLoadError('');
    } catch {
      setLoadError('Could not load the days off. Please refresh the page.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([listTechniciansForBooking(), listTechnicianOff()])
      .then(([techs, list]) => {
        if (cancelled) return;
        setTechnicians(Array.isArray(techs) ? techs : []);
        setEntries(Array.isArray(list) ? list : []);
      })
      .catch(() => { if (!cancelled) setLoadError('Could not load the technicians or their days off. Please refresh the page.'); });
    return () => { cancelled = true; };
  }, []);

  const togglePicked = (id) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Only today and later by default, sorted by date; earlier entries sit behind a toggle. One heading per date.
  const { upcomingGroups, pastGroups, upcomingCount } = useMemo(() => {
    const { upcoming, past } = splitUpcoming(entries, manilaTodayKey());
    return { upcomingGroups: groupByDate(upcoming), pastGroups: groupByDate(past), upcomingCount: upcoming.length };
  }, [entries]);
  const shownGroups = showAll ? upcomingGroups : limitGroups(upcomingGroups, SHORT_LIST);
  const shownCount = shownGroups.reduce((n, g) => n + g[1].length, 0);

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setWarning('');
    if (!date) { setError('Choose a date.'); return; }
    if (picked.length === 0) { setError('Choose at least one technician.'); return; }
    const blocks = WHEN_CHOICES.find((c) => c.key === when).blocks;
    setSaving(true);
    try {
      const saved = await attempt(
        setTechnicianOff({ technicians: picked, date, blocks, reason: reason.trim() }),
        'Failed to save.',
      );
      if (saved.error) { setError(saved.error); return; }
      const inTheWay = saved.data?.bookingsInTheWay || [];
      if (inTheWay.length > 0) {
        setWarning(`${inTheWay.map((b) => b.bookingId).join(', ')} ${pluralize(inTheWay.length, 'booking')} already ${inTheWay.length === 1 ? 'has' : 'have'} a marked technician at that time. Nothing was cancelled or moved: reassign ${inTheWay.length === 1 ? 'it' : 'them'} from the booking page.`);
      }
      setPicked([]);
      setReason('');
      setDate('');
      setOpen(true); // show the new entry
      await loadEntries();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async (id) => {
    setError('');
    try {
      const removed = await attempt(clearTechnicianOff(id), 'Failed to update.');
      if (removed.error) setError(removed.error);
    } catch {
      setError('Network error. Please try again.');
    }
    await loadEntries();
  };

  return (
    <section className="closure-manager">
      <h3 className="closure-manager-title">Technician Availability</h3>
      <p className="closure-manager-sub">
        Mark technicians who are not available on a date. They are left out of the schedule for that date, so customers only see the days when enough technicians are free. Bookings already on the date are left as they are.
      </p>

      <form className="closure-manager-form" onSubmit={handleSave}>
        <input
          type="date"
          className="ma-input"
          aria-label="Date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <select className="ma-input" aria-label="Which part of the day" value={when} onChange={(e) => setWhen(e.target.value)}>
          {WHEN_CHOICES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <input
          type="text"
          className="ma-input"
          aria-label="Reason (optional)"
          placeholder="Reason (optional), e.g. Leave"
          maxLength={REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </form>

      <fieldset className="tech-off-picker">
        <legend>Not available</legend>
        {technicians.length === 0 ? (
          <span className="closure-empty">No technicians found.</span>
        ) : technicians.map((t) => (
          <label key={t._id} className={`tech-off-chip${picked.includes(t._id) ? ' tech-off-chip--on' : ''}`}>
            <input type="checkbox" checked={picked.includes(t._id)} onChange={() => togglePicked(t._id)} />
            {t.name}
          </label>
        ))}
      </fieldset>
      <button type="button" className="ma-submit-btn" disabled={saving} onClick={handleSave}>
        {saving ? 'Saving...' : 'Mark as not available'}
      </button>

      {error && <p className="ma-form-error">{error}</p>}
      {warning && <p className="closure-warning" role="status">{warning}</p>}
      {loadError && <p className="ma-form-error">{loadError}</p>}

      <CollapsiblePanel id="tech-leave-list" summary={leaveSummary(upcomingCount)} open={open} onToggle={setOpen}>
        {upcomingGroups.length === 0 && !loadError ? (
          <p className="closure-empty">No upcoming days off. Every technician is available.</p>
        ) : (
          <ul className="closure-list">
            {shownGroups.map(([day, list]) => <DayEntries key={day} day={day} list={list} onClear={handleClear} />)}
          </ul>
        )}
        {!showAll && shownCount < upcomingCount && (
          <button type="button" className="cal-action-btn cal-more-btn" onClick={() => setShowAll(true)}>Show all ({upcomingCount})</button>
        )}
        {pastGroups.length > 0 && (
          <>
            <button type="button" className="cal-action-btn cal-more-btn" aria-expanded={showPast} onClick={() => setShowPast((v) => !v)}>
              {showPast ? 'Hide past entries' : 'Show past entries'}
            </button>
            {showPast && (
              <ul className="closure-list cal-past-list" aria-label="Past entries">
                {pastGroups.map(([day, list]) => <DayEntries key={day} day={day} list={list} onClear={handleClear} />)}
              </ul>
            )}
          </>
        )}
      </CollapsiblePanel>
    </section>
  );
}

export default TechnicianAvailabilityManager;

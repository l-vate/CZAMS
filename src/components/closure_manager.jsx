import { useEffect, useState } from 'react';
import { listClosures, addClosure, deleteClosure } from '../services/closureService';
import { attempt } from '../services/apiClient';
import { formatClosureDate, formatClosureRange, groupClosures, affectedBookingsNote } from '../utils/closureDates';
import { REASON_MIN, REASON_MAX } from '../constants/closures';
import { pluralize } from '../utils/pluralize';
import { manilaTodayKey } from '../utils/manilaTime';
import { capitalizeReason, splitUpcoming, closureSummary, SHORT_LIST } from '../utils/calendarPanels';
import CollapsiblePanel from './collapsible_panel';
import { usePanelOpen } from '../hooks/usePanelOpen';
import { closureDateProblem, closureWindow } from '../utils/dateRules';

const MAX_RANGE_DAYS = 31;

// Every date key from `start` to `end` inclusive, worked out in UTC so the timezone never matters.
function dateRange(start, end) {
  const keys = [];
  const [y, m, d] = start.split('-').map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  while (cursor.toISOString().slice(0, 10) <= end && keys.length <= MAX_RANGE_DAYS) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

// Admin panel: dates the shop is closed. Closing a date never cancels or moves a booking; the
// panel only warns how many Pending or Approved bookings are already on it. Choosing a start
// and an end date closes every day in between with the same reason.
function ClosureManager() {
  const [closures, setClosures] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = usePanelOpen('closed-dates');
  const [showPast, setShowPast] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = async () => {
    try {
      setClosures(await listClosures());
      setLoadError('');
    } catch {
      setLoadError('Could not load the closed dates. Please refresh the page.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    listClosures()
      .then((list) => { if (!cancelled) setClosures(list); })
      .catch(() => { if (!cancelled) setLoadError('Could not load the closed dates. Please refresh the page.'); });
    return () => { cancelled = true; };
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    setWarning('');
    const text = reason.trim();
    if (!date) { setError('Choose a date.'); return; }
    const firstProblem = closureDateProblem(date);
    if (firstProblem) { setError(firstProblem); return; }
    const lastProblem = endDate ? closureDateProblem(endDate) : null;
    if (lastProblem) { setError(lastProblem); return; }
    if (text.length < REASON_MIN || text.length > REASON_MAX) {
      setError(`Give a reason of ${REASON_MIN} to ${REASON_MAX} characters.`);
      return;
    }
    if (endDate && endDate < date) { setError('The last date cannot be before the first date.'); return; }

    const wanted = dateRange(date, endDate || date);
    if (wanted.length > MAX_RANGE_DAYS) { setError(`Close at most ${MAX_RANGE_DAYS} days at a time.`); return; }
    const alreadyClosed = new Set(closures.map((c) => c.date));
    const toClose = wanted.filter((d) => !alreadyClosed.has(d));
    if (toClose.length === 0) { setError(wanted.length === 1 ? 'That date is already closed.' : 'Those dates are already closed.'); return; }

    setSaving(true);
    try {
      let affected = 0;
      const failed = [];
      for (const day of toClose) {
        const saved = await attempt(addClosure({ date: day, reason: text }), 'Failed to close the date.');
        if (saved.error) failed.push(`${formatClosureDate(day)}: ${saved.error}`);
        else affected += saved.data.affectedBookings || 0;
      }
      if (failed.length > 0) setError(`Could not close ${failed.length} ${pluralize(failed.length, 'date')}. ${failed.join(' ')}`);
      if (failed.length < toClose.length) {
        setWarning(affectedBookingsNote(affected, toClose.length > 1));
        setDate('');
        setEndDate('');
        setReason('');
        setOpen(true); // show the new closure
      }
      await load();
    } catch {
      setError('Network error. Please try again.');
      await load();
    } finally {
      setSaving(false);
    }
  };

  // Opens one or more dates again (a whole group, or a single day inside one).
  const handleDelete = async (closureDates) => {
    setError('');
    setWarning('');
    try {
      for (const day of closureDates) {
        const removed = await attempt(deleteClosure(day), 'Failed to open the date.');
        if (removed.error) { setError(removed.error); break; }
      }
    } catch {
      setError('Network error. Please try again.');
    }
    await load();
  };

  // A range is upcoming while its last day is today or later; earlier ranges sit behind a toggle.
  const { upcoming: upcomingGroups, past: pastGroups } = splitUpcoming(groupClosures(closures), manilaTodayKey(), 'end');
  const shownGroups = showAll ? upcomingGroups : upcomingGroups.slice(0, SHORT_LIST);

  const renderGroup = (g) => (
    <li key={g.start} className="closure-item">
      <div className="closure-item-text">
        <strong>{formatClosureRange(g.start, g.end)}</strong>
        {g.days.length > 1 && <span className="closure-days"> ({g.days.length} days)</span>}
        <span className="closure-reason">{capitalizeReason(g.reason)}</span>
        {g.affectedBookings > 0 && (
          <span className="closure-warning">{affectedBookingsNote(g.affectedBookings, g.days.length > 1)}</span>
        )}
        {g.days.length > 1 && (
          <details className="closure-days-detail">
            <summary className="cal-action-btn">Open single days</summary>
            <ul className="closure-day-list">
              {g.days.map((c) => (
                <li key={c.date}>
                  <span>{formatClosureDate(c.date)}</span>
                  <button type="button" className="cal-action-btn" onClick={() => handleDelete([c.date])}>
                    Open
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <button type="button" className="cal-action-btn" onClick={() => handleDelete(g.days.map((c) => c.date))}>
        {g.days.length > 1 ? 'Open all again' : 'Open again'}
      </button>
    </li>
  );

  return (
    <section className="closure-manager">
      <h3 className="closure-manager-title">Closed Dates</h3>
      <p className="closure-manager-sub">
        Customers cannot book or reschedule onto a closed date. Bookings already on the date are left as they are. To close several days at once, also choose a last date.
      </p>

      <form className="closure-manager-form" onSubmit={handleAdd}>
        <input
          type="date"
          className="ma-input"
          aria-label="Closed date"
          min={closureWindow().min}
          max={closureWindow().max}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <input
          type="date"
          className="ma-input"
          aria-label="Last closed date (optional, to close several days)"
          title="Last date (optional, to close several days)"
          min={date || closureWindow().min}
          max={closureWindow().max}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
        <input
          type="text"
          className="ma-input"
          aria-label="Reason"
          placeholder="Reason, e.g. Holiday"
          maxLength={REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button type="submit" className="ma-submit-btn" disabled={saving}>
          {saving ? 'Saving...' : endDate && endDate !== date ? 'Close these dates' : 'Close this date'}
        </button>
      </form>

      {error && <p className="ma-form-error">{error}</p>}
      {warning && <p className="closure-warning" role="status">{warning}</p>}
      {loadError && <p className="ma-form-error">{loadError}</p>}

      <CollapsiblePanel id="closed-dates-list" summary={closureSummary(upcomingGroups)} open={open} onToggle={setOpen}>
        {upcomingGroups.length === 0 && !loadError ? (
          <p className="closure-empty">No upcoming closed dates.</p>
        ) : (
          <ul className="closure-list">{shownGroups.map(renderGroup)}</ul>
        )}
        {!showAll && upcomingGroups.length > SHORT_LIST && (
          <button type="button" className="cal-action-btn cal-more-btn" onClick={() => setShowAll(true)}>Show all ({upcomingGroups.length})</button>
        )}
        {pastGroups.length > 0 && (
          <>
            <button type="button" className="cal-action-btn cal-more-btn" aria-expanded={showPast} onClick={() => setShowPast((v) => !v)}>
              {showPast ? 'Hide past entries' : 'Show past entries'}
            </button>
            {showPast && <ul className="closure-list cal-past-list" aria-label="Past entries">{pastGroups.map(renderGroup)}</ul>}
          </>
        )}
      </CollapsiblePanel>
    </section>
  );
}

export default ClosureManager;

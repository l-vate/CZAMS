import { TIME_BLOCK_VALUES } from '../constants/timeBlocks';

// Dates when enough technicians are free, offered after a refusal ("nobody is free then"). One click moves the booking to
// that date, in the same time block, through the normal approval, so the customer and the technicians are told.
function SuggestedDates({ dates, time, onUse, disabled }) {
  if (!Array.isArray(dates) || dates.length === 0) return null;
  const block = TIME_BLOCK_VALUES.includes(time) ? time : TIME_BLOCK_VALUES[0];
  return (
    <div className="suggested-dates" role="group" aria-label="Dates when enough technicians are free">
      <p className="queue-meta">Enough technicians are free on:</p>
      {dates.map((date) => (
        <button key={date} type="button" className="view-details-btn" disabled={disabled} onClick={() => onUse(date, block)}>
          Use {new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, {block}
        </button>
      ))}
    </div>
  );
}

export default SuggestedDates;

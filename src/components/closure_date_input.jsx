import { useEffect, useState } from 'react';
import { listClosures } from '../services/closureService';
import { formatClosureDate } from '../utils/closureDates';

// A date input that refuses the days the shop is closed. A browser date picker cannot grey out
// single days, so a closed day is cleared as soon as it is picked and the reason is shown.
// The closed dates coming up are listed underneath so the choice is clear before picking.
function ClosureDateInput({ value, onChange, min, className = 'bs-input', id }) {
  const [closures, setClosures] = useState([]);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    listClosures()
      .then((list) => { if (!cancelled) setClosures(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setClosures([]); });
    return () => { cancelled = true; };
  }, []);

  const handleChange = (e) => {
    const picked = e.target.value;
    const closed = closures.find((c) => c.date === picked);
    if (closed) {
      setNotice(`The shop is closed on ${formatClosureDate(closed.date)}: ${closed.reason}`);
      onChange('');
      return;
    }
    setNotice('');
    onChange(picked);
  };

  return (
    <>
      <input id={id} type="date" className={className} min={min} value={value || ''} onChange={handleChange} />
      {notice && <p className="closure-notice" role="alert">{notice}</p>}
      {closures.length > 0 && (
        <p className="closure-upcoming">
          Closed: {closures.slice(0, 4).map((c) => `${formatClosureDate(c.date)} (${c.reason})`).join(', ')}
          {closures.length > 4 ? `, and ${closures.length - 4} more` : ''}
        </p>
      )}
    </>
  );
}

export default ClosureDateInput;

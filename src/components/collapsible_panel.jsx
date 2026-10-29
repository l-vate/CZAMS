import { useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { readPanelOpen, writePanelOpen } from '../utils/calendarPanels';

// The open or closed state of one panel, remembered for the browser session. Closed unless the session says otherwise.
export function usePanelOpen(key) {
  const [open, setOpenState] = useState(() => (typeof window === 'undefined' ? null : readPanelOpen(key)) ?? false);
  const setOpen = (value) => {
    setOpenState(value);
    writePanelOpen(key, value);
  };
  return [open, setOpen];
}

// A header button with a short summary that stays readable when collapsed, and the content it shows and hides.
function CollapsiblePanel({ id, summary, open, onToggle, children }) {
  return (
    <div className="cal-panel">
      <button
        type="button"
        className="cal-panel-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => onToggle(!open)}
      >
        <span className="cal-panel-summary">{summary}</span>
        <FiChevronDown className="cal-panel-chevron" aria-hidden="true" />
      </button>
      <div id={id} className="cal-panel-body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

export default CollapsiblePanel;

import { FiChevronDown } from 'react-icons/fi';

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

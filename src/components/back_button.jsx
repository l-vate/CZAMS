import { FiArrowLeft } from 'react-icons/fi';

// The one "Back to ..." button of the app. Above 768 px it shows the arrow and the words; on a phone only the arrow, in a 44 by 44 px button, and
// the words stay for screen readers (they are the button's accessible name) and as a tooltip. `label` is the full text, for example "Back to Bookings".
function BackButton({ label, onClick, className = '' }) {
  return (
    <button type="button" className={`back-btn ${className}`.trim()} onClick={onClick} title={label}>
      <FiArrowLeft aria-hidden="true" />
      <span className="back-btn-text">{label}</span>
    </button>
  );
}

export default BackButton;

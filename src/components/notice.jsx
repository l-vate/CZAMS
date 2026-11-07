import { useEffect } from 'react';

// A short message that appears over the page and goes away by itself, for what used to be a browser alert():
// "Could not submit the payment", "Your profile was saved". useNotice() (hooks/useNotice.js) holds the message, <Notice>
// shows it. It sits at the top of the screen, never over a dialog's buttons, goes away after about 5 seconds, and is announced to screen
// readers through a live region that is always on the page (a region that appears together with its text is often not read out).
const AUTO_CLOSE_MS = 5000;
const ACTION_CLOSE_MS = 10000; // a message with a button stays a little longer, so there is time to press it

// `action` ({ label, onClick }) adds one button to the message, for example "Open".
function Notice({ message, onClose, action }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(onClose, action ? ACTION_CLOSE_MS : AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [message, onClose, action]);

  return (
    <div className="notice-region" role="status" aria-live="polite" aria-atomic="true">
      {message && (
        <div className="notice-toast">
          <span>{message}</span>
          {action && <button type="button" className="notice-toast-action" onClick={() => { action.onClick(); onClose(); }}>{action.label}</button>}
          <button type="button" className="notice-toast-close" onClick={onClose} aria-label="Close message">&times;</button>
        </div>
      )}
    </div>
  );
}

export default Notice;

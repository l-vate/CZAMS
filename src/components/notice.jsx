import { useEffect } from 'react';

// A short message that appears over the page and goes away by itself, for what used to be a browser alert():
// "Could not submit the payment", "Your profile was saved". useNotice() (hooks/useNotice.js) holds the message, <Notice>
// shows it. It sits at the top of the screen, never over a dialog's buttons, goes away after about 5 seconds, and is announced to screen
// readers through a live region that is always on the page (a region that appears together with its text is often not read out).
const AUTO_CLOSE_MS = 5000;

function Notice({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  return (
    <div className="notice-region" role="status" aria-live="polite" aria-atomic="true">
      {message && (
        <div className="notice-toast">
          <span>{message}</span>
          <button type="button" className="notice-toast-close" onClick={onClose} aria-label="Close message">&times;</button>
        </div>
      )}
    </div>
  );
}

export default Notice;

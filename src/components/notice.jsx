import { useEffect } from 'react';

// A short message that appears over the page and goes away by itself, for what used to be a browser alert():
// "Could not submit the payment", "Your profile was saved". useNotice() (hooks/useNotice.js) holds the message, <Notice>
// shows it. The message is announced to screen readers (role="alert") and can be closed.
const AUTO_CLOSE_MS = 8000;

function Notice({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;
  return (
    <div className="notice-toast" role="alert">
      <span>{message}</span>
      <button type="button" className="notice-toast-close" onClick={onClose} aria-label="Close message">x</button>
    </div>
  );
}

export default Notice;

import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FiLogOut } from 'react-icons/fi';

// The Log Out control at the bottom of every role's menu (the desktop sidebar and the phone drawer are the same one). It asks first, in the
// shared modal: ModalManager holds the page still and keeps Tab inside, Cancel has the focus, Escape or a tap outside closes it, and the
// focus goes back to this button. `onLogout` signs out and moves on (each role's own clean up). An automatic sign out (an expired or
// deactivated session) never comes through here, so it shows no question.
function LogoutDialog({ onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  useEffect(() => {
    cancelRef.current?.focus({ preventScroll: true });
  }, []);

  return createPortal(
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-card cancel-confirm-card logout-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-dialog-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }}
      >
        <h4 id="logout-dialog-title" className="modal-title cancel-confirm-title">Log out of CZAMS?</h4>
        <p className="cancel-confirm-text">You will need to sign in again to use your account.</p>
        <div className="cancel-confirm-actions logout-dialog-actions">
          <button type="button" ref={cancelRef} className="bs-back-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="bs-next-btn" onClick={onConfirm}>Log out</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function LogoutButton({ onLogout }) {
  const [asking, setAsking] = useState(false);
  const openerRef = useRef(null);

  const close = () => {
    setAsking(false);
    // some browsers do not focus a button when it is tapped, so the focus is given back here as well
    requestAnimationFrame(() => openerRef.current?.focus({ preventScroll: true }));
  };

  return (
    <div className="sidebar-logout">
      <button type="button" ref={openerRef} className="sidebar-link" onClick={() => setAsking(true)}>
        <FiLogOut aria-hidden="true" /> Log Out
      </button>
      {asking && <LogoutDialog onCancel={close} onConfirm={() => { setAsking(false); onLogout(); }} />}
    </div>
  );
}

export default LogoutButton;

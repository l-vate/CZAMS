import { useState } from 'react';
import { FiX } from 'react-icons/fi';
import { ApiError } from '../services/apiClient';
import { requestPasswordChangeEmail } from '../services/authService';

// Change-password dialog shared by the customer and technician profiles. It emails the signed-in
// user a one-time link to their own address; the new password is chosen on the reset page.
function ChangePasswordModal({ onClose }) {
  const [error, setError] = useState('');
  const [sentMessage, setSentMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await requestPasswordChangeEmail();
      setSentMessage(result?.message || 'We sent a link to your email.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message || 'Failed to send the email' : 'Could not connect to server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4 className="modal-title">Change Password</h4>
          <button className="modal-close-btn" onClick={onClose}>
            <FiX />
          </button>
        </div>

        {sentMessage ? (
          <div className="auth-form">
            <p role="status">{sentMessage}</p>
            <div className="cancel-confirm-actions">
              <button type="button" className="bs-next-btn" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <p>
              We will email you a link to choose a new password. The link works once and expires in 30 minutes.
            </p>

            {error && <p className="customer-profile-x1">{error}</p>}

            <div className="cancel-confirm-actions">
              <button type="button" className="bs-back-btn" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="bs-next-btn" disabled={submitting}>
                {submitting ? 'Sending...' : 'Send Link'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default ChangePasswordModal;

import { useState } from 'react';
import { FiX } from 'react-icons/fi';
import { ApiError } from '../services/apiClient';
import { changePassword } from '../services/authService';

// Change-password dialog shared by the customer and technician profiles. It asks for the
// current password and checks it on the server, so it works for any signed-in role.
function ChangePasswordModal({ onClose, onChanged }) {
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (form.newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const result = await changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      // Changing the password signs out every other device. This one stays signed in with the fresh token.
      if (result?.token) {
        try {
          localStorage.setItem('token', result.token);
        } catch {
          // storage unavailable: the next request will ask for a login
        }
      }
      onChanged?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message || 'Failed to update password' : 'Could not connect to server.');
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

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="currentPassword">Current Password</label>
            <input
              type="password"
              id="currentPassword"
              name="currentPassword"
              value={form.currentPassword}
              onChange={handleChange}
              placeholder="Enter current password"
            />
          </div>

          <div className="form-group">
            <label htmlFor="newPassword">New Password</label>
            <input
              type="password"
              id="newPassword"
              name="newPassword"
              value={form.newPassword}
              onChange={handleChange}
              placeholder="Min. 8 characters"
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm New Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder="Re-enter new password"
            />
          </div>

          {error && <p className="customer-profile-x1">{error}</p>}

          <div className="cancel-confirm-actions">
            <button type="button" className="bs-back-btn" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="bs-next-btn" disabled={submitting}>
              {submitting ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ChangePasswordModal;

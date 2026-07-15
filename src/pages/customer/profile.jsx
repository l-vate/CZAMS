import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerLayout from './customer_layout';
import { FiUser, FiX, FiCamera } from 'react-icons/fi';

/* ── Change Password Modal ─────────────────────────────── */
function ChangePasswordModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = (e) => {
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
    // TODO: connect to Express backend
    onSubmit(form);
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

          {error && <p style={{ color: '#ef4444', fontSize: '13px', margin: '4px 0' }}>{error}</p>}

          <div className="cancel-confirm-actions">
            <button type="button" className="bs-back-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="bs-next-btn">
              Update Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Delete Account Confirm Dialog ─────────────────────── */
function DeleteAccountDialog({ onKeep, onConfirmDelete }) {
  return (
    <div className="modal-overlay" onClick={onKeep}>
      <div className="modal-card cancel-confirm-card" onClick={(e) => e.stopPropagation()}>
        <h4 className="modal-title cancel-confirm-title">Delete your account?</h4>
        <p className="cancel-confirm-text">
          This action can't be undone. All your bookings, billing history, and
          personal information will be permanently removed.
        </p>
        <div className="cancel-confirm-actions">
          <button className="bs-back-btn" onClick={onKeep}>
            Keep account
          </button>
          <button className="cancel-booking-btn" onClick={onConfirmDelete}>
            Yes, delete it
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Profile ────────────────────────────────────────────── */
function Profile() {
  const navigate = useNavigate();

  const [user, setUser] = useState({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@email.com',
    phone: '+63 912 345 6789',
    address: 'Dasmariñas, Cavite',
    memberSince: 'January 2026',
    photo: null,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(user);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleEditClick = () => {
    setEditForm(user);
    setIsEditing(true);
  };

  const handleEditChange = (e) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setEditForm((prev) => ({ ...prev, photo: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = () => {
    // TODO: connect to Express backend
    setUser(editForm);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handlePasswordSubmit = (form) => {
    // TODO: connect to Express backend
    console.log('Password change submitted:', form);
    setShowChangePassword(false);
  };

  const handleConfirmDelete = () => {
    // TODO: connect to Express backend to actually delete the account
    setShowDeleteConfirm(false);
    navigate('/register');
  };

  return (
    <CustomerLayout title="My Profile">
      <div className="profile-page">

        {/* Profile Header */}
        <div className="profile-card">
          <div className="profile-header">
            {isEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div className="profile-avatar">
                  {editForm.photo ? (
                    <img
                      src={editForm.photo}
                      alt="Profile preview"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                    />
                  ) : (
                    <FiUser />
                  )}
                </div>
                <label
                  className="profile-photo-upload-btn"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'var(--cz-primary, #2563eb)',
                    border: '1px solid var(--cz-primary, #2563eb)',
                    borderRadius: '999px',
                    padding: '6px 14px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <FiCamera size={14} />
                  {editForm.photo ? 'Change Photo' : 'Upload Photo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            ) : (
              <div className="profile-avatar">
                {user.photo ? (
                  <img
                    src={user.photo}
                    alt="Profile"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                  />
                ) : (
                  <FiUser />
                )}
              </div>
            )}

            <div className="profile-info">
              <h2>
                {user.firstName} {user.lastName}
              </h2>
              <p>{user.email}</p>
              <span>Member since {user.memberSince}</span>
            </div>

            {!isEditing && (
              <button className="edit-profile-btn" onClick={handleEditClick}>
                Edit Profile
              </button>
            )}
          </div>
        </div>

        {/* Personal Information */}
        <div className="profile-card">
          <h3 className="section-title">Personal Information</h3>

          {isEditing ? (
            <>
              <div className="profile-grid">
                <div className="profile-field">
                  <label htmlFor="firstName">First Name</label>
                  <input
                    type="text"
                    id="firstName"
                    name="firstName"
                    className="bs-input"
                    value={editForm.firstName}
                    onChange={handleEditChange}
                  />
                </div>

                <div className="profile-field">
                  <label htmlFor="lastName">Last Name</label>
                  <input
                    type="text"
                    id="lastName"
                    name="lastName"
                    className="bs-input"
                    value={editForm.lastName}
                    onChange={handleEditChange}
                  />
                </div>

                <div className="profile-field">
                  <label htmlFor="email">Email Address</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    className="bs-input"
                    value={editForm.email}
                    onChange={handleEditChange}
                  />
                </div>

                <div className="profile-field">
                  <label htmlFor="phone">Phone Number</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    className="bs-input"
                    value={editForm.phone}
                    onChange={handleEditChange}
                  />
                </div>

                <div className="profile-field full-width">
                  <label htmlFor="address">Address</label>
                  <input
                    type="text"
                    id="address"
                    name="address"
                    className="bs-input"
                    value={editForm.address}
                    onChange={handleEditChange}
                  />
                </div>
              </div>

              <div className="account-actions" style={{ marginTop: '16px' }}>
                <button className="bs-back-btn" onClick={handleCancelEdit}>
                  Cancel
                </button>
                <button className="bs-next-btn" onClick={handleSaveProfile}>
                  Save Changes
                </button>
              </div>
            </>
          ) : (
            <div className="profile-grid">
              <div className="profile-field">
                <label>First Name</label>
                <div>{user.firstName}</div>
              </div>

              <div className="profile-field">
                <label>Last Name</label>
                <div>{user.lastName}</div>
              </div>

              <div className="profile-field">
                <label>Email Address</label>
                <div>{user.email}</div>
              </div>

              <div className="profile-field">
                <label>Phone Number</label>
                <div>{user.phone}</div>
              </div>

              <div className="profile-field full-width">
                <label>Address</label>
                <div>{user.address}</div>
              </div>
            </div>
          )}
        </div>

        {/* Account Settings */}
        <div className="profile-card">
          <h3 className="section-title">Account Settings</h3>

          <div className="account-actions">
            <button
              className="change-password-btn"
              onClick={() => setShowChangePassword(true)}
            >
              Change Password
            </button>

            <button
              className="delete-account-btn"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete Account
            </button>
          </div>
        </div>

      </div>

      {showChangePassword && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          onSubmit={handlePasswordSubmit}
        />
      )}

      {showDeleteConfirm && (
        <DeleteAccountDialog
          onKeep={() => setShowDeleteConfirm(false)}
          onConfirmDelete={handleConfirmDelete}
        />
      )}
    </CustomerLayout>
  );
}

export default Profile;
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerLayout from './customer_layout';
import { FiUser, FiX, FiCamera } from 'react-icons/fi';

/* ── Change Password Modal ─────────────────────────────── */
function ChangePasswordModal({ onClose, onSubmit, submitting, serverError }) {
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

          {(error || serverError) && (
            <p style={{ color: '#ef4444', fontSize: '13px', margin: '4px 0' }}>{error || serverError}</p>
          )}

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

/* ── Delete Account Confirm Dialog ─────────────────────── */
function DeleteAccountDialog({ onKeep, onConfirmDelete, deleting }) {
  return (
    <div className="modal-overlay" onClick={onKeep}>
      <div className="modal-card cancel-confirm-card" onClick={(e) => e.stopPropagation()}>
        <h4 className="modal-title cancel-confirm-title">Delete your account?</h4>
        <p className="cancel-confirm-text">
          This action can't be undone. All your bookings, billing history, and
          personal information will be permanently removed.
        </p>
        <div className="cancel-confirm-actions">
          <button className="bs-back-btn" onClick={onKeep} disabled={deleting}>
            Keep account
          </button>
          <button className="cancel-booking-btn" onClick={onConfirmDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Yes, delete it'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Profile ────────────────────────────────────────────── */
function Profile() {
  const navigate = useNavigate();

  function loadUserFromStorage() {
  const stored = localStorage.getItem('user');
  if (!stored) {
    return { firstName: '', lastName: '', email: '', phone: '', address: '', memberSince: '', photo: null };
  }
  const parsed = JSON.parse(stored);
  const nameParts = (parsed.name || '').split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  return {
    firstName,
    lastName,
    email: parsed.email || '',
    phone: parsed.phone || '',
    address: parsed.address || '',
    memberSince: parsed.createdAt
      ? new Date(parsed.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : '',
    photo: parsed.profileImage || null,
  };
}

const [user, setUser] = useState(loadUserFromStorage);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(user);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleEditClick = () => {
    setEditForm(user);
    setIsEditing(true);
  };

  const handleEditChange = (e) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  };

  const handlePhotoChange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // instant local preview
  const reader = new FileReader();
  reader.onload = () => {
    setEditForm((prev) => ({ ...prev, photo: reader.result }));
  };
  reader.readAsDataURL(file);

  // upload to backend
  try {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('photo', file);

    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/profile/photo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || 'Failed to upload photo');
      return;
    }

    localStorage.setItem('user', JSON.stringify(data.user));
    setEditForm((prev) => ({ ...prev, photo: `${import.meta.env.VITE_API_URL}${data.user.profileImage}` }));
  } catch (err) {
    alert('Could not connect to server for photo upload.');
  }
};


  const handleSaveProfile = async () => {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        email: editForm.email,
        phone: editForm.phone,
        address: editForm.address,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || 'Failed to update profile');
      return;
    }

    localStorage.setItem('user', JSON.stringify(data.user));

    const nameParts = (data.user.name || '').split(' ');
    setUser({
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      email: data.user.email || '',
      phone: data.user.phone || '',
      address: data.user.address || '',
      memberSince: data.user.createdAt
        ? new Date(data.user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : '',
      photo: data.user.profileImage || null,
    });

    setIsEditing(false);
  } catch (err) {
    alert('Could not connect to server. Is the backend running?');
  }
};

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handlePasswordSubmit = async (form) => {
    setPasswordSubmitting(true);
    setPasswordError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/change-password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setPasswordError(data.message || 'Failed to update password');
        setPasswordSubmitting(false);
        return;
      }

      setShowChangePassword(false);
    } catch (err) {
      setPasswordError('Could not connect to server.');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/account`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.message || 'Failed to delete account');
        setDeleting(false);
        return;
      }

      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setShowDeleteConfirm(false);
      navigate('/register');
    } catch (err) {
      alert('Could not connect to server.');
      setDeleting(false);
    }
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
                    src={user.photo.startsWith('data:') ? user.photo : `${import.meta.env.VITE_API_URL}${user.photo}`}
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
          submitting={passwordSubmitting}
          serverError={passwordError}
        />
      )}

      {showDeleteConfirm && (
        <DeleteAccountDialog
          onKeep={() => setShowDeleteConfirm(false)}
          onConfirmDelete={handleConfirmDelete}
          deleting={deleting}
        />
      )}
    </CustomerLayout>
  );
}

export default Profile;
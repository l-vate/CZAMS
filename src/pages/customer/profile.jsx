import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerLayout from './customer_layout';
import { FiUser, FiCamera, FiEdit2, FiMail, FiCalendar, FiPhone, FiMapPin, FiLock, FiTrash2 } from 'react-icons/fi';
import { API_BASE } from '../../config/api';
import { ApiError } from '../../services/apiClient';
import CustomerHistory from '../../components/customer_history';
import ChangePasswordModal from '../../components/change_password_modal';
import { uploadProfilePhoto, updateProfile, deleteAccount } from '../../services/authService';

import Notice from '../../components/notice';
import { useNotice } from '../../hooks/useNotice';
/* ── Delete Account Confirm Dialog ─────────────────────── */
function DeleteAccountDialog({ onKeep, onConfirmDelete, deleting }) {
  return (
    <div className="modal-overlay" onClick={onKeep}>
      <div className="modal-card cancel-confirm-card" onClick={(e) => e.stopPropagation()}>
        <h4 className="modal-title cancel-confirm-title">Delete your account?</h4>
        <p className="cancel-confirm-text">
          This action can't be undone. Your account and personal details are removed and you will be signed out. Your
          past bookings, invoices and service reports stay as company records. If you still have an active booking, an
          unsettled refund or a claim waiting for review, those must be finished first.
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
  const { notice, showNotice, clearNotice } = useNotice();

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
    const data = await uploadProfilePhoto(file);

    localStorage.setItem('user', JSON.stringify(data.user));
    setEditForm((prev) => ({ ...prev, photo: `${API_BASE}${data.user.profileImage}` }));
  } catch (err) {
    showNotice(err instanceof ApiError ? err.message || 'Failed to upload photo' : 'Could not connect to server for photo upload.');
  }
};


  const handleSaveProfile = async () => {
  try {
    const data = await updateProfile({
      firstName: editForm.firstName,
      lastName: editForm.lastName,
      email: editForm.email,
      phone: editForm.phone,
      address: editForm.address,
    });

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
    showNotice(err instanceof ApiError ? err.message || 'Failed to update profile' : 'Could not connect to server. Is the backend running?');
  }
};

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();

      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setShowDeleteConfirm(false);
      navigate('/register');
    } catch (err) {
      showNotice(err instanceof ApiError ? err.message || 'Failed to delete account' : 'Could not connect to server.');
      setDeleting(false);
    }
  };

  return (
    <CustomerLayout title="My Profile">
      <Notice message={notice} onClose={clearNotice} />
      <div className="profile-page">

        {/* Profile Header - same layout/classes as the technician portal's
            profile card (staff/profile.jsx): avatar-lg + name/contact stacked,
            small icon edit button in the corner, instead of this page's old
            separate row layout with a full-width text edit button. Same info
            as before (name, email, member-since), just restyled to match. */}
        <div className="profile-card">
          {isEditing ? (
            <div className="customer-profile-x2">
              <div className="profile-avatar-lg">
                {editForm.photo ? (
                  <img
                    src={editForm.photo}
                    alt="Profile preview"
                  />
                ) : (
                  <FiUser />
                )}
              </div>
              <label
                className="profile-photo-upload-btn customer-profile-x3"
              >
                <FiCamera size={14} />
                {editForm.photo ? 'Change Photo' : 'Upload Photo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoChange}
                  className="customer-profile-x4"
                />
              </label>
            </div>
          ) : (
            <div className="profile-avatar-lg">
              {user.photo ? (
                <img
                  src={user.photo.startsWith('data:') ? user.photo : `${API_BASE}${user.photo}`}
                  alt="Profile"
                />
              ) : (
                <FiUser />
              )}
            </div>
          )}

          <div>
            <h2 className="profile-name">{user.firstName} {user.lastName}</h2>
            <div className="profile-contact">
              <span className="profile-contact-line"><FiMail size={13} /> {user.email}</span>
              <span className="profile-contact-line"><FiCalendar size={13} /> Member since {user.memberSince}</span>
            </div>
          </div>

          {!isEditing && (
            <button className="profile-edit-btn" type="button" onClick={handleEditClick}>
              <FiEdit2 />
            </button>
          )}
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

              <div className="account-actions customer-profile-x5">
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
                <label><FiUser size={12} /> First Name</label>
                <div>{user.firstName}</div>
              </div>

              <div className="profile-field">
                <label><FiUser size={12} /> Last Name</label>
                <div>{user.lastName}</div>
              </div>

              <div className="profile-field">
                <label><FiMail size={12} /> Email Address</label>
                <div>{user.email}</div>
              </div>

              <div className="profile-field">
                <label><FiPhone size={12} /> Phone Number</label>
                <div>{user.phone}</div>
              </div>

              <div className="profile-field full-width">
                <label><FiMapPin size={12} /> Address</label>
                <div>{user.address}</div>
              </div>
            </div>
          )}
        </div>

        {/* Booking history summary */}
        <div className="profile-card">
          <h3 className="section-title">My Booking History</h3>
          <CustomerHistory />
        </div>

        {/* Account Settings */}
        <div className="profile-card">
          <h3 className="section-title">Account Settings</h3>

          <div className="account-actions">
            <button
              className="change-password-btn"
              onClick={() => setShowChangePassword(true)}
            >
              <FiLock size={14} /> Change Password
            </button>

            <button
              className="delete-account-btn"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <FiTrash2 size={14} /> Delete Account
            </button>
          </div>
        </div>

      </div>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
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
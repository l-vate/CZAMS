import { useState, useEffect } from 'react';
import StaffLayout from './staff_layout';
import {
  FiUser,
  FiEdit2,
  FiStar,
  FiCheckCircle,
  FiFileText,
  FiMail,
  FiPhone,
  FiCamera,
  FiLock,
} from 'react-icons/fi';
import { API_BASE } from '../../config/api';
import { withFallback } from '../../services/apiClient';
import { uploadProfilePhoto, updateProfile } from '../../services/authService';
import { getTechnicianStats } from '../../services/bookingService';
import ChangePasswordModal from '../../components/change_password_modal';


function buildProfileFromUser(user) {
  return {
    name: user?.name || 'Technician',
    companyId: user?.id || '',
    email: user?.email || '',
    phone: user?.phone || '',
    photo: user?.profileImage ? `${API_BASE}${user.profileImage}` : null,
  };
}

function Profile() {
  const storedUser = JSON.parse(localStorage.getItem('user'));

  const [profile, setProfile] = useState(buildProfileFromUser(storedUser));
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(profile);
  const [photoFile, setPhotoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // The performance numbers come from the server. Until they load, or if loading fails, a dash
  // is shown, never a made-up number.
  const [stats, setStats] = useState(null);
  const [statsFailed, setStatsFailed] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);

  const fetchStats = () => {
    getTechnicianStats()
      .then((data) => {
        if (typeof data?.completed !== 'number') throw new Error('Unexpected stats reply');
        setStats(data);
      })
      .catch((err) => {
        console.error('Failed to load stats', err);
        setStatsFailed(true);
      });
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const retryStats = () => {
    setStatsFailed(false);
    fetchStats();
  };

  const statsOk = !!stats && !statsFailed;
  const ratingText = !statsOk ? '-' : stats.averageRating === null ? 'No ratings yet' : `${stats.averageRating} / 5`;

  const handleEditClick = () => {
    setEditForm(profile);
    setPhotoFile(null);
    setSaveError('');
    setIsEditing(true);
  };

  const handleEditChange = (e) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setEditForm((prev) => ({ ...prev, photo: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      let latestUser = JSON.parse(localStorage.getItem('user'));

      if (photoFile) {
        const photoData = await uploadProfilePhoto(photoFile).catch(withFallback('Photo upload failed'));
        latestUser = photoData.user;
      }

      const [firstName, ...rest] = editForm.name.trim().split(' ');
      const lastName = rest.join(' ');

      const infoData = await updateProfile({
        firstName,
        lastName,
        email: editForm.email,
        phone: editForm.phone,
      }).catch(withFallback('Update failed'));

      latestUser = infoData.user;

      localStorage.setItem('user', JSON.stringify(latestUser));
      setProfile(buildProfileFromUser(latestUser));
      setIsEditing(false);
    } catch (err) {
      setSaveError(err.message || 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setSaveError('');
    setIsEditing(false);
  };

  return (
    <StaffLayout title="Profile">
      <div className="profile-card">
        {isEditing ? (
          <div className="staff-profile-x1">
            <div className="profile-avatar-lg">
              {editForm.photo ? (
                <img
                  src={editForm.photo}
                  alt="Profile preview"
                  className="staff-profile-x2"
                />
              ) : (
                <FiUser />
              )}
            </div>
            <label
              className="profile-photo-upload-btn staff-profile-x3"
            >
              <FiCamera size={14} />
              {editForm.photo ? 'Change Photo' : 'Upload Photo'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoChange}
                className="staff-profile-x4"
              />
            </label>
          </div>
        ) : (
          <div className="profile-avatar-lg">
            {profile.photo ? (
              <img
                src={profile.photo}
                alt="Profile"
                className="staff-profile-x2"
              />
            ) : (
              <FiUser />
            )}
          </div>
        )}

        {isEditing ? (
          <div className="tech-profile-edit-form">
            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <input
                type="text"
                id="name"
                name="name"
                className="bs-input"
                value={editForm.name}
                onChange={handleEditChange}
              />
            </div>

            <div className="form-group">
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

            <div className="form-group">
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

            {saveError && (
              <p className="auth-error staff-profile-x5">
                {saveError}
              </p>
            )}

            <div className="cancel-confirm-actions">
              <button type="button" className="bs-back-btn" onClick={handleCancel} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="bs-next-btn" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h2 className="profile-name">{profile.name}</h2>
            <p className="profile-id">{profile.companyId}</p>
            <div className="profile-contact">
              <span className="profile-contact-line"><FiMail size={13} /> {profile.email}</span>
              <span className="profile-contact-line"><FiPhone size={13} /> {profile.phone}</span>
            </div>
          </div>
        )}

        {!isEditing && (
          <button className="profile-edit-btn" type="button" onClick={handleEditClick}>
            <FiEdit2 />
          </button>
        )}
      </div>

      <h2 className="section-title">Account Settings</h2>
      <div className="profile-card">
        <div className="account-actions">
          <button
            type="button"
            className="change-password-btn"
            onClick={() => { setPasswordChanged(false); setShowChangePassword(true); }}
          >
            <FiLock size={14} /> Change Password
          </button>
        </div>
        {passwordChanged && <p className="sdm-muted">Your password was updated.</p>}
      </div>

      <h2 className="section-title">Performance</h2>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">
            <FiStar className="staff-profile-x6" />
            Average Client Rating
          </div>
          <div className="stat-value">{ratingText}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            <FiCheckCircle className="staff-profile-x6" />
            Completed Jobs
          </div>
          <div className="stat-value">{statsOk ? stats.completed : '-'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            <FiFileText className="staff-profile-x6" />
            Pending Reports
          </div>
          <div className="stat-value">{statsOk ? stats.pendingReports : '-'}</div>
        </div>
      </div>
      {statsFailed && (
        <p className="sdm-muted" role="alert">
          Could not load your numbers. <button type="button" className="tech-job-view-link" onClick={retryStats}>Try again</button>
        </p>
      )}

      {showChangePassword && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          onChanged={() => setPasswordChanged(true)}
        />
      )}
    </StaffLayout>
  );
}

export default Profile;
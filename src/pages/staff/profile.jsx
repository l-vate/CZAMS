import { useState } from 'react';
import StaffLayout from './staff_layout';
import {
  FiUser,
  FiEdit2,
  FiStar,
  FiAlertTriangle,
  FiFileText,
  FiClock,
  FiMapPin,
  FiX,
} from 'react-icons/fi';
import '../../css/staff.css';

const scheduledJobs = [
  {
    date: '07-09-26',
    time: '9:00 AM – 11:00 AM',
    bookingId: 'CZ-2026-7402',
    service: 'AIRCON REPAIR',
    address: 'Tagum City',
    customerName: 'Pedro Santos',
  },
  {
    date: '07-11-26',
    time: '1:00 PM – 2:30 PM',
    bookingId: 'CZ-2026-7410',
    service: 'AIRCON CLEANING',
    address: 'Dasmariñas, Cavite',
    customerName: 'Ana Lopez',
  },
  {
    date: '07-13-26',
    time: '10:00 AM – 11:00 AM',
    bookingId: 'CZ-2026-7415',
    service: 'NEW INSTALLATION',
    address: 'Bacoor City',
    customerName: 'Mark Villanueva',
  },
];

/* ── Scheduled Job Details Modal ───────────────────────── */
function ScheduledJobModal({ job, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card tech-job-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4 className="modal-title">Scheduled Job</h4>
          <button className="modal-close-btn" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <p className="tech-job-detail-booking">
          {job.service} · {job.bookingId}
        </p>

        <div className="tech-job-detail-grid">
          <div className="tech-job-detail-cell">
            <span className="confirmation-detail-icon"><FiClock /></span>
            <div>
              <p className="confirmation-detail-label">Date &amp; Time</p>
              <p className="confirmation-detail-value">{job.date}, {job.time}</p>
            </div>
          </div>

          <div className="tech-job-detail-cell">
            <span className="confirmation-detail-icon"><FiMapPin /></span>
            <div>
              <p className="confirmation-detail-label">Address</p>
              <p className="confirmation-detail-value">{job.address}</p>
            </div>
          </div>

          <div className="tech-job-detail-cell tech-job-detail-full">
            <span className="confirmation-detail-icon"><FiUser /></span>
            <div>
              <p className="confirmation-detail-label">Customer</p>
              <p className="confirmation-detail-value">{job.customerName}</p>
            </div>
          </div>
        </div>

        <button className="bs-back-btn" style={{ width: '100%', marginTop: '4px' }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function Profile() {
  const [selectedJob, setSelectedJob] = useState(null);

  const [profile, setProfile] = useState({
    name: 'JOHN TECHNICIAN',
    companyId: 'CZ-TECH-0182',
    email: 'cza-john@mail.com',
    phone: '0917 234 5678',
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(profile);

  const handleEditClick = () => {
    setEditForm(profile);
    setIsEditing(true);
  };

  const handleEditChange = (e) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  };

  const handleSave = () => {
    // TODO: connect to Express backend
    setProfile(editForm);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  return (
    <StaffLayout title="Profile">
      <div className="profile-card">
        <div className="profile-avatar-lg">
          <FiUser />
        </div>

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

            <div className="cancel-confirm-actions">
              <button type="button" className="bs-back-btn" onClick={handleCancel}>
                Cancel
              </button>
              <button type="button" className="bs-next-btn" onClick={handleSave}>
                Save Changes
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h2 className="profile-name">{profile.name}</h2>
            <p className="profile-id">{profile.companyId}</p>
            <div className="profile-contact">
              {profile.email}<br />
              {profile.phone}
            </div>
          </div>
        )}

        {!isEditing && (
          <button className="profile-edit-btn" type="button" onClick={handleEditClick}>
            <FiEdit2 />
          </button>
        )}
      </div>

      <h2 className="section-title">Performance</h2>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">
            <FiStar style={{ marginRight: '6px' }} />
            Average Client Rating
          </div>
          <div className="stat-value">4.8</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            <FiAlertTriangle style={{ marginRight: '6px' }} />
            Job Delays
          </div>
          <div className="stat-value">0</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            <FiFileText style={{ marginRight: '6px' }} />
            Pending Reports
          </div>
          <div className="stat-value">1</div>
        </div>
      </div>

      <h2 className="section-title">Scheduled Jobs</h2>
      <div className="tech-job-list">
        {scheduledJobs.map((job, i) => (
          <div className="tech-job-card tech-scheduled-card" key={i}>
            <div className="tech-job-info">
              <small className="tech-job-date-label">{job.date}</small>
              <div className="tech-job-service">
                {job.service}{' '}
                <span
                  className="tech-job-detail-link"
                  onClick={() => setSelectedJob(job)}
                  style={{ cursor: 'pointer' }}
                >
                  · Detail
                </span>
              </div>
              <small className="tech-job-booking">{job.bookingId}</small>
            </div>

            <div className="tech-job-meta">
              <FiClock /> {job.time}
            </div>

            <div className="tech-job-meta">
              <FiMapPin /> {job.address}
            </div>

            <button
              className="tech-job-view-link"
              onClick={() => setSelectedJob(job)}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <FiClock /> View Details
            </button>
          </div>
        ))}
      </div>

      {selectedJob && (
        <ScheduledJobModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </StaffLayout>
  );
}

export default Profile;
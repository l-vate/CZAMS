import React, { useState, useEffect } from 'react';

function Icon({ name }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  switch (name) {
    case 'user':
      return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>;
    case 'mail':
      return <svg {...common}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>;
    case 'phone':
      return <svg {...common}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>;
    case 'pin':
      return <svg {...common}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>;
    case 'calendar':
      return <svg {...common}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>;
    case 'shield':
      return <svg {...common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
    case 'star':
      return <svg {...common}><polygon points="12 2 15 9 22 9 16.5 13.5 18.5 21 12 17 5.5 21 7.5 13.5 2 9 9 9 12 2" /></svg>;
    default:
      return null;
  }
}

function UserDetailsModal({ user, onClose, onUpdated }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    role: 'customer',
    isActive: true,
    classificationChoice: '', // '' = auto-computed, else a manual override ('Regular' | 'Return')
    clientType: 'Residential',
  });
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        address: user.address || '',
        role: user.role || 'customer',
        isActive: user.isActive !== undefined ? user.isActive : true,
        classificationChoice: user.manualClassification || '',
        clientType: user.clientType || 'Residential',
      });
      setIsEditing(false);
    }
  }, [user]);

  if (!user) return null;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/users/${user._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      let data = await response.json();
      if (!response.ok) {
        setError(data.message || 'Failed to update user details.');
        return;
      }

      // Customer Classification Module: sent separately, and only if it actually
      // changed, since it has its own dedicated endpoint/validation.
      const originalOverride = user.manualClassification || '';
      if (user.role === 'customer' && formData.classificationChoice !== originalOverride) {
        const classRes = await fetch(`http://localhost:5000/api/users/${user._id}/classification`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ classification: formData.classificationChoice || null }),
        });
        const classData = await classRes.json();
        if (!classRes.ok) {
          setError(classData.message || 'Failed to update classification.');
          return;
        }
        data = classData;
      }

      setIsEditing(false);
      onUpdated?.(data);
    } catch (err) {
      console.error('Error updating user:', err);
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    setSaving(true);
    setError('');
    try {
      const updatedStatus = !formData.isActive;
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/users/${user._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: updatedStatus }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.message || 'Failed to update status.');
        return;
      }

      setFormData((prev) => ({ ...prev, isActive: updatedStatus }));
      onUpdated?.(data);
    } catch (err) {
      console.error('Error toggling status:', err);
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sdm-overlay" onClick={onClose}>
      <div className="sdm-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close-btn sdm-close-position" onClick={onClose}>✕</button>
        <div className="sdm-body">
          {/* Title Bar */}
          <div className="sdm-titlebar">
            <div>
              <h2 className="sdm-title">User Account Details</h2>
              <p className="sdm-subtitle">Account ID: {user._id}</p>
            </div>
            <span
              className="sdm-badge"
              style={{ background: formData.isActive ? '#22c55e' : '#ef4444' }}
            >
              {formData.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>

          {error && <div className="sdm-error">{error}</div>}

          {/* Profile Line */}
          <div className="sdm-customer-line">
            {user.profileImage ? (
              <img
                src={`http://localhost:5000${user.profileImage}`}
                alt={formData.name}
                style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <Icon name="user" />
            )}
            <span style={{ fontWeight: 600 }}>{formData.name || 'No Name'}</span>
            <span className="sdm-muted">· Role: {formData.role.toUpperCase()}</span>
          </div>

          {/* Details / Edit View */}
          <div className="sdm-columns">
            <div className="sdm-col" style={{ width: '100%' }}>
              <div className="sdm-row">
                <div className="sdm-row-icon"><Icon name="user" /></div>
                <div>
                  <span className="sdm-row-label">FULL NAME</span>
                  {isEditing ? (
                    <input
                      type="text"
                      className="ma-input"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  ) : (
                    <p className="sdm-row-value">{formData.name || '—'}</p>
                  )}
                </div>
              </div>

              <div className="sdm-row">
                <div className="sdm-row-icon"><Icon name="mail" /></div>
                <div>
                  <span className="sdm-row-label">EMAIL ADDRESS</span>
                  {isEditing ? (
                    <input
                      type="email"
                      className="ma-input"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  ) : (
                    <p className="sdm-row-value">{formData.email || '—'}</p>
                  )}
                </div>
              </div>

              <div className="sdm-row">
                <div className="sdm-row-icon"><Icon name="phone" /></div>
                <div>
                  <span className="sdm-row-label">PHONE NUMBER</span>
                  {isEditing ? (
                    <input
                      type="text"
                      className="ma-input"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  ) : (
                    <p className="sdm-row-value">{formData.phone || '—'}</p>
                  )}
                </div>
              </div>

              <div className="sdm-row">
                <div className="sdm-row-icon"><Icon name="pin" /></div>
                <div>
                  <span className="sdm-row-label">ADDRESS</span>
                  {isEditing ? (
                    <textarea
                      className="ma-textarea"
                      rows={2}
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  ) : (
                    <p className="sdm-row-value">{formData.address || '—'}</p>
                  )}
                </div>
              </div>

              <div className="sdm-row">
                <div className="sdm-row-icon"><Icon name="shield" /></div>
                <div>
                  <span className="sdm-row-label">ROLE</span>
                  {isEditing ? (
                    <select
                      className="sdm-tech-select"
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    >
                      <option value="customer">Customer</option>
                      <option value="staff">Staff / Technician</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <p className="sdm-row-value" style={{ textTransform: 'capitalize' }}>
                      {formData.role}
                    </p>
                  )}
                </div>
              </div>

              {user.role === 'customer' && (
                <div className="sdm-row">
                  <div className="sdm-row-icon"><Icon name="pin" /></div>
                  <div>
                    <span className="sdm-row-label">CLIENT TYPE</span>
                    {isEditing ? (
                      <select
                        className="sdm-tech-select"
                        value={formData.clientType}
                        onChange={(e) => setFormData({ ...formData, clientType: e.target.value })}
                      >
                        <option value="Residential">Residential</option>
                        <option value="Commercial">Commercial</option>
                      </select>
                    ) : (
                      <p className="sdm-row-value">{formData.clientType}</p>
                    )}
                  </div>
                </div>
              )}

              {user.role === 'customer' && (
                <div className="sdm-row">
                  <div className="sdm-row-icon"><Icon name="star" /></div>
                  <div>
                    <span className="sdm-row-label">CUSTOMER CLASSIFICATION</span>
                    {isEditing ? (
                      <select
                        className="sdm-tech-select"
                        value={formData.classificationChoice}
                        onChange={(e) => setFormData({ ...formData, classificationChoice: e.target.value })}
                      >
                        <option value="">Auto (currently: {user.classification || 'Regular'})</option>
                        <option value="Regular">Regular (manual override)</option>
                        <option value="Return">Return (manual override)</option>
                      </select>
                    ) : (
                      <p className="sdm-row-value">
                        {user.classification || 'Regular'}
                        {user.manualClassification ? ' (manual override)' : ' (auto-computed)'}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {user.createdAt && (
                <div className="sdm-row">
                  <div className="sdm-row-icon"><Icon name="calendar" /></div>
                  <div>
                    <span className="sdm-row-label">REGISTERED ON</span>
                    <p className="sdm-row-value">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="sdm-footer">
          <button
            className={`sdm-btn ${formData.isActive ? 'sdm-btn-danger' : 'sdm-btn-primary'}`}
            onClick={handleToggleStatus}
            disabled={saving}
          >
            {formData.isActive ? 'Deactivate Account' : 'Activate Account'}
          </button>

          <div className="sdm-footer-actions">
            {isEditing ? (
              <>
                <button
                  className="sdm-btn sdm-btn-outline"
                  onClick={() => setIsEditing(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="sdm-btn sdm-btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  Save Changes
                </button>
              </>
            ) : (
              <>
                <button className="sdm-btn sdm-btn-outline" onClick={onClose}>
                  Close
                </button>
                <button
                  className="sdm-btn sdm-btn-primary"
                  onClick={() => setIsEditing(true)}
                >
                  Edit Details
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default UserDetailsModal;
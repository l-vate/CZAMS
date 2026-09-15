import React, { useState, useEffect } from 'react';
import AdminLayout from './admin_layout';
import { FiPlus } from 'react-icons/fi';

const API_BASE = 'http://localhost:5000';

const CATEGORIES = ['Holiday', 'Closure', 'Maintenance', 'General'];

const EMPTY_FORM = {
  title: '',
  message: '',
  category: 'General',
  displayDate: '',
  isActive: true,
};

function AnnouncementManage() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  async function fetchAnnouncements() {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/announcements`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to load announcements.');
      const data = await res.json();
      setAnnouncements(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Could not connect to the server or load announcements.');
    } finally {
      setLoading(false);
    }
  }

  function openAddModal() {
    setEditingAnnouncement(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowModal(true);
  }

  function openEditModal(announcement) {
    setEditingAnnouncement(announcement);
    setForm({
      title: announcement.title || '',
      message: announcement.message || '',
      category: announcement.category || 'General',
      displayDate: announcement.displayDate || '',
      isActive: announcement.isActive !== undefined ? announcement.isActive : true,
    });
    setFormError('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingAnnouncement(null);
    setForm(EMPTY_FORM);
    setFormError('');
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');

    if (!form.title.trim()) {
      setFormError('Title is required.');
      return;
    }
    if (!form.message.trim()) {
      setFormError('Message is required.');
      return;
    }

    const payload = {
      title: form.title.trim(),
      message: form.message.trim(),
      category: form.category,
      displayDate: form.displayDate.trim(),
      isActive: form.isActive,
    };

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const url = editingAnnouncement
        ? `${API_BASE}/api/announcements/${editingAnnouncement._id}`
        : `${API_BASE}/api/announcements`;
      const method = editingAnnouncement ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to save announcement.');
      }

      await fetchAnnouncements();
      closeModal();
    } catch (err) {
      setFormError(err.message || 'Something went wrong while saving.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingAnnouncement) return;
    const confirmed = window.confirm(`Delete "${editingAnnouncement.title}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/announcements/${editingAnnouncement._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to delete announcement.');

      setAnnouncements((prev) => prev.filter((a) => a._id !== editingAnnouncement._id));
      closeModal();
    } catch (err) {
      setFormError(err.message || 'Could not delete announcement.');
    }
  }

  const filteredAnnouncements = announcements.filter((a) =>
    a.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.message?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AdminLayout title="Announcements">
      <div className="ann-view">

        {/* Header & Actions */}
        <div className="ann-manage-header">
          <h1 className="dashboard-welcome">Announcements</h1>
          <button className="ann-add-btn" onClick={openAddModal}>
            <FiPlus style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Add Announcement
          </button>
        </div>

        {/* Toolbar & Search */}
        <div className="ann-toolbar">
          <input
            type="text"
            className="ann-search ann-search-inline"
            placeholder="Search announcements..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Error Banner */}
        {error && (
          <div className="ma-form-error" style={{ marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {/* Main Panel & List */}
        <div className="ann-manage-panel">
          {loading ? (
            <p className="ann-empty">Loading announcements...</p>
          ) : filteredAnnouncements.length === 0 ? (
            <div className="ann-empty">
              <p>No announcements found.</p>
              <button className="ann-btn ann-btn-ghost" onClick={openAddModal} style={{ marginTop: '10px' }}>
                Create your first announcement
              </button>
            </div>
          ) : (
            <div className="ann-manage-grid">
              {filteredAnnouncements.map((a) => (
                <div
                  key={a._id}
                  className="ann-item-card"
                  onClick={() => openEditModal(a)}
                >
                  <div className="ann-item-info">
                    <div className="ann-item-topline">
                      <span className="ann-item-title">{a.title}</span>
                      <span className={`ann-badge ann-badge-${a.category.toLowerCase()}`}>{a.category}</span>
                      {!a.isActive && <span className="ann-badge ann-badge-inactive">Hidden</span>}
                    </div>
                    <span className="ann-item-message">{a.message}</span>
                    {a.displayDate && <span className="ann-item-date">{a.displayDate}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="ann-modal-overlay" onClick={closeModal}>
          <div className="ann-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ann-modal-header">
              <h2 className="modal-title">{editingAnnouncement ? 'Edit Announcement' : 'Add New Announcement'}</h2>
              <button type="button" className="modal-close-btn" onClick={closeModal}>✕</button>
            </div>

            <form onSubmit={handleSubmit}>
              {formError && <p className="ma-form-error" style={{ marginBottom: '12px' }}>{formError}</p>}

              <div className="ann-field">
                <label>Title</label>
                <input
                  type="text"
                  name="title"
                  value={form.title}
                  onChange={handleChange}
                  placeholder="e.g. Closed for Holy Week"
                  required
                />
              </div>

              <div className="ann-field">
                <label>Message</label>
                <textarea
                  name="message"
                  value={form.message}
                  onChange={handleChange}
                  placeholder="Details visitors should see"
                  rows={3}
                  required
                />
              </div>

              <div className="ann-field">
                <label>Category</label>
                <select name="category" value={form.category} onChange={handleChange}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="ann-field">
                <label>Display Date (optional)</label>
                <input
                  type="text"
                  name="displayDate"
                  value={form.displayDate}
                  onChange={handleChange}
                  placeholder="e.g. Dec 24-26, 2026"
                />
              </div>

              <label className="ann-checkbox-field">
                <input
                  type="checkbox"
                  name="isActive"
                  checked={form.isActive}
                  onChange={handleChange}
                />
                Visible on landing page
              </label>

              <div className="ann-modal-actions">
                {editingAnnouncement ? (
                  <button
                    type="button"
                    className="ann-btn ann-btn-danger"
                    onClick={handleDelete}
                  >
                    Delete
                  </button>
                ) : <div />}

                <div className="ann-modal-actions-right">
                  <button
                    type="button"
                    className="ann-btn ann-btn-ghost"
                    onClick={closeModal}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="ann-btn ann-btn-primary"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : editingAnnouncement ? 'Save Changes' : 'Add Announcement'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

export default AnnouncementManage;

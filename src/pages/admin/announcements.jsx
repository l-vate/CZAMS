import { useState, useEffect } from 'react';
import AdminLayout from './admin_layout';
import { FiPlus } from 'react-icons/fi';
import { withMessage, withFallback, attempt } from '../../services/apiClient';
import { listAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../../services/announcementService';
import { addClosure } from '../../services/closureService';
import { formatClosureRange, dateRange, MAX_RANGE_DAYS } from '../../utils/closureDates';
import { closureDateProblem, closureWindow } from '../../utils/dateRules';


const CATEGORIES = ['Holiday', 'Closure', 'Maintenance', 'General'];
// A notice in one of these can also close its dates for booking (the General ones are only news).
const CLOSING_CATEGORIES = ['Holiday', 'Closure', 'Maintenance'];

const EMPTY_FORM = {
  title: '',
  message: '',
  category: 'General',
  displayDate: '',
  closeFrom: '',
  closeTo: '',
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

  const filteredAnnouncements = announcements.filter((a) =>
    a.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.message?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function fetchAnnouncements() {
    setLoading(true);
    setError('');
    try {
      const data = await listAnnouncements();
      setAnnouncements(Array.isArray(data) ? data : []);
    } catch {
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
      closeFrom: '',
      closeTo: '',
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

    // The dates to close for booking, checked before anything is saved.
    const closing = CLOSING_CATEGORIES.includes(form.category) && form.closeFrom;
    const closeTo = form.closeTo || form.closeFrom;
    if (closing) {
      const problem = closureDateProblem(form.closeFrom) || closureDateProblem(closeTo);
      if (problem) { setFormError(problem); return; }
      if (closeTo < form.closeFrom) { setFormError('The last date cannot be before the first date.'); return; }
      if (dateRange(form.closeFrom, closeTo).length > MAX_RANGE_DAYS) { setFormError(`Close at most ${MAX_RANGE_DAYS} days at a time.`); return; }
    }

    const payload = {
      title: form.title.trim(),
      message: form.message.trim(),
      category: form.category,
      displayDate: form.displayDate.trim() || (closing ? formatClosureRange(form.closeFrom, closeTo) : ''),
      isActive: form.isActive,
    };

    setSaving(true);
    try {
      const pendingSave = editingAnnouncement
        ? updateAnnouncement(editingAnnouncement._id, payload)
        : createAnnouncement(payload);
      await pendingSave.catch(withFallback('Failed to save announcement.'));

      if (closing) {
        const reason = form.title.trim().length >= 3 ? form.title.trim().slice(0, 200) : `${form.category} closure`;
        const failed = [];
        for (const day of dateRange(form.closeFrom, closeTo)) {
          const saved = await attempt(addClosure({ date: day, reason }), 'Failed to close the date.');
          if (saved.error && !/already closed/i.test(saved.error)) failed.push(`${day}: ${saved.error}`);
        }
        if (failed.length > 0) {
          await fetchAnnouncements();
          setFormError(`The announcement was saved, but these dates could not be closed for booking. ${failed.join(' ')}`);
          return;
        }
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
      await deleteAnnouncement(editingAnnouncement._id).catch(withMessage('Failed to delete announcement.'));

      setAnnouncements((prev) => prev.filter((a) => a._id !== editingAnnouncement._id));
      closeModal();
    } catch (err) {
      setFormError(err.message || 'Could not delete announcement.');
    }
  }

  return (
    <AdminLayout
      title="Announcements"
      searchValue={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search announcements..."
    >
      <div className="ann-view">

        {/* Header & Actions */}
        <div className="ann-manage-header">
          <h1 className="dashboard-welcome">Announcements</h1>
          <button className="ann-add-btn" onClick={openAddModal}>
            <FiPlus className="admin-announcements-x1" /> Add Announcement
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="ma-form-error admin-announcements-x2">
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
              <button className="ann-btn ann-btn-ghost admin-announcements-x3" onClick={openAddModal}>
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
              {formError && <p className="ma-form-error admin-announcements-x4">{formError}</p>}

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

              {CLOSING_CATEGORIES.includes(form.category) && (
                <div className="ann-field">
                  <label>Close these dates for booking (optional)</label>
                  <div className="ann-date-pair">
                    <input
                      type="date"
                      name="closeFrom"
                      aria-label="First closed date"
                      min={closureWindow().min}
                      max={closureWindow().max}
                      value={form.closeFrom}
                      onChange={handleChange}
                    />
                    <input
                      type="date"
                      name="closeTo"
                      aria-label="Last closed date (optional)"
                      min={form.closeFrom || closureWindow().min}
                      max={closureWindow().max}
                      value={form.closeTo}
                      onChange={handleChange}
                    />
                  </div>
                  <small className="ann-hint">Customers cannot book or reschedule onto these dates. The text above is only shown on the landing page and does not block anything.</small>
                </div>
              )}

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

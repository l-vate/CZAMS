import { useState } from 'react';
import AdminLayout from './admin_layout';
import '../../css/admin.css';

/* ── Mock data ─────────────────────────────────────────────
   Replace these with real API data whenever the backend is ready.
   Shapes are kept flat so swapping in fetched data is a drop-in. */

const REQUESTS = [
  { id: 1, client: 'Client Name', status: 'Approved', serviceType: 'SERVICE TYPE', detail: 'Detail', bookingId: 'booking id', technician: 'employee name', date: 'mm-dd-yy --:-- -- - --:-- --', address: 'address' },
  { id: 2, client: 'Client Name', status: 'Pending', serviceType: 'SERVICE TYPE', detail: 'Detail', bookingId: 'booking id', technician: 'employee name', date: 'mm-dd-yy --:-- -- - --:-- --', address: 'address' },
  { id: 3, client: 'Client Name', status: 'Completed', serviceType: 'SERVICE TYPE', detail: 'Detail', bookingId: 'booking id', technician: 'employee name', date: 'mm-dd-yy --:-- -- - --:-- --', address: 'address' },
  { id: 4, client: 'Client Name', status: 'Pending', serviceType: 'SERVICE TYPE', detail: 'Detail', bookingId: 'booking id', technician: 'employee name', date: 'mm-dd-yy --:-- -- - --:-- --', address: 'address' },
  { id: 5, client: 'Client Name', status: 'Pending', serviceType: 'SERVICE TYPE', detail: 'Detail', bookingId: 'booking id', technician: 'employee name', date: 'mm-dd-yy --:-- -- - --:-- --', address: 'address' },
];

const REPORTS = [
  { id: 1, serviceType: 'SERVICE TYPE', detail: 'Detail', bookingId: 'booking id', technician: 'employee name', completedOn: 'mm-dd--yy' },
  { id: 2, serviceType: 'SERVICE TYPE', detail: 'Detail', bookingId: 'booking id', technician: 'employee name', completedOn: 'mm-dd--yy' },
  { id: 3, serviceType: 'SERVICE TYPE', detail: 'Detail', bookingId: 'booking id', technician: 'employee name', completedOn: 'mm-dd--yy' },
  { id: 4, serviceType: 'SERVICE TYPE', detail: 'Detail', bookingId: 'booking id', technician: 'employee name', completedOn: 'mm-dd--yy' },
];

const INITIAL_MANAGED_SERVICES = [
  { id: 1, name: 'Cleaning', description: 'Deep clean & sanitize', price: 650 },
  { id: 2, name: 'Repair', description: 'Diagnose & fix issues', price: 1200 },
  { id: 3, name: 'Installation', description: 'Deep clean & sanitize', price: 3500 },
  { id: 4, name: 'Maintenance', description: 'Routine check-up', price: 550 },
];

const REQUEST_FILTERS = ['All', 'Pending', 'Approved', 'In Progress', 'Completed', 'Cancelled'];

const STATUS_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M3 9h18" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

/* ── Menu (landing options: Requests / Manage Services / Reports) ── */
function ServicesMenu({ onSelect }) {
  return (
    <div className="svc-menu">
      <h1 className="dashboard-welcome">CZA Services Management</h1>

      <button type="button" className="svc-menu-card svc-menu-card-lg" onClick={() => onSelect('requests')}>
        <span className="svc-menu-icon">{STATUS_ICON}</span>
        <span className="svc-menu-text">
          <span className="svc-menu-title">Requests</span>
          <span className="svc-menu-sub">View service requests made by clients.</span>
        </span>
        <span className="svc-menu-arrow">→</span>
      </button>

      <div className="svc-menu-row">
        <button type="button" className="svc-menu-card svc-menu-card-light" onClick={() => onSelect('manage')}>
          <span className="svc-menu-icon">{STATUS_ICON}</span>
          <span className="svc-menu-text">
            <span className="svc-menu-title">Manage Services</span>
            <span className="svc-menu-sub">Manage available services, pricing, and more.</span>
          </span>
          <span className="svc-menu-arrow">→</span>
        </button>

        <button type="button" className="svc-menu-card svc-menu-card-lg" onClick={() => onSelect('reports')}>
          <span className="svc-menu-icon">{STATUS_ICON}</span>
          <span className="svc-menu-text">
            <span className="svc-menu-title">Reports</span>
            <span className="svc-menu-sub">View service reports</span>
          </span>
          <span className="svc-menu-arrow">→</span>
        </button>
      </div>
    </div>
  );
}

/* ── Requests view ─────────────────────────────────────────── */
function RequestsView({ onBack }) {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  const filtered = REQUESTS.filter((r) => {
    const matchesFilter = filter === 'All' || r.status === filter;
    const matchesSearch = search.trim() === '' || r.client.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="svc-view">
      <button type="button" className="svc-back-link" onClick={onBack}>← Back</button>

      <div className="svc-toolbar">
        <div className="svc-tabs">
          {REQUEST_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`svc-tab ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="svc-toolbar-right">
          <button type="button" className="svc-refund-link">
            Refund Request
            <span className="svc-refund-badge">1</span>
          </button>
          <button type="button" className="svc-walkin-btn">+ Walk-in</button>
        </div>
      </div>

      <input
        type="text"
        className="svc-search"
        placeholder="Search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="svc-request-list">
        {filtered.map((r) => (
          <div key={r.id} className="svc-request-card">
            <div className="svc-request-main">
              <div className="svc-request-topline">
                <span className="svc-request-client">{r.client}</span>
                <span className={`svc-badge svc-badge-${r.status.toLowerCase().replace(/\s+/g, '-')}`}>
                  {r.status}
                </span>
              </div>
              <p className="svc-request-service">{r.serviceType} · {r.detail}</p>
              <p className="svc-request-meta">
                {r.bookingId}<br />
                Technician: {r.technician}
              </p>
            </div>

            <div className="svc-request-when">
              <span className="svc-request-line">🕐 {r.date}</span>
              <span className="svc-request-line">🕐 {r.address}</span>
            </div>

            <button type="button" className="svc-review-link">Review Request</button>
          </div>
        ))}

        {filtered.length === 0 && <p className="svc-empty">No requests match this filter.</p>}
      </div>
    </div>
  );
}

/* ── Manage Services view ─────────────────────────────────── */
function ManageServicesView({ onBack }) {
  const [services, setServices] = useState(INITIAL_MANAGED_SERVICES);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', price: '' });

  const openAddModal = () => {
    setEditingId(null);
    setForm({ name: '', description: '', price: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (service) => {
    setEditingId(service.id);
    setForm({ name: service.name, description: service.description, price: String(service.price) });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setForm({ name: '', description: '', price: '' });
  };

  const handleChange = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSave = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const priceValue = Number(form.price) || 0;

    if (editingId) {
      setServices((prev) =>
        prev.map((s) => (s.id === editingId ? { ...s, name: form.name, description: form.description, price: priceValue } : s))
      );
    } else {
      setServices((prev) => [...prev, { id: Date.now(), name: form.name, description: form.description, price: priceValue }]);
    }
    closeModal();
  };

  const handleDelete = (id) => {
    setServices((prev) => prev.filter((s) => s.id !== id));
    closeModal();
  };

  return (
    <div className="svc-view">
      <button type="button" className="svc-back-link" onClick={onBack}>← Back</button>

      <div className="svc-manage-header">
        <h2 className="svc-view-title">Manage Services</h2>
        <button type="button" className="svc-add-btn" onClick={openAddModal}>+ Add Service</button>
      </div>

      <div className="svc-manage-panel">
        <div className="svc-manage-grid">
          {services.map((service) => (
            <button type="button" key={service.id} className="svc-service-card" onClick={() => openEditModal(service)}>
              <span className="svc-service-icon">{STATUS_ICON}</span>
              <span className="svc-service-info">
                <span className="svc-service-name">{service.name}</span>
                <span className="svc-service-desc">{service.description}</span>
              </span>
              <span className="svc-service-price">₱{service.price.toLocaleString()}</span>
            </button>
          ))}
          {services.length === 0 && <p className="svc-empty">No services yet. Add one to get started.</p>}
        </div>
      </div>

      {isModalOpen && (
        <div className="svc-modal-overlay" onClick={closeModal}>
          <div className="svc-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingId ? 'Edit Service' : 'Add Service'}</h2>
            <form onSubmit={handleSave}>
              <label className="svc-field">
                Service name
                <input type="text" value={form.name} onChange={handleChange('name')} placeholder="e.g. Cleaning" required />
              </label>
              <label className="svc-field">
                Description
                <input type="text" value={form.description} onChange={handleChange('description')} placeholder="e.g. Deep clean & sanitize" />
              </label>
              <label className="svc-field">
                Price (₱)
                <input type="number" min="0" value={form.price} onChange={handleChange('price')} placeholder="0" required />
              </label>

              <div className="svc-modal-actions">
                {editingId && (
                  <button type="button" className="svc-btn svc-btn-danger" onClick={() => handleDelete(editingId)}>Delete</button>
                )}
                <div className="svc-modal-actions-right">
                  <button type="button" className="svc-btn svc-btn-ghost" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="svc-btn svc-btn-primary">Save</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Reports view ─────────────────────────────────────────── */
function ReportsView({ onBack }) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('Newest');

  const filtered = REPORTS.filter(
    (r) => search.trim() === '' || r.serviceType.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="svc-view">
      <button type="button" className="svc-back-link" onClick={onBack}>← Back</button>

      <div className="svc-toolbar">
        <select className="svc-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option>Newest</option>
          <option>Oldest</option>
          <option>Service type</option>
        </select>
        <input
          type="text"
          className="svc-search svc-search-inline"
          placeholder="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="svc-report-list">
        {filtered.map((r) => (
          <div key={r.id} className="svc-report-card">
            <div className="svc-report-main">
              <p className="svc-request-service">{r.serviceType} · {r.detail}</p>
              <p className="svc-request-meta">
                {r.bookingId}<br />
                Technician: {r.technician}
              </p>
            </div>
            <span className="svc-request-line">🕐 Complete on {r.completedOn}</span>
            <button type="button" className="svc-review-link">View Report</button>
          </div>
        ))}
        {filtered.length === 0 && <p className="svc-empty">No reports found.</p>}
      </div>
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────── */
function Services() {
  const [view, setView] = useState('menu'); // 'menu' | 'requests' | 'manage' | 'reports'

  return (
    <AdminLayout title="Services">
      {view === 'menu' && <ServicesMenu onSelect={setView} />}
      {view === 'requests' && <RequestsView onBack={() => setView('menu')} />}
      {view === 'manage' && <ManageServicesView onBack={() => setView('menu')} />}
      {view === 'reports' && <ReportsView onBack={() => setView('menu')} />}
    </AdminLayout>
  );
}

export default Services;
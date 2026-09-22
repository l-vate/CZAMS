import React, { useState, useEffect } from 'react';
import AdminLayout from './admin_layout';
import { FiPlus, FiSearch, FiSettings, FiTool, FiWind, FiThermometer } from 'react-icons/fi';
import { UNIT_TYPES } from '../customer/book_service';
import PaymentSettingsPanel from '../../components/payment_settings_panel';

const TABS = [
  { key: 'services', label: 'Services' },
  { key: 'payment', label: 'Payment Settings' },
];

const API_BASE = 'http://localhost:5000';

const ICON_MAP = {
  FiWind: <FiWind />,
  FiTool: <FiTool />,
  FiThermometer: <FiThermometer />,
  FiSettings: <FiSettings />,
};

// Multi-Unit Booking Redesign: unitTypePricing is edited here as a plain
// { [unitType]: priceString } map (one input per UNIT_TYPES entry) since that's
// far easier to bind form inputs to than an array — converted to the array shape
// the Service model actually stores on submit.
const EMPTY_FORM = {
  name: '',
  description: '',
  price: '',
  durationMinutes: '',
  category: '',
  icon: 'FiSettings',
  isActive: true,
  serviceType: 'Other',
  unitTypePricing: {},
  // Three-Tier Cleaning Structure: true for Deep Cleaning / Pull-down Deep
  // Cleaning — resolved automatically by Step1's tier questions, never picked
  // directly by the customer, but still fully editable here like any service.
  hiddenFromDirectSelection: false,
};

function ServiceManage() {
  const [activeTab, setActiveTab] = useState('services');
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal & Form states
  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    fetchServices();
  }, []);

  async function fetchServices() {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/services`, {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });

      if (!res.ok) throw new Error('Failed to load services.');
      const data = await res.json();
      setServices(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Could not connect to the server or load services.');
    } finally {
      setLoading(false);
    }
  }

  function openAddModal() {
    setEditingService(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowModal(true);
  }

  function openEditModal(service) {
    setEditingService(service);
    const unitTypePricing = {};
    (service.unitTypePricing || []).forEach((entry) => {
      unitTypePricing[entry.unitType] = String(entry.price);
    });
    setForm({
      name: service.name || '',
      description: service.description || '',
      price: service.price ?? '',
      durationMinutes: service.durationMinutes ?? '',
      category: service.category || '',
      icon: service.icon || 'FiSettings',
      isActive: service.isActive !== undefined ? service.isActive : true,
      serviceType: service.serviceType || 'Other',
      unitTypePricing,
      hiddenFromDirectSelection: !!service.hiddenFromDirectSelection,
    });
    setFormError('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingService(null);
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

  function handleUnitTypePriceChange(unitType, value) {
    setForm((prev) => ({
      ...prev,
      unitTypePricing: { ...prev.unitTypePricing, [unitType]: value },
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');

    if (!form.name.trim()) {
      setFormError('Service name is required.');
      return;
    }
    if (form.price === '' || isNaN(form.price) || Number(form.price) < 0) {
      setFormError('Please enter a valid price.');
      return;
    }

    // Empty inputs mean "use the base price" — only entries the admin actually
    // typed a value into get sent as an override.
    const unitTypePricing = Object.entries(form.unitTypePricing || {})
      .filter(([, value]) => value !== '' && value !== null && value !== undefined)
      .map(([unitType, value]) => ({ unitType, price: Number(value) }));

    if (unitTypePricing.some((entry) => isNaN(entry.price) || entry.price < 0)) {
      setFormError('Per-unit-type prices must be valid numbers.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : 0,
      category: form.category,
      icon: form.icon,
      isActive: form.isActive,
      serviceType: form.serviceType,
      unitTypePricing,
      hiddenFromDirectSelection: form.hiddenFromDirectSelection,
    };

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const url = editingService
        ? `${API_BASE}/api/services/${editingService._id}`
        : `${API_BASE}/api/services`;
      const method = editingService ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to save service.');
      }

      await fetchServices();
      closeModal();
    } catch (err) {
      setFormError(err.message || 'Something went wrong while saving.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingService) return;
    const confirmed = window.confirm(`Delete "${editingService.name}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/services/${editingService._id}`, {
        method: 'DELETE',
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });

      if (!res.ok) throw new Error('Failed to delete service.');
      
      setServices((prev) => prev.filter((s) => s._id !== editingService._id));
      closeModal();
    } catch (err) {
      setFormError(err.message || 'Could not delete service.');
    }
  }

  const filteredServices = services.filter((s) =>
    s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AdminLayout title="Manage Services">
      <div className="svc-view">
        
        {/* Header & Actions */}
        <div className="svc-manage-header">
          <h1 className="dashboard-welcome">Manage Services</h1>
          {activeTab === 'services' && (
            <button className="svc-add-btn" onClick={openAddModal}>
              <FiPlus style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Add Service
            </button>
          )}
        </div>

        {/* System Configuration Module: Services (per-service pricing) vs Payment
            Settings (methods + account details + down payment percentages) —
            both admin-managed config for the booking flow, kept as tabs on the
            same existing page rather than a separate nav item. */}
        <div className="req-filters">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`filter-pill ${activeTab === tab.key ? 'filter-pill--active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'payment' ? (
          <PaymentSettingsPanel />
        ) : (
          <>
            {/* Toolbar & Search */}
            <div className="svc-toolbar">
              <input
                type="text"
                className="svc-search svc-search-inline"
                placeholder="Search services..."
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

            {/* Main Panel & Grid */}
            <div className="svc-manage-panel">
              {loading ? (
                <p className="svc-empty">Loading services...</p>
              ) : filteredServices.length === 0 ? (
                <div className="svc-empty">
                  <p>No services found.</p>
                  <button className="svc-btn svc-btn-ghost" onClick={openAddModal} style={{ marginTop: '10px' }}>
                    Create your first service
                  </button>
                </div>
              ) : (
                <div className="svc-manage-grid">
                  {filteredServices.map((s) => (
                    <div
                      key={s._id}
                      className="svc-service-card"
                      onClick={() => openEditModal(s)}
                    >
                      <div className="svc-service-icon">
                        {ICON_MAP[s.icon] || <FiSettings />}
                      </div>
                      <div className="svc-service-info">
                        <span className="svc-service-name">
                          {s.name}
                          {s.hiddenFromDirectSelection && (
                            <span className="svc-service-price-note" style={{ display: 'inline-block', marginLeft: '8px' }}>hidden from customers</span>
                          )}
                        </span>
                        <span className="svc-service-desc">
                          {s.description || 'No description provided'}
                        </span>
                      </div>
                      <span className="svc-service-price">
                        ₱{Number(s.price).toLocaleString()}
                        {s.unitTypePricing?.length > 0 && (
                          <span className="svc-service-price-note">varies by unit type</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="svc-modal-overlay" onClick={closeModal}>
          <div className="svc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="svc-modal-header">
              <h2 className="modal-title">{editingService ? 'Edit Service' : 'Add New Service'}</h2>
              <button type="button" className="modal-close-btn" onClick={closeModal}>✕</button>
            </div>

            <form onSubmit={handleSubmit}>
              {formError && <p className="ma-form-error" style={{ marginBottom: '12px' }}>{formError}</p>}

              <div className="svc-field">
                <label>Service Name</label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g. Aircon Cleaning"
                  required
                />
              </div>

              <div className="svc-field">
                <label>Description</label>
                <input
                  type="text"
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Brief service details"
                />
              </div>

              <div className="svc-field">
                <label>Base Price (₱)</label>
                <input
                  type="number"
                  name="price"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={handleChange}
                  placeholder="1500"
                  required
                />
              </div>

              <div className="svc-field">
                <label>Per-Unit-Type Pricing <span className="svc-field-hint">(optional — overrides base price for that unit type)</span></label>
                <div className="svc-unit-pricing-grid">
                  {UNIT_TYPES.map((unitType) => (
                    <div key={unitType} className="svc-unit-pricing-row">
                      <span className="svc-unit-pricing-label">{unitType}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={`Same as base (₱${form.price || 0})`}
                        value={form.unitTypePricing?.[unitType] ?? ''}
                        onChange={(e) => handleUnitTypePriceChange(unitType, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="svc-field">
                <label>Icon Key</label>
                <select
                  name="icon"
                  value={form.icon}
                  onChange={handleChange}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '9px 12px',
                    fontSize: '14px',
                  }}
                >
                  <option value="FiSettings">FiSettings (Default)</option>
                  <option value="FiWind">FiWind (Cleaning/Air)</option>
                  <option value="FiTool">FiTool (Repair/Maintenance)</option>
                  <option value="FiThermometer">FiThermometer (Cooling/AC)</option>
                </select>
              </div>

              <div className="svc-field">
                <label>Service Type</label>
                <select
                  name="serviceType"
                  value={form.serviceType}
                  onChange={handleChange}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '9px 12px',
                    fontSize: '14px',
                  }}
                >
                  <option value="Cleaning">Cleaning</option>
                  <option value="Installation">Installation</option>
                  <option value="Repair">Repair</option>
                  <option value="Leak Repair">Leak Repair</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Other">Other</option>
                </select>
                <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  Determines which Warranty Tracking rule applies to bookings of this service.
                </p>
              </div>

              <div className="svc-field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    name="hiddenFromDirectSelection"
                    checked={form.hiddenFromDirectSelection}
                    onChange={handleChange}
                  />
                  Hide from customer's direct service selection
                </label>
                <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  For the two upgraded cleaning tiers (Deep Cleaning, Pull-down Deep Cleaning) — resolved
                  automatically by the tier questions when a customer picks "Cleaning," never shown as
                  its own card. Leave unchecked for every other service.
                </p>
              </div>

              <div className="svc-modal-actions">
                {editingService ? (
                  <button
                    type="button"
                    className="svc-btn svc-btn-danger"
                    onClick={handleDelete}
                  >
                    Delete
                  </button>
                ) : <div />}

                <div className="svc-modal-actions-right">
                  <button
                    type="button"
                    className="svc-btn svc-btn-ghost"
                    onClick={closeModal}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="svc-btn svc-btn-primary"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : editingService ? 'Save Changes' : 'Add Service'}
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

export default ServiceManage;
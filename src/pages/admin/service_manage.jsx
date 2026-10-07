import { useState, useEffect } from 'react';
import AdminLayout from './admin_layout';
import { FiPlus, FiSettings, FiTool, FiWind, FiThermometer } from 'react-icons/fi';
import { UNIT_TYPES } from '../../constants/unitTypes';
import { withMessage, withFallback } from '../../services/apiClient';
import { listServices, createService, updateService, deleteService } from '../../services/serviceCatalogService';
import { SERVICE_TYPE, SERVICE_TYPE_VALUES } from '../../constants/serviceTypes';


const ICON_MAP = {
  FiWind: <FiWind />,
  FiTool: <FiTool />,
  FiThermometer: <FiThermometer />,
  FiSettings: <FiSettings />,
};

// Multi-Unit Booking Redesign: unitTypePricing is edited here as a plain
// { [unitType]: priceString } map (one input per UNIT_TYPES entry) since that's
// far easier to bind form inputs to than an array - converted to the array shape
// the Service model actually stores on submit.
const EMPTY_FORM = {
  name: '',
  description: '',
  price: '',
  durationMinutes: '',
  category: '',
  icon: 'FiSettings',
  isActive: true,
  serviceType: SERVICE_TYPE.OTHER,
  minTechnicians: '',
  unitTypePricing: {},
  // Three-Tier Cleaning Structure: true for Deep Cleaning / Pull-down Deep
  // Cleaning - resolved automatically by Step1's tier questions, never picked
  // directly by the customer, but still fully editable here like any service.
  hiddenFromDirectSelection: false,
};

function ServiceManage() {
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

  const filteredServices = services.filter((s) =>
    s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function fetchServices() {
    setLoading(true);
    setError('');
    try {
      const data = await listServices();
      setServices(Array.isArray(data) ? data : []);
    } catch {
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
      serviceType: service.serviceType || SERVICE_TYPE.OTHER,
      minTechnicians: service.minTechnicians ? String(service.minTechnicians) : '',
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

    // Empty inputs mean "use the base price" - only entries the admin actually
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
      // blank = the default (1 for a Check-up, 2 for everything else)
      minTechnicians: form.minTechnicians === '' ? null : Number(form.minTechnicians),
      unitTypePricing,
      hiddenFromDirectSelection: form.hiddenFromDirectSelection,
    };

    setSaving(true);
    try {
      const pendingSave = editingService
        ? updateService(editingService._id, payload)
        : createService(payload);
      await pendingSave.catch(withFallback('Failed to save service.'));

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
      await deleteService(editingService._id).catch(withMessage('Failed to delete service.'));
      
      setServices((prev) => prev.filter((s) => s._id !== editingService._id));
      closeModal();
    } catch (err) {
      setFormError(err.message || 'Could not delete service.');
    }
  }

  return (
    <AdminLayout
      title="Manage Services"
      searchValue={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search services..."
    >
      <div className="svc-view">

        {/* Header & Actions */}
        <div className="svc-manage-header">
          <h1 className="dashboard-welcome">Manage Services</h1>
          <button className="svc-add-btn" onClick={openAddModal}>
            <FiPlus className="admin-service-manage-x1" /> Add Service
          </button>
        </div>

        <>
            {/* Error Banner */}
            {error && (
              <div className="ma-form-error admin-service-manage-x2">
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
                  <button className="svc-btn svc-btn-ghost admin-service-manage-x3" onClick={openAddModal}>
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
                            <span className="svc-service-price-note admin-service-manage-x4">hidden from customers</span>
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
              {formError && <p className="ma-form-error admin-service-manage-x5">{formError}</p>}

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
                <label>Per-Unit-Type Pricing <span className="svc-field-hint">(optional - overrides base price for that unit type)</span></label>
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
                  className="admin-service-manage-x6"
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
                  className="admin-service-manage-x6"
                >
                  {SERVICE_TYPE_VALUES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <p className="admin-service-manage-x7">
                  Determines which Warranty Tracking rule applies to bookings of this service.
                </p>
              </div>

              <div className="svc-field">
                <label>Technicians needed</label>
                <select
                  name="minTechnicians"
                  value={form.minTechnicians}
                  onChange={handleChange}
                  className="admin-service-manage-x6"
                >
                  <option value="">Default (1 for a Check-up, 2 for everything else)</option>
                  <option value="1">1 (a single technician is enough)</option>
                  <option value="2">2 (a lead and a helper)</option>
                </select>
                <p className="admin-service-manage-x7">
                  A booking cannot be approved until at least this many technicians are assigned. Cleaning
                  needs a pair; a single technician is for check-up or survey visits only.
                </p>
              </div>

              <div className="svc-field">
                <label className="admin-service-manage-x8">
                  <input
                    type="checkbox"
                    name="hiddenFromDirectSelection"
                    checked={form.hiddenFromDirectSelection}
                    onChange={handleChange}
                  />
                  Hide from customer's direct service selection
                </label>
                <p className="admin-service-manage-x7">
                  For the two upgraded cleaning tiers (Deep Cleaning, Pull-down Deep Cleaning) - resolved
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
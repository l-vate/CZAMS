import { useState, useEffect, useCallback } from 'react';
import AdminLayout from './admin_layout';
import { attempt, orFallback } from '../../services/apiClient';
import { listPromos, createPromo, updatePromo, deletePromo } from '../../services/promotionService';
import { listAllServices } from '../../services/serviceCatalogService';
import { manilaToday, describeDiscount } from '../../utils/promos';
import { SERVICE_TYPE } from '../../constants/serviceTypes';

// default window: today for 30 days
function defaultEnd() {
  const d = new Date(manilaToday() + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}

const EMPTY = {
  name: '', description: '', services: [], minUnits: '1',
  discountType: 'percent', discountValue: '', startDate: '', endDate: '', isActive: true,
};

function statusOf(promo) {
  const today = manilaToday();
  if (!promo.isActive) return { label: 'Inactive', className: 'tech-status-cancelled' };
  if (promo.endDate < today) return { label: 'Expired', className: 'tech-status-cancelled' };
  if (promo.startDate > today) return { label: 'Starts ' + promo.startDate, className: 'tech-status-pending' };
  return { label: 'Running', className: 'tech-status-completed' };
}

// Promotional packages: admin-made discounts tied to one or more services, with an optional
// minimum number of units ("clean 3 or more units, get 10% off"). A qualifying order gets the
// best promo automatically. A promo and a Senior/PWD discount never stack: the larger applies.
function Promotions() {
  const [promos, setPromos] = useState([]);
  const [services, setServices] = useState([]);
  const [form, setForm] = useState({ ...EMPTY, startDate: manilaToday(), endDate: defaultEnd() });
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [promoList, all] = await Promise.all([
        orFallback(listPromos(), []),
        orFallback(listAllServices(), []),
      ]);
      setPromos(promoList);
      setServices(all.filter((s) => !s.hiddenFromDirectSelection && s.serviceType !== SERVICE_TYPE.LEAK_REPAIR));
    } catch (err) {
      console.error('Error loading promos:', err);
      setError('Could not load promotions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reset = () => {
    setEditingId(null);
    setForm({ ...EMPTY, startDate: manilaToday(), endDate: defaultEnd() });
    setError('');
  };

  const toggleService = (id) =>
    setForm((prev) => ({
      ...prev,
      services: prev.services.includes(id) ? prev.services.filter((s) => s !== id) : [...prev.services, id],
    }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const fields = { ...form, minUnits: form.minUnits === '' ? 1 : Number(form.minUnits), discountValue: Number(form.discountValue) };
      const saved = await attempt(editingId ? updatePromo(editingId, fields) : createPromo(fields), 'Could not save the promotion.');
      if (saved.error) {
        setError(saved.error);
        return;
      }
      reset();
      await load();
    } catch (err) {
      console.error('Error saving promo:', err);
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const edit = (promo) => {
    setEditingId(promo._id);
    setForm({
      name: promo.name, description: promo.description || '', services: promo.services || [],
      minUnits: String(promo.minUnits || 1), discountType: promo.discountType, discountValue: String(promo.discountValue),
      startDate: promo.startDate, endDate: promo.endDate, isActive: promo.isActive,
    });
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleActive = async (promo) => {
    const updated = await attempt(updatePromo(promo._id, { isActive: !promo.isActive }), 'Could not update the promotion.');
    if (updated.error) setError(updated.error);
    await load();
  };

  const remove = async (promo) => {
    if (!window.confirm(`Delete "${promo.name}"? Bookings that already used it keep their discount.`)) return;
    const removed = await attempt(deletePromo(promo._id), 'Could not delete the promotion.');
    if (removed.error) setError(removed.error);
    if (editingId === promo._id) reset();
    await load();
  };

  const serviceName = (id) => services.find((s) => s._id === id)?.name || 'Unknown service';

  return (
    <AdminLayout title="Promotions">
      <h1 className="dashboard-welcome">Promotions</h1>
      <p className="bs-card-sub">
        A promo is a discount for chosen services, optionally only when a minimum number of units is booked. A booking that
        qualifies gets the best promo automatically. A promo and a Senior/PWD discount do not stack: the larger one applies.
      </p>

      <form className="bs-card" onSubmit={submit}>
        <h3 className="bs-card-title">{editingId ? 'Edit promotion' : 'Create a promotion'}</h3>

        <div className="bs-two-col">
          <div className="bs-field-group">
            <label className="bs-label" htmlFor="promo-name">Name</label>
            <input id="promo-name" className="bs-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Clean 3 or more" />
          </div>
          <div className="bs-field-group">
            <label className="bs-label" htmlFor="promo-min">Minimum units</label>
            <input id="promo-min" type="number" min="1" step="1" className="bs-input" value={form.minUnits} onChange={(e) => setForm({ ...form, minUnits: e.target.value })} />
          </div>
        </div>

        <div className="bs-field-group">
          <label className="bs-label" htmlFor="promo-desc">Description <span className="bs-label-hint">(Optional, shown on the website)</span></label>
          <input id="promo-desc" className="bs-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>

        <div className="bs-two-col">
          <div className="bs-field-group">
            <label className="bs-label" htmlFor="promo-type">Discount type</label>
            <select id="promo-type" className="bs-select" value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}>
              <option value="percent">Percent off</option>
              <option value="fixed">Fixed amount off (₱)</option>
            </select>
          </div>
          <div className="bs-field-group">
            <label className="bs-label" htmlFor="promo-value">{form.discountType === 'percent' ? 'Percent (1 to 100)' : 'Amount in pesos'}</label>
            <input id="promo-value" type="number" min="1" className="bs-input" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} />
          </div>
          <div className="bs-field-group">
            <label className="bs-label" htmlFor="promo-start">Starts</label>
            <input id="promo-start" type="date" className="bs-input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div className="bs-field-group">
            <label className="bs-label" htmlFor="promo-end">Ends (included)</label>
            <input id="promo-end" type="date" className="bs-input" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
        </div>

        <div className="bs-field-group">
          <label className="bs-label">Services <span className="bs-label-hint">(leave all unticked to cover every service)</span></label>
          <div className="dp-radio-grid">
            {services.map((s) => (
              <label key={s._id} className="dp-radio-label">
                <input type="checkbox" className="dp-radio-input" checked={form.services.includes(s._id)} onChange={() => toggleService(s._id)} />
                {s.name}
              </label>
            ))}
          </div>
        </div>

        <label className="dp-radio-label admin-promotions-x1">
          <input type="checkbox" className="dp-radio-input" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          Active
        </label>

        {error && <p className="ma-form-error">{error}</p>}
        <div className="admin-promotions-x2">
          <button type="submit" className="svc-btn svc-btn-primary" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Save promotion' : 'Create promotion'}</button>
          {editingId && <button type="button" className="svc-btn svc-btn-ghost" onClick={reset}>Cancel</button>}
        </div>
      </form>

      {loading ? (
        <p>Loading promotions...</p>
      ) : promos.length === 0 ? (
        <p className="svc-empty">No promotions yet.</p>
      ) : (
        <div className="tech-job-list">
          {promos.map((promo) => {
            const status = statusOf(promo);
            return (
              <div className="tech-job-card" key={promo._id}>
                <div className="tech-job-info">
                  <div className="tech-job-top-row">
                    <span className={`tech-job-status-badge ${status.className}`}>{status.label}</span>
                  </div>
                  <div className="tech-job-service">{promo.name} <small>({describeDiscount(promo)})</small></div>
                  <small className="tech-job-booking">
                    {promo.services.length === 0 ? 'All services' : promo.services.map(serviceName).join(', ')}
                    {' · '}{promo.minUnits > 1 ? `${promo.minUnits} or more units` : 'any number of units'}
                    {' · '}{promo.startDate} to {promo.endDate}
                  </small>
                </div>
                <div className="admin-promotions-x3">
                  <button type="button" className="view-details-btn" onClick={() => edit(promo)}>Edit</button>
                  <button type="button" className="view-details-btn" onClick={() => toggleActive(promo)}>{promo.isActive ? 'Deactivate' : 'Activate'}</button>
                  <button type="button" className="view-details-btn" onClick={() => remove(promo)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}

export default Promotions;

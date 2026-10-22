import { useCallback, useEffect, useState } from 'react';
import AdminLayout from './admin_layout';
import { attempt, orFallback } from '../../services/apiClient';
import { listSuppliedUnits, addSuppliedUnit, updateSuppliedUnit, setSuppliedUnitActive, deleteSuppliedUnit } from '../../services/suppliedUnitService';
import { UNIT_TYPES } from '../../constants/unitTypes';
import { HP_OPTIONS } from '../../constants/unitOptions';
import { formatPeso } from '../../utils/bookingPricing';

const EMPTY = { brand: '', model: '', type: UNIT_TYPES[0], hp: HP_OPTIONS[2], inverter: 'true', price: '' };

// The units the company can supply for an installation. The list starts empty: the owner enters the real units and prices. A customer
// booking an installation with a company unit picks from the active ones that fit the unit type and horsepower they chose; a unit that is
// not listed can be requested, and the owner settles it on the booking. A unit that a booking used is never removed for good: deleting it
// hides it, and that booking keeps its own copy of the brand, model and price.
function SuppliedUnits() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setItems(await orFallback(listSuppliedUnits(), []));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const reset = () => { setForm(EMPTY); setEditingId(null); };
  const edit = (item) => {
    setEditingId(item._id);
    setForm({ brand: item.brand, model: item.model || '', type: item.type, hp: item.hp, inverter: String(item.inverter), price: String(item.price) });
    setError('');
    setNotice('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    const body = { brand: form.brand, model: form.model, type: form.type, hp: form.hp, inverter: form.inverter === 'true', price: form.price };
    setSaving(true);
    try {
      const result = await attempt(editingId ? updateSuppliedUnit(editingId, body) : addSuppliedUnit(body), 'Could not save the unit.');
      if (result.error) { setError(result.error); return; }
      reset();
      await load();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const act = async (call, fallback) => {
    setError('');
    setNotice('');
    try {
      const result = await attempt(call(), fallback);
      if (result.error) { setError(result.error); return; }
      if (result.data?.archived) setNotice('A booking used this unit, so it was hidden instead of deleted. That booking keeps its own copy.');
      await load();
    } catch {
      setError('Network error. Please try again.');
    }
  };

  const remove = (item) => {
    if (window.confirm(`Delete ${item.brand} ${item.model || ''}? A unit that a booking used is hidden instead, so that booking keeps its copy.`)) {
      act(() => deleteSuppliedUnit(item._id), 'Could not delete the unit.');
    }
  };

  return (
    <AdminLayout title="Supplied Units">
      <h1 className="dashboard-welcome">Supplied Units</h1>
      <p className="bs-card-sub">
        The units we can supply for an installation. Customers choose from the active ones that fit the unit type and horsepower they picked.
        Changing a unit never changes a booking that already used it.
      </p>

      <form className="bs-card" onSubmit={submit}>
        <h3 className="bs-card-title">{editingId ? 'Change this unit' : 'Add a unit'}</h3>
        <div className="scope-form">
          <label>
            Brand
            <input className="ma-input" type="text" maxLength={40} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} required />
          </label>
          <label>
            Model (optional)
            <input className="ma-input" type="text" maxLength={40} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </label>
          <label>
            Type
            <select className="ma-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {UNIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>
            Horsepower
            <select className="ma-input" value={form.hp} onChange={(e) => setForm({ ...form, hp: e.target.value })}>
              {HP_OPTIONS.map((hp) => <option key={hp} value={hp}>{hp} HP</option>)}
            </select>
          </label>
          <label>
            Inverter
            <select className="ma-input" value={form.inverter} onChange={(e) => setForm({ ...form, inverter: e.target.value })}>
              <option value="true">Inverter</option>
              <option value="false">Non-inverter</option>
            </select>
          </label>
          <label>
            Price of one unit (₱)
            <input className="ma-input" type="number" min="0" step="any" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
          </label>
        </div>
        {error && <p className="ma-form-error" role="alert">{error}</p>}
        <div className="admin-promotions-x2">
          <button type="submit" className="svc-btn svc-btn-primary" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Save changes' : 'Add unit'}</button>
          {editingId && <button type="button" className="svc-btn svc-btn-ghost" onClick={reset}>Cancel</button>}
        </div>
      </form>

      {notice && <p className="closure-warning" role="status">{notice}</p>}

      {loading ? (
        <p>Loading the units...</p>
      ) : items.length === 0 ? (
        <p className="svc-empty">No units yet. Add the units we supply, with their prices. Until then customers can only ask the owner for a unit.</p>
      ) : (
        <div className="tech-job-list">
          {items.map((item) => (
            <div className="tech-job-card" key={item._id}>
              <div className="tech-job-info">
                <div className="tech-job-top-row">
                  <span className={`tech-job-status-badge ${item.isActive ? 'tech-status-completed' : 'tech-status-cancelled'}`}>{item.isActive ? 'Active' : 'Hidden from customers'}</span>
                </div>
                <div className="tech-job-service">{item.brand} {item.model} <small>({item.inverter ? 'inverter' : 'non-inverter'})</small></div>
                <small className="tech-job-booking">{item.type} · {item.hp} HP · {formatPeso(item.price)} each</small>
              </div>
              <div className="admin-promotions-x3">
                <button type="button" className="view-details-btn" onClick={() => edit(item)}>Edit</button>
                <button type="button" className="view-details-btn" onClick={() => act(() => setSuppliedUnitActive(item._id, !item.isActive), 'Could not update the unit.')}>{item.isActive ? 'Deactivate' : 'Activate'}</button>
                <button type="button" className="view-details-btn" onClick={() => remove(item)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}

export default SuppliedUnits;

// The catalog of units Cooling Zone can supply for an installation. The admin adds, edits, deactivates and deletes items; a customer (or the
// admin booking for a walk-in) only reads the active ones, filtered by the unit type and horsepower already chosen. Staff have no access.
// Every change is written to the audit log. A unit a booking already used is never removed for good: deleting it hides it instead.
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const { allowRoles, ROLE } = require('../middleware/roles');
const SuppliedUnit = require('../models/SuppliedUnit');
const Booking = require('../models/Booking');
const { recordAudit } = require('../utils/audit');
const { sendProblem } = require('../utils/validation');
const { sendRouteError } = require('../utils/routeErrors');
const { loadRules } = require('../utils/bookingValidation');
const { readCatalogInput, sameItem, sameHp } = require('../utils/suppliedUnits');

const shape = (u) => ({ _id: String(u._id), brand: u.brand, model: u.model || '', type: u.type, hp: u.hp, inverter: u.inverter, price: u.price, isActive: u.isActive !== false });
const labelOf = (u) => [u.brand, u.model].filter(Boolean).join(' ');
const auditMeta = (u) => ({ brand: u.brand, model: u.model || '', type: u.type, hp: u.hp, inverter: u.inverter, price: u.price, isActive: u.isActive !== false });

async function audit(req, action, item, summary, extra = {}) {
  await recordAudit({ actor: { id: req.userId, role: req.userRole }, action, entityType: 'SuppliedUnit', entityId: String(item._id), summary, meta: { ...auditMeta(item), ...extra } });
}

const validId = (id) => mongoose.isValidObjectId(id);

// The catalog. A customer gets the active items, and `?type=` and `?hp=` narrow it to the unit they chose. The admin gets every item that
// has not been deleted, and may narrow it the same way.
router.get('/', auth, allowRoles(ROLE.CUSTOMER, ROLE.ADMIN), async (req, res) => {
  try {
    const filter = { isDeleted: { $ne: true } };
    if (req.userRole !== ROLE.ADMIN) filter.isActive = true;
    if (typeof req.query.type === 'string' && req.query.type) filter.type = req.query.type;
    let items = await SuppliedUnit.find(filter).sort({ brand: 1, model: 1, hp: 1 });
    if (req.query.hp !== undefined && req.query.hp !== '') items = items.filter((u) => sameHp(u.hp, req.query.hp));
    res.json(items.map(shape));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// A short readable list of the brands Cooling Zone supplies right now (active items only).
router.get('/brands', auth, allowRoles(ROLE.CUSTOMER, ROLE.ADMIN), async (req, res) => {
  try {
    const items = await SuppliedUnit.find({ isDeleted: { $ne: true }, isActive: true });
    const brands = [...new Set(items.map((u) => u.brand.trim()))].sort((a, b) => a.localeCompare(b));
    res.json({ brands });
  } catch (err) {
    sendRouteError(res, err);
  }
});

async function findDuplicate(values, exceptId) {
  const same = await SuppliedUnit.find({ isDeleted: { $ne: true }, type: values.type });
  return same.find((u) => String(u._id) !== String(exceptId) && sameItem(u, values));
}

router.post('/', auth, allowRoles(ROLE.ADMIN), async (req, res) => {
  try {
    const { UNIT_TYPES } = await loadRules();
    const input = readCatalogInput(req.body || {}, UNIT_TYPES);
    if (input.problem) return sendProblem(res, input.problem);
    if (await findDuplicate(input.values)) return res.status(409).json({ message: 'That unit is already in the catalog.' });
    const created = await SuppliedUnit.create({ ...input.values, isActive: req.body.isActive !== false, createdBy: req.userId });
    await audit(req, 'supplied_unit.create', created, `Added a supplied unit: ${labelOf(created)}`);
    res.status(201).json(shape(created));
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.put('/:id', auth, allowRoles(ROLE.ADMIN), async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ message: 'That unit does not exist.' });
    const item = await SuppliedUnit.findById(req.params.id);
    if (!item || item.isDeleted) return res.status(404).json({ message: 'That unit does not exist.' });
    const { UNIT_TYPES } = await loadRules();
    const input = readCatalogInput({ ...shape(item), ...req.body }, UNIT_TYPES);
    if (input.problem) return sendProblem(res, input.problem);
    if (await findDuplicate(input.values, item._id)) return res.status(409).json({ message: 'That unit is already in the catalog.' });
    const before = auditMeta(item);
    Object.assign(item, input.values);
    await item.save();
    await audit(req, 'supplied_unit.update', item, `Changed a supplied unit: ${labelOf(item)}`, { before });
    res.json(shape(item));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Deactivate (hide it from customers) or activate again.
router.patch('/:id/active', auth, allowRoles(ROLE.ADMIN), async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ message: 'That unit does not exist.' });
    if (typeof req.body?.isActive !== 'boolean') return res.status(400).json({ message: 'Say whether the unit is active or not.' });
    const item = await SuppliedUnit.findById(req.params.id);
    if (!item || item.isDeleted) return res.status(404).json({ message: 'That unit does not exist.' });
    item.isActive = req.body.isActive;
    await item.save();
    await audit(req, item.isActive ? 'supplied_unit.activate' : 'supplied_unit.deactivate', item, `${item.isActive ? 'Activated' : 'Deactivated'} a supplied unit: ${labelOf(item)}`);
    res.json(shape(item));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Delete. A unit no booking used is removed for good; one a booking used is only hidden (soft delete), so that booking's history stays.
router.delete('/:id', auth, allowRoles(ROLE.ADMIN), async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ message: 'That unit does not exist.' });
    const item = await SuppliedUnit.findById(req.params.id);
    if (!item || item.isDeleted) return res.status(404).json({ message: 'That unit does not exist.' });
    const used = await Booking.exists({ 'units.supplied.catalogId': String(item._id) });
    if (used) {
      item.isDeleted = true;
      item.isActive = false;
      await item.save();
      await audit(req, 'supplied_unit.archive', item, `Removed a supplied unit that bookings used (kept for their history): ${labelOf(item)}`);
      return res.json({ message: 'Removed. Bookings that used it keep their copy.', archived: true });
    }
    await SuppliedUnit.deleteOne({ _id: item._id });
    await audit(req, 'supplied_unit.delete', item, `Deleted a supplied unit: ${labelOf(item)}`);
    res.json({ message: 'Deleted.', archived: false });
  } catch (err) {
    sendRouteError(res, err);
  }
});

module.exports = router;

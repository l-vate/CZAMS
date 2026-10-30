const { ROLE } = require('../constants/roles');
const auditSpecs = require('../utils/auditSpecs');
const express = require('express');
const router = express.Router();
const { requireObjectId } = require('../utils/idParam');
requireObjectId(router, 'id');
const auth = require('../middleware/auth');
const { sendRouteError } = require('../utils/routeErrors');
const Promo = require('../models/Promo');
const Service = require('../models/Service');
const { manilaTodayKey } = require('../utils/timeBlocks');
const { isInForce } = require('../utils/promos');
const { invalid, sendProblem } = require('../utils/validation');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const { EARLIEST_DATE } = require('../utils/dateRules');
const validDate = (s) => DATE_PATTERN.test(String(s)) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// Returns null when fine, otherwise { status, message }. Used by create and update.
async function validate(body) {
  if (!body.name || !String(body.name).trim()) return invalid('A promo name is required.');
  if (!['percent', 'fixed'].includes(body.discountType)) return invalid('Choose a percent or a fixed amount discount.');
  const value = Number(body.discountValue);
  if (!Number.isFinite(value)) return invalid('Enter the discount value.');
  if (body.discountType === 'percent' && (value < 1 || value > 100)) return invalid('A percent discount must be between 1 and 100.');
  if (body.discountType === 'fixed' && !(value > 0)) return invalid('A fixed discount must be greater than 0.');
  const minUnits = body.minUnits === undefined || body.minUnits === '' ? 1 : Number(body.minUnits);
  if (!Number.isInteger(minUnits) || minUnits < 1) return invalid('The minimum number of units must be a whole number, 1 or more.');
  if (!validDate(body.startDate) || !validDate(body.endDate)) return invalid('Choose a start date and an end date.');
  if (body.endDate < body.startDate) return invalid('The end date cannot be before the start date.');
  if (body.startDate < EARLIEST_DATE) return invalid(`The start date cannot be before ${EARLIEST_DATE}.`);
  if (body.services !== undefined) {
    if (!Array.isArray(body.services)) return invalid('Services must be a list.');
    if (body.services.length > 0) {
      const found = await Service.countDocuments({ _id: { $in: body.services } });
      if (found !== new Set(body.services).size) return invalid('One of the chosen services does not exist.');
    }
  }
  return null;
}

const pick = (body) => ({
  name: String(body.name).trim(),
  description: (body.description || '').trim(),
  services: [...new Set(body.services || [])],
  minUnits: body.minUnits === undefined || body.minUnits === '' ? 1 : Number(body.minUnits),
  discountType: body.discountType,
  discountValue: Number(body.discountValue),
  startDate: body.startDate,
  endDate: body.endDate,
  isActive: body.isActive === undefined ? true : !!body.isActive,
});

// Promos currently in force, for the landing page and the booking forms. No login needed: it
// only returns what a visitor could be offered anyway.
router.get('/public', async (req, res) => {
  try {
    const today = manilaTodayKey();
    const promos = await Promo.find({ isActive: true, startDate: { $lte: today }, endDate: { $gte: today } }).sort({ createdAt: 1 });
    const serviceNames = new Map((await Service.find({}).select('name')).map((s) => [s._id, s.name]));
    res.json(promos.filter((p) => isInForce(p, today)).map((p) => ({
      _id: p._id,
      name: p.name,
      description: p.description,
      services: p.services,
      serviceNames: p.services.map((id) => serviceNames.get(id)).filter(Boolean),
      minUnits: p.minUnits,
      discountType: p.discountType,
      discountValue: p.discountValue,
      startDate: p.startDate,
      endDate: p.endDate,
      isActive: p.isActive,
    })));
  } catch (err) {
    sendRouteError(res, err);
  }
});

function adminOnly(req, res, next) {
  if (req.userRole !== ROLE.ADMIN) return res.status(403).json({ message: 'Forbidden' });
  next();
}

router.get('/', auth, adminOnly, async (req, res) => {
  try {
    res.json(await Promo.find().sort({ createdAt: -1 }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.post('/', auth, adminOnly, auditSpecs.promoCreate, async (req, res) => {
  try {
    const problem = await validate(req.body);
    if (problem) return sendProblem(res, problem);
    res.status(201).json(await Promo.create(pick(req.body)));
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.put('/:id', auth, adminOnly, auditSpecs.promoUpdate, async (req, res) => {
  try {
    const promo = await Promo.findById(req.params.id);
    if (!promo) return res.status(404).json({ message: 'Promo not found' });

    const merged = { ...promo.toObject(), ...req.body };
    const problem = await validate(merged);
    if (problem) return sendProblem(res, problem);

    Object.assign(promo, pick(merged));
    await promo.save();
    res.json(promo);
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Bookings keep their own copy of the promo they got (name, type, value), so deleting or
// editing a promo never changes a booking that already used it.
router.delete('/:id', auth, adminOnly, auditSpecs.promoDelete, async (req, res) => {
  try {
    const promo = await Promo.findByIdAndDelete(req.params.id);
    if (!promo) return res.status(404).json({ message: 'Promo not found' });
    res.json({ message: 'Promo deleted' });
  } catch (err) {
    sendRouteError(res, err);
  }
});

module.exports = router;

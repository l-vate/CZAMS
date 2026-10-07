const { ROLE } = require('../constants/roles');
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Promo = require('../models/Promo');
const Service = require('../models/Service');
const { manilaTodayKey } = require('../utils/timeBlocks');
const { isInForce } = require('../utils/promos');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s) => DATE_PATTERN.test(String(s)) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// Returns an error message, or null. Used by create and update.
async function validate(body) {
  if (!body.name || !String(body.name).trim()) return 'A promo name is required.';
  if (!['percent', 'fixed'].includes(body.discountType)) return 'Choose a percent or a fixed amount discount.';
  const value = Number(body.discountValue);
  if (!Number.isFinite(value)) return 'Enter the discount value.';
  if (body.discountType === 'percent' && (value < 1 || value > 100)) return 'A percent discount must be between 1 and 100.';
  if (body.discountType === 'fixed' && !(value > 0)) return 'A fixed discount must be greater than 0.';
  const minUnits = body.minUnits === undefined || body.minUnits === '' ? 1 : Number(body.minUnits);
  if (!Number.isInteger(minUnits) || minUnits < 1) return 'The minimum number of units must be a whole number, 1 or more.';
  if (!validDate(body.startDate) || !validDate(body.endDate)) return 'Choose a start date and an end date.';
  if (body.endDate < body.startDate) return 'The end date cannot be before the start date.';
  if (body.services !== undefined) {
    if (!Array.isArray(body.services)) return 'Services must be a list.';
    if (body.services.length > 0) {
      const found = await Service.countDocuments({ _id: { $in: body.services } });
      if (found !== new Set(body.services).size) return 'One of the chosen services does not exist.';
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
    console.error(err);
    res.status(500).json({ message: 'Server error' });
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
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const problem = await validate(req.body);
    if (problem) return res.status(400).json({ message: problem });
    res.status(201).json(await Promo.create(pick(req.body)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const promo = await Promo.findById(req.params.id);
    if (!promo) return res.status(404).json({ message: 'Promo not found' });

    const merged = { ...promo.toObject(), ...req.body };
    const problem = await validate(merged);
    if (problem) return res.status(400).json({ message: problem });

    Object.assign(promo, pick(merged));
    await promo.save();
    res.json(promo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Bookings keep their own copy of the promo they got (name, type, value), so deleting or
// editing a promo never changes a booking that already used it.
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const promo = await Promo.findByIdAndDelete(req.params.id);
    if (!promo) return res.status(404).json({ message: 'Promo not found' });
    res.json({ message: 'Promo deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

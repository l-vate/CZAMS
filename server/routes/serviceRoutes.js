const { SERVICE_TYPE } = require('../constants/serviceTypes');
const { ROLE } = require('../constants/roles');
const auditSpecs = require('../utils/auditSpecs');
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const { serviceInputProblem } = require('../utils/adminInput');
const { sendProblem } = require('../utils/validation');
const { sendRouteError } = require('../utils/routeErrors');
const auth = require('../middleware/auth');

// GET all active services, safe fields only (no auth - Landing Page Module public
// search). Kept separate from the auth-gated route below rather than loosening it.
router.get('/public', async (req, res) => {
  try {
    const services = await Service.find({ isActive: true, isArchived: { $ne: true } })
      .select('name description price durationMinutes category icon serviceType unitTypePricing hiddenFromDirectSelection')
      .sort({ category: 1, name: 1 });
    res.json(services);
  } catch (err) {
    sendRouteError(res, err);
  }
});

// GET all active services (any logged-in user)
router.get('/', auth, async (req, res) => {
  try {
    const services = await Service.find({ isActive: true, isArchived: { $ne: true } }).sort({ category: 1, name: 1 });
    res.json(services);
  } catch (err) {
    sendRouteError(res, err);
  }
});

// GET all services regardless of active status (admin services.jsx page)
router.get('/admin/all', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const services = await Service.find({}).sort({ category: 1, name: 1 });
    res.json(services);
  } catch (err) {
    sendRouteError(res, err);
  }
});

// GET single service by id (any logged-in user)
router.get('/:id', auth, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: 'Service not found' });
    res.json(service);
  } catch (err) {
    sendRouteError(res, err);
  }
});

// POST create new service
router.post('/', auth, auditSpecs.serviceCreate, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { minTechnicians } = req.body;
    if (minTechnicians !== undefined && minTechnicians !== null && minTechnicians !== '' && ![1, 2].includes(Number(minTechnicians))) {
      return res.status(400).json({ message: 'Technicians needed must be 1 or 2.' });
    }
    const input = serviceInputProblem(req.body, { creating: true });
    if (input.problem) return sendProblem(res, input.problem);

    const service = await Service.create({
      _id: crypto.randomUUID(),
      description: '',
      durationMinutes: 0,
      category: '',
      icon: '',
      isActive: true,
      serviceType: SERVICE_TYPE.OTHER,
      unitTypePricing: [],
      hiddenFromDirectSelection: false,
      ...input.values,
      ...(minTechnicians !== undefined && minTechnicians !== null && minTechnicians !== '' ? { minTechnicians: Number(minTechnicians) } : {}),
    });

    res.status(201).json(service);
  } catch (err) {
    sendRouteError(res, err);
  }
});

// PUT update existing service. Changes apply to bookings made afterwards: a booking keeps the prices it was made at.
router.put('/:id', auth, auditSpecs.serviceUpdate, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { minTechnicians } = req.body;
    if (minTechnicians !== undefined && minTechnicians !== null && minTechnicians !== '' && ![1, 2].includes(Number(minTechnicians))) {
      return res.status(400).json({ message: 'Technicians needed must be 1 or 2.' });
    }

    const current = await Service.findById(req.params.id);
    if (!current) return res.status(404).json({ message: 'Service not found' });

    const input = serviceInputProblem(req.body, { creating: false, current });
    if (input.problem) return sendProblem(res, input.problem);

    const update = { ...input.values };
    // blank = back to the default (1 for a Check-up, 2 for everything else)
    if (minTechnicians !== undefined) {
      update[minTechnicians === null || minTechnicians === '' ? '$unset' : 'minTechnicians'] =
        minTechnicians === null || minTechnicians === '' ? { minTechnicians: 1 } : Number(minTechnicians);
    }

    const service = await Service.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    if (!service) return res.status(404).json({ message: 'Service not found' });
    res.json(service);
  } catch (err) {
    sendRouteError(res, err);
  }
});

// PATCH toggle active status
router.patch('/:id/toggle-active', auth, auditSpecs.serviceToggle, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: 'Service not found' });

    service.isActive = !service.isActive;
    await service.save();
    res.json(service);
  } catch (err) {
    sendRouteError(res, err);
  }
});

// "Delete" a service: it is archived, not removed. An archived service is hidden from customers and cannot be booked, and
// every old booking still resolves it (name, type, warranty). Only with ?hard=true, and only when no booking uses the
// service at all, is it removed for good; otherwise a 409 says why.
router.delete('/:id', auth, auditSpecs.serviceRemove, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: 'Service not found' });

    if (req.query.hard === 'true') {
      const used = await Booking.countDocuments({ service: service._id });
      if (used > 0) {
        return res.status(409).json({ message: `This service is used by ${used} booking${used === 1 ? '' : 's'} and cannot be deleted for good. Archive it instead: customers will no longer see it and old bookings keep it.` });
      }
      await Service.deleteOne({ _id: service._id });
      return res.json({ message: 'Service deleted' });
    }

    service.isArchived = true;
    service.isActive = false;
    await service.save();
    res.json({ message: 'Service archived. Old bookings keep it; customers no longer see it.', service });
  } catch (err) {
    console.error('Could not archive or delete a service:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
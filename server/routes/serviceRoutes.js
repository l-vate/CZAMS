const { SERVICE_TYPE } = require('../constants/serviceTypes');
const { ROLE } = require('../constants/roles');
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const auth = require('../middleware/auth');

// GET all active services, safe fields only (no auth - Landing Page Module public
// search). Kept separate from the auth-gated route below rather than loosening it.
router.get('/public', async (req, res) => {
  try {
    const services = await Service.find({ isActive: true, isArchived: { $ne: true } })
      .select('name description price durationMinutes category icon serviceType unitTypePricing hiddenFromDirectSelection')
      .sort({ category: 1, name: 1 });
    res.json(services);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET all active services (any logged-in user)
router.get('/', auth, async (req, res) => {
  try {
    const services = await Service.find({ isActive: true, isArchived: { $ne: true } }).sort({ category: 1, name: 1 });
    res.json(services);
  } catch {
    res.status(500).json({ message: 'Server error' });
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
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET single service by id (any logged-in user)
router.get('/:id', auth, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: 'Service not found' });
    res.json(service);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create new service
router.post('/', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { name, description, price, durationMinutes, category, icon, isActive, serviceType, unitTypePricing, hiddenFromDirectSelection, minTechnicians } = req.body;

    if (minTechnicians !== undefined && minTechnicians !== null && minTechnicians !== '' && ![1, 2].includes(Number(minTechnicians))) {
      return res.status(400).json({ message: 'Technicians needed must be 1 or 2.' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }
    if (price === undefined || price === null || isNaN(price) || price < 0) {
      return res.status(400).json({ message: 'A valid price is required' });
    }

    const service = await Service.create({
      _id: crypto.randomUUID(),
      name: name.trim(),
      description: description || '',
      price,
      durationMinutes: durationMinutes || 0,
      category: category || '',
      icon: icon || '',
      isActive: isActive !== undefined ? isActive : true,
      serviceType: serviceType || SERVICE_TYPE.OTHER,
      unitTypePricing: Array.isArray(unitTypePricing) ? unitTypePricing : [],
      hiddenFromDirectSelection: !!hiddenFromDirectSelection,
      ...(minTechnicians !== undefined && minTechnicians !== null && minTechnicians !== '' ? { minTechnicians: Number(minTechnicians) } : {}),
    });

    res.status(201).json(service);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update existing service
router.put('/:id', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { name, description, price, durationMinutes, category, icon, isActive, isArchived, serviceType, unitTypePricing, hiddenFromDirectSelection, minTechnicians } = req.body;

    if (minTechnicians !== undefined && minTechnicians !== null && minTechnicians !== '' && ![1, 2].includes(Number(minTechnicians))) {
      return res.status(400).json({ message: 'Technicians needed must be 1 or 2.' });
    }
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ message: 'Name cannot be empty' });
    }
    if (price !== undefined && (isNaN(price) || price < 0)) {
      return res.status(400).json({ message: 'A valid price is required' });
    }

    const update = {};
    if (name !== undefined) update.name = name.trim();
    if (description !== undefined) update.description = description;
    if (price !== undefined) update.price = price;
    if (durationMinutes !== undefined) update.durationMinutes = durationMinutes;
    if (category !== undefined) update.category = category;
    if (icon !== undefined) update.icon = icon;
    if (isActive !== undefined) update.isActive = isActive;
    if (typeof isArchived === 'boolean') update.isArchived = isArchived;
    if (serviceType !== undefined) update.serviceType = serviceType;
    if (unitTypePricing !== undefined) update.unitTypePricing = Array.isArray(unitTypePricing) ? unitTypePricing : [];
    if (hiddenFromDirectSelection !== undefined) update.hiddenFromDirectSelection = !!hiddenFromDirectSelection;
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
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH toggle active status
router.patch('/:id/toggle-active', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: 'Service not found' });

    service.isActive = !service.isActive;
    await service.save();
    res.json(service);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// "Delete" a service: it is archived, not removed. An archived service is hidden from customers and cannot be booked, and
// every old booking still resolves it (name, type, warranty). Only with ?hard=true, and only when no booking uses the
// service at all, is it removed for good; otherwise a 409 says why.
router.delete('/:id', auth, async (req, res) => {
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
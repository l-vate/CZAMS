const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Service = require('../models/Service');
const auth = require('../middleware/auth');

// GET all active services (any logged-in user)
router.get('/', auth, async (req, res) => {
  try {
    const services = await Service.find({ isActive: true }).sort({ category: 1, name: 1 });
    res.json(services);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET all services regardless of active status (admin services.jsx page)
router.get('/admin/all', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const services = await Service.find({}).sort({ category: 1, name: 1 });
    res.json(services);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET single service by id (any logged-in user)
router.get('/:id', auth, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: 'Service not found' });
    res.json(service);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create new service
router.post('/', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { name, description, price, durationMinutes, category, icon, isActive, serviceType } = req.body;

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
      serviceType: serviceType || 'Other',
    });

    res.status(201).json(service);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update existing service
router.put('/:id', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { name, description, price, durationMinutes, category, icon, isActive, serviceType } = req.body;

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
    if (serviceType !== undefined) update.serviceType = serviceType;

    const service = await Service.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    if (!service) return res.status(404).json({ message: 'Service not found' });
    res.json(service);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH toggle active status
router.patch('/:id/toggle-active', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: 'Service not found' });

    service.isActive = !service.isActive;
    await service.save();
    res.json(service);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE a service
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) return res.status(404).json({ message: 'Service not found' });
    res.json({ message: 'Service deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
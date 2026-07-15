const express = require('express');
const router = express.Router();
const Service = require('../models/Service');

// GET all active services
router.get('/', async (req, res) => {
  try {
    const services = await Service.find({ isActive: true });
    res.json(services);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create new service (for admin services.jsx page later)
router.post('/', async (req, res) => {
  try {
    const service = await Service.create(req.body);
    res.status(201).json(service);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
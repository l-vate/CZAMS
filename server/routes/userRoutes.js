const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');

// GET users by role (e.g., /api/users?role=staff or /api/users?role=customer)
router.get('/', async (req, res) => {
  try {
    const { role } = req.query;
    const filter = {};
    
    if (role) {
      filter.role = role;
    }

    const users = await User.find(filter).sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create user (Technician or Client)
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, address, role, password } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const newUser = await User.create({
      _id: crypto.randomUUID(),
      name: name ? name.trim() : '',
      email: email.trim().toLowerCase(),
      password: password || 'DefaultPassword123!', // Ensure password handling matches your auth standard
      phone: phone ? phone.trim() : '',
      address: address ? address.trim() : '',
      role: role || 'customer',
      isActive: true,
    });

    res.status(201).json(newUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update user profile or status
router.put('/:id', async (req, res) => {
  try {
    const { name, email, phone, address, role, isActive } = req.body;

    const update = {};
    if (name !== undefined) update.name = name.trim();
    if (email !== undefined) update.email = email.trim().toLowerCase();
    if (phone !== undefined) update.phone = phone.trim();
    if (address !== undefined) update.address = address.trim();
    if (role !== undefined) update.role = role;
    if (isActive !== undefined) update.isActive = isActive;

    const updatedUser = await User.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(updatedUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const Booking = require('../models/Booking');
const auth = require('../middleware/auth');

// Customer Classification Module thresholds. Client-confirmed: commercial clients
// clean quarterly (4x/year), residential clean 3x/year — a flat 3 catches both
// segments, since commercial's 4x/year always clears it too, so no need to split
// the logic by client type. Kept as a named constant so a future change is still
// a one-line edit instead of a re-find-the-logic exercise.
const RETURN_CUSTOMER_MIN_BOOKINGS = 3;
const RETURN_CUSTOMER_WINDOW_MONTHS = 12;

// RETURN_CUSTOMER_MIN_BOOKINGS+ completed bookings within a rolling window
// auto-flags a customer as "Return" — re-evaluated fresh on every read rather
// than cached, so it naturally drops back to "Regular" if a Return customer goes
// quiet for a year with no new completion.
async function computeAutoClassification(customerId) {
  const windowStart = new Date();
  windowStart.setMonth(windowStart.getMonth() - RETURN_CUSTOMER_WINDOW_MONTHS);

  const completedCount = await Booking.countDocuments({
    customer: customerId,
    status: 'Completed',
    completedAt: { $gte: windowStart },
    // A free back-job repair visit isn't a new service the customer chose to book —
    // it's a redo of one already counted, so it shouldn't inflate the return-customer count.
    isBackJob: { $ne: true },
  });

  return completedCount >= RETURN_CUSTOMER_MIN_BOOKINGS ? 'Return' : 'Regular';
}

// A manual admin override always wins over the auto-computed value.
async function resolveClassification(user) {
  return user.manualClassification || computeAutoClassification(user._id);
}

// GET users by role (e.g., /api/users?role=staff or /api/users?role=customer)
router.get('/', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { role } = req.query;
    const filter = {};

    if (role) {
      filter.role = role;
    }

    const users = await User.find(filter).sort({ createdAt: -1 });

    // Classification only means anything for customers — leave staff/admin as-is.
    const enriched = await Promise.all(users.map(async (u) => {
      const userObj = u.toObject();
      if (u.role === 'customer') {
        userObj.classification = await resolveClassification(u);
      }
      return userObj;
    }));

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET the logged-in user's own record, including computed classification if they're a customer
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const userObj = user.toObject();
    if (user.role === 'customer') {
      userObj.classification = await resolveClassification(user);
    }
    res.json(userObj);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create user (Technician or Client)
router.post('/', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { name, email, phone, address, role, password, clientType } = req.body;

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
      ...(clientType !== undefined ? { clientType } : {}),
    });

    res.status(201).json(newUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update user profile or status
router.put('/:id', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { name, email, phone, address, role, isActive, clientType } = req.body;

    const update = {};
    if (name !== undefined) update.name = name.trim();
    if (email !== undefined) update.email = email.trim().toLowerCase();
    if (phone !== undefined) update.phone = phone.trim();
    if (address !== undefined) update.address = address.trim();
    if (role !== undefined) update.role = role;
    if (isActive !== undefined) update.isActive = isActive;
    if (clientType !== undefined) update.clientType = clientType;

    const updatedUser = await User.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userObj = updatedUser.toObject();
    if (updatedUser.role === 'customer') {
      userObj.classification = await resolveClassification(updatedUser);
    }
    res.json(userObj);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: manually set a customer's classification, or pass null to clear the
// override and go back to the auto-computed value.
router.patch('/:id/classification', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { classification } = req.body;
    if (classification !== null && !['Regular', 'Return'].includes(classification)) {
      return res.status(400).json({ message: 'Classification must be "Regular", "Return", or null to clear the override.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'customer') {
      return res.status(400).json({ message: 'Only customer accounts can be classified.' });
    }

    user.manualClassification = classification;
    await user.save();

    const userObj = user.toObject();
    userObj.classification = await resolveClassification(user);
    res.json(userObj);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
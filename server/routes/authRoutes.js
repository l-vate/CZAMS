// server/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Simple ID generator matching your ADM001-style pattern
function generateUserId(role) {
  const prefix = role === 'staff' ? 'STF' : role === 'admin' ? 'ADM' : 'CUS';
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${random}`;
}

router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, role, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // map frontend role values to backend schema values
    const roleMap = { client: 'customer', technician: 'staff' };
    const mappedRole = roleMap[role] || 'customer';

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      _id: generateUserId(mappedRole),
      name: `${firstName} ${lastName}`,
      email,
      phone,
      password: hashedPassword,
      role: mappedRole,
      isActive: true,
    });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt:', { email, password });

    const user = await User.findOne({ email });
    console.log('User found:', user);

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    let isMatch = false;
    if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      isMatch = password === user.password;
    }
    console.log('Password match:', isMatch, '| stored:', user.password, '| entered:', password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});



module.exports = router;
// server/routes/authRoutes.js
const { ROLE } = require('../constants/roles');
const express = require('express');
const router = express.Router();
const { hashPassword, verifyPassword } = require('../utils/password');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { readProfileFields } = require('../utils/profileFields');
const auth = require('../middleware/auth');
const path = require('path');
const { createUploader, IMAGE_TYPES, UPLOADS_ROOT } = require('../utils/uploadSafety');

// Simple ID generator matching your ADM001-style pattern
function generateUserId(role) {
  const prefix = role === ROLE.STAFF ? 'STF' : role === ROLE.ADMIN ? 'ADM' : 'CUS';
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${random}`;
}

// Profile photos: JPG, PNG or WEBP only, stored under a random name with an extension taken from
// the validated type, and the first bytes of the saved file are checked (utils/uploadSafety.js).
const upload = createUploader({
  dir: path.join(UPLOADS_ROOT, 'profile-images'),
  allowedTypes: IMAGE_TYPES,
});

router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, clientType } = req.body;

    // Company details only apply to a Commercial customer; anything else is ignored.
    const profile = readProfileFields({ role: ROLE.CUSTOMER, clientType, body: req.body });
    if (profile.problem) return res.status(profile.problem.status).json({ message: profile.problem.message });

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Public registration only ever creates a customer. Any role sent in the body is
    // ignored on purpose; technician and admin accounts are created by an admin
    // through POST /api/users.
    const mappedRole = ROLE.CUSTOMER;

    const hashedPassword = await hashPassword(password);

    const user = await User.create({
      _id: generateUserId(mappedRole),
      name: `${firstName} ${lastName}`,
      email,
      phone,
      password: hashedPassword,
      role: mappedRole,
      isActive: true,
      // Only meaningful for customer accounts - staff/admin registrations ignore it
      // and keep the schema default.
      ...(mappedRole === ROLE.CUSTOMER && clientType === 'Commercial' ? { clientType: 'Commercial' } : {}),
      ...profile.values,
});

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(201).json({
      token,
      user: {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    address: user.address,
    profileImage: user.profileImage,
    clientType: user.clientType,
    createdAt: user.createdAt,
  },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await verifyPassword(user, password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Checked only after the password is right, so this message can't be used to
    // probe which emails exist.
    if (user.isActive === false) {
      return res.status(403).json({ message: 'This account has been deactivated. Please contact the administrator.' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      token,
      user: {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    address: user.address,
    profileImage: user.profileImage,
    createdAt: user.createdAt,
  },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/profile', auth, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, address } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (email && email !== user.email) {
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    user.name = `${firstName} ${lastName}`.trim();
    user.email = email || user.email;
    user.phone = phone || user.phone;
    user.address = address || user.address;

    await user.save();

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        address: user.address,
        profileImage: user.profileImage,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/profile/photo', auth, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const imageUrl = `/uploads/profile-images/${req.file.filename}`;
    user.profileImage = imageUrl;
    await user.save();

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        address: user.address,
        profileImage: user.profileImage,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await verifyPassword(user, currentPassword);

    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    user.password = await hashPassword(newPassword);
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/account', auth, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET all active technicians (for client-side booking dropdown)
router.get('/technicians', async (req, res) => {
  try {
    const technicians = await User.find({ role: ROLE.STAFF, isActive: true }).select('_id name position');
    res.json(technicians);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
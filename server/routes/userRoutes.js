const { ROLE } = require('../constants/roles');
const auditSpecs = require('../utils/auditSpecs');
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { resolveClassification } = require('../utils/classification');
const { hashPassword, generateTemporaryPassword } = require('../utils/password');
const { invalid, sendProblem } = require('../utils/validation');
const { readProfileFields, readAgreedTerms } = require('../utils/profileFields');
const Booking = require('../models/Booking');
const BackJob = require('../models/BackJob');
const { summarizeHistory } = require('../utils/customerHistory');
const { clearAuthCache } = require('../utils/authCache');

const CLIENT_TYPES = ['Residential', 'Commercial'];
const clientTypeProblem = (value) => (CLIENT_TYPES.includes(value) ? null : invalid('Client type must be Residential or Commercial.'));

// The system must always keep at least one active admin. Returns null when the change is fine,
// otherwise { status, message }. `target` is the account being changed, `changes` the requested
// { role, isActive }, `actingId` the admin making the request.
async function validateAdminSafety(target, changes, actingId) {
  if (target.role !== ROLE.ADMIN) return null;

  const losesAdminRole = changes.role !== undefined && changes.role !== ROLE.ADMIN;
  if (losesAdminRole && String(target._id) === String(actingId)) {
    return invalid('You cannot change your own role.');
  }

  const getsDeactivated = changes.isActive === false && target.isActive !== false;
  if (!losesAdminRole && !getsDeactivated) return null;

  const otherActiveAdmins = await User.countDocuments({ role: ROLE.ADMIN, isActive: { $ne: false }, _id: { $ne: target._id } });
  if (otherActiveAdmins === 0) {
    return invalid(losesAdminRole
      ? 'This is the last active admin. Make another account an active admin before changing the role of this account.'
      : 'This is the last active admin. Activate or create another admin before deactivating this account.');
  }
  return null;
}

// GET users by role (e.g., /api/users?role=staff or /api/users?role=customer)
router.get('/', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { role } = req.query;
    const filter = {};

    if (role) {
      filter.role = role;
    }

    const users = await User.find(filter).sort({ createdAt: -1 });

    // Classification only means anything for customers - leave staff/admin as-is.
    const enriched = await Promise.all(users.map(async (u) => {
      const userObj = u.toObject();
      if (u.role === ROLE.CUSTOMER) {
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
    if (user.role === ROLE.CUSTOMER) {
      userObj.classification = await resolveClassification(user);
    }
    res.json(userObj);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// A customer's history summary: latest bookings, counts, total paid and the feedback they gave.
async function loadHistory(customerId) {
  const [bookings, backJobClaims] = await Promise.all([
    Booking.find({ customer: customerId }).populate('service', 'name price unitTypePricing').lean(),
    BackJob.countDocuments({ customer: customerId }),
  ]);
  return summarizeHistory(bookings, backJobClaims);
}

// The logged-in customer's own history, for the profile page. Always the caller's own id.
router.get('/me/history', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.CUSTOMER) return res.status(403).json({ message: 'Forbidden' });
    res.json(await loadHistory(req.userId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: any customer's history, for the account modal.
router.get('/:id/history', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) return res.status(403).json({ message: 'Forbidden' });
    const customer = await User.findOne({ _id: req.params.id, role: ROLE.CUSTOMER }).select('_id');
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.json(await loadHistory(customer._id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create user (Technician or Client)
router.post('/', auth, auditSpecs.userCreate, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
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

    const accountRole = role || ROLE.CUSTOMER;
    if (clientType !== undefined && accountRole === ROLE.CUSTOMER) {
      const problem = clientTypeProblem(clientType);
      if (problem) return sendProblem(res, problem);
    }

    const profile = readProfileFields({
      role: accountRole,
      clientType: accountRole === ROLE.CUSTOMER ? (clientType || 'Residential') : undefined,
      body: req.body,
    });
    if (profile.problem) return sendProblem(res, profile.problem);

    // No password typed (a walk-in): make a random one and hand it back once, in this response only.
    const typedPassword = typeof password === 'string' && password.length > 0 ? password : null;
    const plainPassword = typedPassword || generateTemporaryPassword();

    const newUser = await User.create({
      _id: crypto.randomUUID(),
      name: name ? name.trim() : '',
      email: email.trim().toLowerCase(),
      password: await hashPassword(plainPassword),
      phone: phone ? phone.trim() : '',
      address: address ? address.trim() : '',
      role: accountRole,
      isActive: true,
      // Only customers have a client type.
      ...(clientType !== undefined && accountRole === ROLE.CUSTOMER ? { clientType } : {}),
      ...profile.values,
    });

    res.status(201).json({ ...newUser.toObject(), ...(typedPassword ? {} : { generatedPassword: plainPassword }) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update user profile or status
router.put('/:id', auth, auditSpecs.userUpdate, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { name, email, phone, address, role, isActive, clientType } = req.body;

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'User not found' });

    // Checked first so that the last admin gets the clearer "last active admin" message.
    const adminProblem = await validateAdminSafety(target, { role, isActive }, req.userId);
    if (adminProblem) return sendProblem(res, adminProblem);

    // An admin who deactivates their own account would lock themselves out.
    if (isActive === false && req.params.id === req.userId) {
      return res.status(400).json({ message: 'You cannot deactivate your own account.' });
    }

    const finalRole = role !== undefined ? role : target.role;
    if (clientType !== undefined && finalRole === ROLE.CUSTOMER) {
      const problem = clientTypeProblem(clientType);
      if (problem) return sendProblem(res, problem);
    }

    const profile = readProfileFields({
      role: finalRole,
      clientType: finalRole === ROLE.CUSTOMER ? (clientType !== undefined ? clientType : target.clientType) : undefined,
      body: req.body,
    });
    if (profile.problem) return sendProblem(res, profile.problem);

    // Payment terms agreed with a Commercial client: only an admin sets them, and only on a Commercial customer.
    const terms = readAgreedTerms({
      role: finalRole,
      clientType: clientType !== undefined ? clientType : target.clientType,
      body: req.body,
    });
    if (terms.problem) return sendProblem(res, terms.problem);

    const update = { ...profile.values };
    if (terms.value !== undefined && finalRole === ROLE.CUSTOMER) update.agreedPaymentTermsDays = terms.value;
    if (name !== undefined) update.name = name.trim();
    if (email !== undefined) update.email = email.trim().toLowerCase();
    if (phone !== undefined) update.phone = phone.trim();
    if (address !== undefined) update.address = address.trim();
    if (role !== undefined) update.role = role;
    if (isActive !== undefined) update.isActive = isActive;
    if (clientType !== undefined && finalRole === ROLE.CUSTOMER) update.clientType = clientType;

    const updatedUser = await User.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // A role change or a deactivation applies to the very next request, not after the cache expires.
    clearAuthCache(updatedUser._id);

    const userObj = updatedUser.toObject();
    if (updatedUser.role === ROLE.CUSTOMER) {
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
router.patch('/:id/classification', auth, auditSpecs.userClassification, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { classification } = req.body;
    if (classification !== null && !['Regular', 'Return'].includes(classification)) {
      return res.status(400).json({ message: 'Classification must be "Regular", "Return", or null to clear the override.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== ROLE.CUSTOMER) {
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
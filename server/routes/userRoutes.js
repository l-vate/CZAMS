const { ROLE } = require('../constants/roles');
const auditSpecs = require('../utils/auditSpecs');
const express = require('express');
const router = express.Router();
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
const { userInputProblem } = require('../utils/adminInput');
const { findUserByEmail, normalizeEmail } = require('../utils/accountInput');
const { generateUserId, createWithUniqueUserId } = require('../utils/uniqueUserId');
const { sendRouteError } = require('../utils/routeErrors');
const { formatPhMobile, PH_MOBILE_MESSAGE } = require('../utils/philippinePhone');
const { cleanParts, buildAddress, addressPartsProblem, isBlankParts, readParts } = require('../utils/addressParts');
const { isFieldTechnician } = require('../utils/technicians');
const { memberFilter } = require('../utils/assignments');
const Report = require('../models/Report');
const { findDeletionBlockers } = require('../utils/deletionBlockers');
const { notifyAdmins } = require('../utils/notifications');
const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');
const { BOOKING_STATUS } = require('../constants/bookingStatus');

const CLIENT_TYPES = ['Residential', 'Commercial'];
const clientTypeProblem = (value) => (CLIENT_TYPES.includes(value) ? null : invalid('Client type must be Residential or Commercial.'));

// The system must always keep at least one active admin. Returns null when the change is fine,
// otherwise { status, message }. `target` is the account being changed, `changes` the requested
// { role, isActive }, `actingId` the admin making the request.
// The address of a new or edited account, from its parts (utils/addressParts.js): { address, addressParts } when parts were sent and are complete
// (house or block and lot, street, barangay, city, province and a ZIP of exactly 4 digits; the line is built here, never taken from the request),
// { problem } when some are filled and the rest is not right, and {} when no parts were sent or all are blank (the plain line, if any, is handled by the caller).
function readAddressFromParts(body) {
  const sent = readParts(body.addressParts);
  if (!sent || isBlankParts(sent)) return {};
  const problem = addressPartsProblem(sent);
  if (problem) return { problem: invalid(problem) };
  const addressParts = cleanParts(sent);
  return { address: buildAddress(addressParts), addressParts };
}

// The phone number of an edit: { value } when it changed and is a Philippine mobile number (saved as +63 917 123 4567, or '' to clear it),
// { problem } when it changed to something else, and {} when it was not sent or is the same as the saved one (an older number in another format stays).
function readPhoneChange(phone, target) {
  if (phone === undefined) return {};
  const typed = typeof phone === 'string' ? phone.trim() : '';
  if (typed === String(target.phone || '').trim()) return {};
  if (typed === '') return { value: '' };
  const formatted = formatPhMobile(typed);
  return formatted ? { value: formatted } : { problem: invalid(PH_MOBILE_MESSAGE) };
}

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

    // Types, a real email, a known role, a password of at least 8 characters when one is typed: a 400 that names the field.
    const inputProblem = userInputProblem(req.body, { creating: true });
    if (inputProblem) return sendProblem(res, inputProblem);

    // A phone number, when one is given, is a Philippine mobile number and is saved as +63 917 123 4567.
    const savedPhone = typeof phone === 'string' && phone.trim() !== '' ? formatPhMobile(phone) : '';
    if (savedPhone === null) return sendProblem(res, invalid(PH_MOBILE_MESSAGE));

    const addressChange = readAddressFromParts(req.body);
    if (addressChange.problem) return sendProblem(res, addressChange.problem);

    // Found without regard to letter case, so Ana@Mail.com and ana@mail.com are the same account.
    const existingUser = await findUserByEmail(User, email);
    if (existingUser) {
      return res.status(409).json({ message: 'Email already exists' });
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

    const hashedPassword = await hashPassword(plainPassword);
    // the same kind of public id as a registered account (CUS1234, STF1234, ADM1234), retried when two accounts draw the same one
    const newUser = await createWithUniqueUserId((id) => User.create({
      _id: id,
      name: name ? name.trim() : '',
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      phone: savedPhone,
      address: addressChange.address || (address ? address.trim() : ''),
      ...(addressChange.addressParts ? { addressParts: addressChange.addressParts } : {}),
      role: accountRole,
      isActive: true,
      // Only customers have a client type.
      ...(clientType !== undefined && accountRole === ROLE.CUSTOMER ? { clientType } : {}),
      ...profile.values,
    }), () => generateUserId(accountRole));

    res.status(201).json({ ...newUser.toObject(), ...(typedPassword ? {} : { generatedPassword: plainPassword }) });
  } catch (err) {
    sendRouteError(res, err);
  }
});

// PUT update user profile or status
router.put('/:id', auth, auditSpecs.userUpdate, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { name, email, phone, address, role, isActive, clientType } = req.body;

    // Checked before anything else, so a wrong type is a clear 400. isActive must be a real true or false: the text
    // "false" is refused, not treated as something else, so the last-admin and self-deactivate guards below always see
    // the true value.
    const inputProblem = userInputProblem(req.body, { creating: false });
    if (inputProblem) return sendProblem(res, inputProblem);

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'User not found' });

    // A changed phone number must be a Philippine mobile number (saved as +63 917 123 4567). A number that is not changed is left alone, so an
    // older account with a number in another format can still be edited.
    const addressChange = readAddressFromParts(req.body);
    if (addressChange.problem) return sendProblem(res, addressChange.problem);

    const phoneChange = readPhoneChange(phone, target);
    if (phoneChange.problem) return sendProblem(res, phoneChange.problem);
    const newPhone = phoneChange.value;

    if (email !== undefined && normalizeEmail(email) !== String(target.email).toLowerCase()) {
      const clash = await findUserByEmail(User, email, req.params.id);
      if (clash) return res.status(409).json({ message: 'Email already exists' });
    }

    // Checked first so that the last admin gets the clearer "last active admin" message.
    const adminProblem = await validateAdminSafety(target, { role, isActive }, req.userId);
    if (adminProblem) return sendProblem(res, adminProblem);

    // An admin who deactivates their own account would lock themselves out.
    if (isActive === false && req.params.id === req.userId) {
      return res.status(400).json({ message: 'You cannot deactivate your own account.' });
    }

    // Deactivating a field technician who still has open jobs (Pending, Approved or In Progress) is refused with the list
    // of those jobs, unless the admin confirms. With the confirmation the jobs are flagged "needs reassignment" and every
    // admin is told, below.
    let openJobs = [];
    if (isActive === false && target.isActive !== false && isFieldTechnician(target)) {
      openJobs = await Booking.find({
        ...memberFilter(target._id),
        status: { $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS] },
      }).select('bookingId date time status');
      if (openJobs.length > 0 && req.body.confirmReassign !== true) {
        return res.status(409).json({
          message: `${target.name || 'This technician'} still has ${openJobs.length} open job${openJobs.length === 1 ? '' : 's'}. Deactivating will flag ${openJobs.length === 1 ? 'it' : 'them'} as needing a new technician. Confirm to go ahead.`,
          openBookings: openJobs.map((j) => ({ bookingId: j.bookingId, date: j.date, time: j.time, status: j.status })),
          needsConfirmation: true,
        });
      }
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
    if (newPhone !== undefined) update.phone = newPhone;
    if (addressChange.address) {
      update.address = addressChange.address;
      update.addressParts = addressChange.addressParts;
    } else if (address !== undefined) {
      update.address = address.trim();
      // a line typed by an admin no longer matches the saved parts, so the parts are dropped (the line stays the truth)
      if (update.address !== (target.address || '')) update.$unset = { addressParts: 1 };
    }
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

    if (openJobs.length > 0) {
      await Booking.updateMany({ _id: { $in: openJobs.map((j) => j._id) } }, { $set: { needsReassignment: true } });
      await notifyAdmins(
        NOTIFICATION_TYPE.TECHNICIAN_DEACTIVATED,
        `${updatedUser.name || 'A technician'} was deactivated and is still on ${openJobs.length} open job${openJobs.length === 1 ? '' : 's'}: ${openJobs.map((j) => j.bookingId).slice(0, 8).join(', ')}. Assign someone else.`
      );
    }

    const userObj = updatedUser.toObject();
    if (updatedUser.role === ROLE.CUSTOMER) {
      userObj.classification = await resolveClassification(updatedUser);
    }
    res.json(userObj);
  } catch (err) {
    sendRouteError(res, err);
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

// DELETE a customer or technician account (admin only). Only the account goes: completed bookings, reports, chat and files stay as company
// records, the same as when a customer deletes their own account. Refused (with the reason, and "deactivate it instead" where that is the
// right answer) for: your own account, any admin account, a customer with something still open (an active booking, an unsettled refund, a
// claim waiting for review) and a technician who has any job or service report on record.
router.delete('/:id', auth, auditSpecs.userDelete, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) return res.status(403).json({ message: 'Forbidden' });
    if (req.params.id === req.userId) return res.status(400).json({ message: 'You cannot delete your own account.' });

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'User not found' });
    if (target.role === ROLE.ADMIN) {
      return res.status(400).json({ message: 'An admin account cannot be deleted. Deactivate it instead.' });
    }

    if (target.role === ROLE.CUSTOMER) {
      const blockers = await findDeletionBlockers(target._id, { Booking, BackJob });
      if (blockers.message) {
        return res.status(409).json({ message: `This customer cannot be deleted yet. ${blockers.message.replace(/^You cannot delete your account( yet)?.s*/, '').replace('while you have active bookings', 'while they have active bookings')}`, blockers: blockers.counts });
      }
    } else {
      const [jobs, reports] = await Promise.all([
        Booking.countDocuments(memberFilter(target._id)),
        Report.countDocuments({ technicianId: String(target._id) }),
      ]);
      if (jobs > 0 || reports > 0) {
        return res.status(409).json({ message: `${target.name || 'This technician'} has ${jobs} job${jobs === 1 ? '' : 's'} and ${reports} service report${reports === 1 ? '' : 's'} on record, so the account cannot be deleted. Deactivate it instead.` });
      }
    }

    await User.findByIdAndDelete(target._id);
    clearAuthCache(String(target._id));
    res.json({ message: 'Account deleted successfully', _id: target._id });
  } catch (err) {
    sendRouteError(res, err);
  }
});

module.exports = router;
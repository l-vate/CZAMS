// server/routes/authRoutes.js
const { ROLE } = require('../constants/roles');
const express = require('express');
const router = express.Router();
const { hashPassword, verifyPassword, burnPasswordCheck } = require('../utils/password');
const { signToken, verifyToken } = require('../utils/jwtTokens');
const User = require('../models/User');
const { readProfileFields } = require('../utils/profileFields');
const auth = require('../middleware/auth');
const { createUploader, discardUploads, storeUploads, IMAGE_TYPES } = require('../utils/uploadSafety');
const { KINDS } = require('../storage/fileStore');
const { clearAuthCache } = require('../utils/authCache');
const { validateNewPassword, validateRegistrationPassword } = require('../utils/passwordRules');
const { RESET_LINK_INVALID, waitForFloor, issueUnusedToken, issueResetToken, consumeResetToken, isResetTokenLive, retireResetTokens, deliverResetLink } = require('../utils/passwordReset');
const { recordAudit } = require('../utils/audit');
const { listFieldTechnicians } = require('../utils/technicians');
const { loginLimiter, registerLimiter, passwordChangeLimiter, uploadLimiter, passwordResetRequestLimiter, passwordResetUseLimiter } = require('../middleware/rateLimit');
const Booking = require('../models/Booking');
const BackJob = require('../models/BackJob');
const { findDeletionBlockers } = require('../utils/deletionBlockers');
const { normalizeEmail, findUserByEmail, validateRegistration, validateProfileUpdate } = require('../utils/accountInput');
const { sendProblem } = require('../utils/validation');
const { sendRouteError } = require('../utils/routeErrors');
const { describeError } = require('../utils/safeLog');
const { generateUserId, createWithUniqueUserId, UserIdExhaustedError, isDuplicateOn } = require('../utils/uniqueUserId');

// Profile photos: JPG, PNG or WEBP only, stored under a random name with an extension taken from
// the validated type, and the first bytes of the saved file are checked (utils/uploadSafety.js).
const upload = createUploader({
  allowedTypes: IMAGE_TYPES,
});

router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, clientType } = req.body;

    // Names, a real email, a contact number and a password of at least 8 characters with a number and a special character, checked here as well as in the form.
    const inputProblem = validateRegistration({ firstName, lastName, email, phone, password });
    if (inputProblem) return sendProblem(res, inputProblem);

    // Company details only apply to a Commercial customer; anything else is ignored.
    const profile = readProfileFields({ role: ROLE.CUSTOMER, clientType, body: req.body });
    if (profile.problem) return res.status(profile.problem.status).json({ message: profile.problem.message });

    // Found without regard to letter case, so Ana@Mail.com and ana@mail.com are the same account.
    const existing = await findUserByEmail(User, email);
    if (existing) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Public registration only ever creates a customer. Any role sent in the body is
    // ignored on purpose; technician and admin accounts are created by an admin
    // through POST /api/users.
    const mappedRole = ROLE.CUSTOMER;

    const hashedPassword = await hashPassword(password);

    const user = await createWithUniqueUserId((id) => User.create({
      _id: id,
      name: `${firstName.trim()} ${lastName.trim()}`,
      email: normalizeEmail(email),
      phone: phone.trim(),
      password: hashedPassword,
      role: mappedRole,
      isActive: true,
      // Only meaningful for customer accounts - staff/admin registrations ignore it
      // and keep the schema default.
      ...(mappedRole === ROLE.CUSTOMER && clientType === 'Commercial' ? { clientType: 'Commercial' } : {}),
      ...profile.values,
    }), () => generateUserId(mappedRole));

    const token = signToken(user);

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
    // two accounts registering with the same email at once: the second is told so, not given an error
    if (isDuplicateOn('email', err)) return res.status(400).json({ message: 'Email already registered' });
    if (err instanceof UserIdExhaustedError) return res.status(503).json({ message: err.message });
    sendRouteError(res, err);
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = typeof email === 'string' && email.trim() ? await findUserByEmail(User, email) : null;
    if (!user) {
      await burnPasswordCheck(password); // the same time as a wrong password, so the speed of the answer says nothing about the email
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

    const token = signToken(user);

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
    sendRouteError(res, err);
  }
});

// Forgot password. The answer is always the same message and takes about the same time, whether or not the account exists (and for every role),
// so it cannot be used to find out who has an account. The email is sent after the answer, never awaited.
const FORGOT_PASSWORD_MESSAGE = 'If that email has an account, we sent a link.';

router.post('/forgot-password', passwordResetRequestLimiter, async (req, res) => {
  const started = Date.now();
  try {
    const { email } = req.body || {};
    const user = typeof email === 'string' && email.trim() && email.length <= 254 ? await findUserByEmail(User, email) : null;
    if (user && user.isActive !== false) {
      const token = await issueResetToken(user._id);
      deliverResetLink({ to: user.email, token }); // after the answer; deliverResetLink never throws
      recordAudit({
        actor: { id: user._id, role: user.role, name: user.name },
        action: 'password.reset_requested', entityType: 'User', entityId: user._id, summary: 'Password reset link requested',
      });
    } else {
      issueUnusedToken(); // the same kind of work, so an unknown email is not faster
    }
    await waitForFloor(started);
    res.json({ message: FORGOT_PASSWORD_MESSAGE });
  } catch (err) {
    // Even a fault answers like success: a different answer would tell the caller something about the account.
    console.error('Forgot password failed:', describeError(err));
    await waitForFloor(started);
    res.json({ message: FORGOT_PASSWORD_MESSAGE });
  }
});

// Is this reset link still good? Answers only yes or no and never spends the link.
router.post('/reset-password/check', passwordResetUseLimiter, async (req, res) => {
  try {
    res.json({ valid: await isResetTokenLive((req.body || {}).token) });
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.post('/reset-password', passwordResetUseLimiter, async (req, res) => {
  try {
    const { token, password } = req.body || {};
    // The password is checked first, so a typo in it does not spend the link.
    const problem = validateRegistrationPassword(password);
    if (problem) return res.status(problem.status).json({ message: problem.message });

    const userId = await consumeResetToken(token);
    const user = userId ? await User.findById(userId) : null;
    if (!user) return res.status(400).json({ message: RESET_LINK_INVALID });

    user.password = await hashPassword(password);
    user.passwordChangedAt = new Date(); // every login token issued before this stops working (middleware/auth.js)
    await user.save();
    await retireResetTokens(user._id);
    clearAuthCache(user._id);
    recordAudit({
      actor: { id: user._id, role: user.role, name: user.name },
      action: 'password.reset_completed', entityType: 'User', entityId: user._id, summary: 'Password reset with an emailed link',
    });
    res.json({ message: 'Your password was changed. Please sign in.' });
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.put('/profile', auth, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, address } = req.body;

    // A name and a real email are required, a phone number must be valid when given; "undefined undefined" can never be saved.
    const inputProblem = validateProfileUpdate({ firstName, lastName, email, phone });
    if (inputProblem) return sendProblem(res, inputProblem);

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newEmail = normalizeEmail(email);
    if (newEmail !== String(user.email).toLowerCase()) {
      const existing = await findUserByEmail(User, newEmail, req.userId);
      if (existing) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      user.email = newEmail;
    }

    user.name = `${firstName.trim()} ${lastName.trim()}`;
    if (typeof phone === 'string' && phone.trim()) user.phone = phone.trim();
    if (typeof address === 'string' && address.trim()) user.address = address.trim();

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
    sendRouteError(res, err);
  }
});

router.post('/profile/photo', auth, uploadLimiter, upload.single('photo'), async (req, res) => {
  try {
    // A refused or failed request must not leave its uploaded file behind.
    res.on('finish', () => { if (res.statusCode >= 400) discardUploads(req); });

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await storeUploads(req, { kind: KINDS.PROFILE_IMAGE });
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

// Change password from the profile: emails the signed-in user a reset link to their own address, so the change is confirmed through
// the inbox rather than with the current password. The link is the same one-time, 30 minute link as forgot password.
router.post('/change-password/email', auth, passwordChangeLimiter, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.isActive === false) return res.status(404).json({ message: 'User not found' });
    if (!user.email) return res.status(400).json({ message: 'Your account has no email address. Please add one to your profile first.' });

    const token = await issueResetToken(user._id);
    deliverResetLink({ to: user.email, token }); // after the answer; deliverResetLink never throws
    recordAudit({
      actor: { id: user._id, role: user.role, name: user.name },
      action: 'password.reset_requested', entityType: 'User', entityId: user._id, summary: 'Password change link requested from the profile',
    });
    res.json({ message: `We sent a link to ${user.email}. Open it to choose a new password. It expires in 30 minutes.` });
  } catch (err) {
    console.error('Password change email failed:', describeError(err));
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/change-password', auth, passwordChangeLimiter, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Checked first, so a bad new password is a clear 400 and nothing below ever sees it.
    const problem = validateNewPassword({ currentPassword, newPassword });
    if (problem) return res.status(problem.status).json({ message: problem.message });

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await verifyPassword(user, currentPassword);

    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    user.password = await hashPassword(newPassword);
    user.passwordChangedAt = new Date();
    await user.save();

    // Every other token for this account stops working at once (middleware/auth.js). The cache is cleared
    // so that holds on the very next request, and this response carries a fresh token so the person
    // changing the password stays signed in on this device.
    clearAuthCache(req.userId);
    const token = signToken(user);
    res.json({ message: 'Password updated successfully', token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Customers only. A technician or an admin account is removed by an admin (deactivate it), never by
// its own owner, so a technician cannot orphan their assigned jobs and the last admin cannot vanish.
// A customer's bookings are left as they are when the account goes: nothing is cancelled or deleted.
router.delete('/account', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.CUSTOMER) {
      return res.status(403).json({ message: 'Only customers can delete their own account. Ask an administrator.' });
    }
    // Not while something is still open (an active booking, an unsettled refund, a claim waiting for review): 409, checked here on the
    // server whatever the page shows.
    const blockers = await findDeletionBlockers(req.userId, { Booking, BackJob });
    if (blockers.message) {
      return res.status(409).json({ message: blockers.message, blockers: blockers.counts });
    }

    // Only the account is deleted. Their completed bookings, reports, chat and files stay as company records.
    const user = await User.findByIdAndDelete(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    clearAuthCache(req.userId);
    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// True when the request carries a valid token. No account lookup: this only decides how much of a
// public list to show, it never grants access to anything.
function hasValidToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return false;
  try {
    verifyToken(header.split(' ')[1]);
    return true;
  } catch {
    return false;
  }
}

// Active technicians. The public landing page search needs the names, so a visitor with no login gets
// names only. A signed-in user (the booking form's preferred technician list) also gets the ids and
// positions, which is what the form needs.
router.get('/technicians', async (req, res) => {
  try {
    const technicians = await listFieldTechnicians(User, '_id name');
    if (!hasValidToken(req)) {
      return res.json(technicians.map((t) => ({ name: t.name })));
    }
    res.json(technicians);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
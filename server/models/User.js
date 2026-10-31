const { ROLE_VALUES, ROLE } = require('../constants/roles');
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  _id: { type: String },
  name: String,
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ROLE_VALUES, default: ROLE.CUSTOMER },
  phone: String,
  address: String,
  profileImage: String,
  isActive: { type: Boolean, default: true },
  // When the password was last changed. A token issued before this is refused (middleware/auth.js), so
  // changing a password signs out every other device. Accounts that never changed it have none and are unaffected.
  passwordChangedAt: { type: Date },

  // Customer Classification Module. When set, this wins outright over the
  // auto-computed 3-completed-bookings-in-12-months rule (see utils/classification.js);
  // null/unset means "use the auto-computed value."
  manualClassification: { type: String, enum: ['Regular', 'Return'], default: null },

  // Admin Dashboard + Analytics Module: captured at registration (so it doesn't
  // rot unset the way serviceType did - see CZAMS_Build_Order.md #11), admin can
  // correct it afterward. Only meaningful for customer accounts.
  clientType: { type: String, enum: ['Residential', 'Commercial'], default: 'Residential' },

  // Staff only: a free-text job title (the form suggests Technician, Secretary and Cashier).
  position: { type: String, maxlength: 40 },

  // Commercial customers only: payment terms the admin AGREED with this client, in days after the service (7 to 10).
  // Set by an admin, never by the customer. A commercial client with terms may book without a down payment, and their
  // invoices carry these terms. Empty means no terms were agreed.
  agreedPaymentTermsDays: { type: Number, min: 7, max: 10, default: null },

  // Commercial customers only, shown on their invoice. Accounts made before these existed have none.
  companyName: { type: String, maxlength: 80 },
  representativeName: { type: String, maxlength: 80 },
  // Evaluator sample data (scripts/seedEvaluatorData.js): the marker that lets the script find, and remove, only what it made. Nothing else reads these.
  isEvaluatorSample: { type: Boolean, default: undefined },
  evaluatorBatch: { type: String, default: undefined },
}, { timestamps: true, collection: 'users' });

// The password (a bcrypt hash, or an old plain-text value) never leaves the server in a response.
// Doing it here, in the model, means no route can return it by accident: every toObject() and
// toJSON() of a user, including a user populated inside another document, leaves it out. Code that
// needs it (the login check, changing a password) reads user.password on the document itself.
const stripPassword = (doc, ret) => {
  delete ret.password;
  return ret;
};
userSchema.set('toJSON', { transform: stripPassword });
userSchema.set('toObject', { transform: stripPassword });

// Listing technicians and counting active admins filter on role and active.
userSchema.index({ role: 1, isActive: 1 });

module.exports = mongoose.model('User', userSchema);
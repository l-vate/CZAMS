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

  // Commercial customers only, shown on their invoice. Accounts made before these existed have none.
  companyName: { type: String, maxlength: 80 },
  representativeName: { type: String, maxlength: 80 },
}, { timestamps: true, collection: 'users' });

module.exports = mongoose.model('User', userSchema);
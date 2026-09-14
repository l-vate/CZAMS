const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  _id: { type: String },
  name: String,
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'staff', 'customer'], default: 'customer' },
  phone: String,
  address: String,
  profileImage: String,
  isActive: { type: Boolean, default: true },

  // Customer Classification Module. When set, this wins outright over the
  // auto-computed 4-completed-bookings-in-a-year rule (see userRoutes.js);
  // null/unset means "use the auto-computed value."
  manualClassification: { type: String, enum: ['Regular', 'Return'], default: null },

  // Admin Dashboard + Analytics Module: captured at registration (so it doesn't
  // rot unset the way serviceType did — see CZAMS_Build_Order.md #11), admin can
  // correct it afterward. Only meaningful for customer accounts.
  clientType: { type: String, enum: ['Residential', 'Commercial'], default: 'Residential' },
}, { timestamps: true, collection: 'users' });

module.exports = mongoose.model('User', userSchema);
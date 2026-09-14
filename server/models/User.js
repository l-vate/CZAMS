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
}, { timestamps: true, collection: 'users' });

module.exports = mongoose.model('User', userSchema);
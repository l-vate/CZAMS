const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  _id: { type: String },
  name: String,
  description: String,
  price: Number,
  durationMinutes: Number,
  category: String,
  icon: String,
  isActive: { type: Boolean, default: true },

  // Which warranty rule applies to bookings of this service (Warranty Tracking
  // Module) — explicit rather than guessed from name/category text.
  serviceType: { type: String, enum: ['Cleaning', 'Installation', 'Repair', 'Maintenance', 'Other'], default: 'Other' },
}, { timestamps: true, collection: 'services' });

module.exports = mongoose.model('Service', serviceSchema);
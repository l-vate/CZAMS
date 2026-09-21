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

  // Multi-Unit Booking Redesign: optional per-unit-type price override for this
  // service (e.g. Cleaning costs more per Floor Mounted unit than per Window
  // Type unit). A unit type with no entry here just falls back to the flat
  // `price` above — this is what keeps every existing service backward
  // compatible with zero migration: no entries means "price applies to every
  // unit type the same, like before."
  unitTypePricing: [{
    unitType: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
  }],
}, { timestamps: true, collection: 'services' });

module.exports = mongoose.model('Service', serviceSchema);
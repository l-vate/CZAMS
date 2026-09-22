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
  // Module) — explicit rather than guessed from name/category text. 'Leak Repair'
  // added for the standalone paid leak-repair service (system reprocess/flushing/
  // vacuum/charging) triggered by a refrigerant undercharge found during cleaning
  // or a paid check-up — distinct from generic 'Repair', which has no defined
  // warranty; this one carries its own 1-month workmanship warranty (see
  // server/utils/warranty.js).
  serviceType: { type: String, enum: ['Cleaning', 'Installation', 'Repair', 'Maintenance', 'Leak Repair', 'Other'], default: 'Other' },

  // Three-Tier Cleaning Structure: Deep Cleaning and Pull-down Deep Cleaning are
  // real Service records (own price, own unitTypePricing) so admin manages them
  // exactly like every other service — but they're resolved automatically by the
  // tier-determination questions in Step1 (book_service.jsx), not picked directly
  // by the customer, so they're hidden from the normal service grid. Manage
  // Services (admin) shows every service regardless of this flag.
  hiddenFromDirectSelection: { type: Boolean, default: false },

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
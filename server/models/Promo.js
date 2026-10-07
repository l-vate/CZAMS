const mongoose = require('mongoose');

// A promotional package: an admin-made discount tied to one or more services, with an optional
// minimum number of units (e.g. "Clean 3 or more units, get 10% off"). This is how "bundle" and
// "package" work in this system; there are no multi-service bookings. Dates are plain
// "YYYY-MM-DD" strings, the same convention as a booking's date, compared in Philippine time.
const promoSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  // Service ids the promo applies to. Empty means every service.
  services: [{ type: String, ref: 'Service' }],
  minUnits: { type: Number, default: 1, min: 1 },
  discountType: { type: String, enum: ['percent', 'fixed'], required: true },
  discountValue: { type: Number, required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Promo', promoSchema);

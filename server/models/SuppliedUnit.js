const mongoose = require('mongoose');

// A unit Cooling Zone can supply for an installation, managed by the admin (routes/suppliedUnitRoutes.js). A booking never reads it
// live: when a customer (or the admin) chooses an item, its brand, model, type, horsepower, inverter flag and price are copied onto the
// booking's unit entry (units[].supplied), so a later edit here never changes a booking that already exists. The catalog starts empty:
// nothing is seeded, the owner enters the real units and prices.
const suppliedUnitSchema = new mongoose.Schema({
  brand: { type: String, required: true, trim: true, maxlength: 40 },
  model: { type: String, trim: true, maxlength: 40, default: '' },
  // one of the unit types in constants/bookingRules.mjs (window, split, floor mounted, cassette, portable); checked by the route
  type: { type: String, required: true },
  // horsepower as a short text such as "1.5"; compared as a number so "1" and "1.0" are the same
  hp: { type: String, required: true, maxlength: 10 },
  inverter: { type: Boolean, required: true },
  price: { type: Number, required: true, min: 0 },
  isActive: { type: Boolean, default: true },
  // A unit that a booking already used is never removed for good: it is hidden from everyone and kept for that history.
  isDeleted: { type: Boolean, default: false },
  createdBy: String,
}, { timestamps: true, collection: 'supplied_units' });

suppliedUnitSchema.index({ isDeleted: 1, isActive: 1, type: 1 });

module.exports = mongoose.model('SuppliedUnit', suppliedUnitSchema);

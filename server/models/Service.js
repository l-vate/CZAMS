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
}, { timestamps: true, collection: 'services' });

module.exports = mongoose.model('Service', serviceSchema);
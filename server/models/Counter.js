const mongoose = require('mongoose');

// A named, atomically incremented number. Used to hand every new booking a queue rank that
// no other booking can receive at the same moment (see utils/queue.js).
const counterSchema = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model('Counter', counterSchema);

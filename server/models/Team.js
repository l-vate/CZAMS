const mongoose = require('mongoose');

// A fixed technician team: one lead plus one helper, roles not interchangeable. A
// technician can belong to only one ACTIVE team at a time (checked in the team routes).
// Bookings copy the lead and helper ids onto themselves when a team is assigned, so a
// booking's history survives later edits to the team.
const teamSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  lead: { type: String, ref: 'User', required: true },
  helper: { type: String, ref: 'User', required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Team', teamSchema);

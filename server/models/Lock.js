const mongoose = require('mongoose');

// A short lock, held for the few milliseconds one request needs to check something and write it (utils/slotLock.js). The unique _id is
// what makes two requests at the same moment take turns: only one can create it. Each lock expires on its own (expiresAt), so one left
// behind by a crashed request frees itself. Nothing ever depends on a lock still existing later, so it is not a record of anything.
const lockSchema = new mongoose.Schema({
  _id: { type: String },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { collection: 'locks' });

module.exports = mongoose.model('Lock', lockSchema);

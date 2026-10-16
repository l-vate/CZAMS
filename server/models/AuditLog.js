const mongoose = require('mongoose');

// One line per important admin action: who did it, what, to which record, when. Written only by utils/audit.js. It holds
// ids and small before/after values in `meta`, never passwords, tokens, file contents or bank details.
const auditLogSchema = new mongoose.Schema({
  actor: {
    id: { type: String, index: true },
    name: String,
    role: String,
  },
  // e.g. payment.verify, booking.approve, user.deactivate
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: { type: String },
  summary: { type: String, maxlength: 300 },
  meta: { type: mongoose.Schema.Types.Mixed },
// bufferCommands is off so a write made while the database is not connected fails at once (and is logged) instead of waiting
// ten seconds: an audit line must never hold up the request or a test that has no database.
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'auditlogs', bufferCommands: false });

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

const mongoose = require('mongoose');

// One password reset link. Only the SHA-256 hash of the token is kept, never the token itself, so a copy of the database cannot be
// used to reset anyone's password. `usedAt` is set when the link is used or replaced by a newer one; a used token never works again.
const passwordResetTokenSchema = new mongoose.Schema({
  user: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

// Finished rows are removed a day after they expire.
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

module.exports = mongoose.model('PasswordResetToken', passwordResetTokenSchema);

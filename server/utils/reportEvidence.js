// The proof a technician must attach to finish a service report: the client's drawn signature
// and typed name, or a photo of the signed paper form. Pure, so it can be tested without a database.
const { invalid } = require('./validation');

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png']);

// null when the report has enough proof, otherwise { status, message }.
// With a photo, the signature and name are optional. Without one, both are required as before.
function consentProblem({ signedName, signatureDataUrl, hasPhoto }) {
  if (hasPhoto) return null;
  const hasName = typeof signedName === 'string' && signedName.trim() !== '';
  if (!hasName || !signatureDataUrl) {
    return invalid("The client's signature and name, or a photo of the signed paper form, are required to finalize this report.");
  }
  return null;
}

// A form field that arrives as the text "true" or "false" in a multipart request, or as a real
// boolean in a JSON one.
function readFlag(value) {
  return value === true || value === 'true';
}

module.exports = { PHOTO_MAX_BYTES, PHOTO_MIME_TYPES, consentProblem, readFlag };

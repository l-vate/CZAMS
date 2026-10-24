// The proof a technician must attach to finish a service report: the client's drawn signature
// and typed name, or a photo of the signed paper form. Pure, so it can be tested without a database.
const { invalid } = require('./validation');
const { bytesMatch } = require('./uploadSafety');

const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const PHOTO_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png']);
const SIGNATURE_MAX_BYTES = 500 * 1024;

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

// null when the drawn signature is a PNG or JPEG data URL whose bytes really are that image and are under 500 KB,
// otherwise { status, message }. Nothing is checked when no signature was sent (consentProblem decides if one is
// needed). A signature sent along with a photo is checked too, so a bad one is never stored.
function signatureProblem(signatureDataUrl) {
  if (signatureDataUrl === undefined || signatureDataUrl === null || signatureDataUrl === '') return null;
  const bad = (why) => invalid(`The client's signature is not a valid image (${why}). Please sign again.`);
  if (typeof signatureDataUrl !== 'string') return bad('wrong format');
  const match = /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(signatureDataUrl);
  if (!match) return bad('only PNG or JPEG is accepted');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > SIGNATURE_MAX_BYTES) return bad('it must be under 500 KB');
  if (!bytesMatch(match[1], bytes)) return bad('the file does not match its type');
  return null;
}

// A form field that arrives as the text "true" or "false" in a multipart request, or as a real
// boolean in a JSON one.
function readFlag(value) {
  return value === true || value === 'true';
}

module.exports = { PHOTO_MAX_BYTES, PHOTO_MIME_TYPES, SIGNATURE_MAX_BYTES, consentProblem, signatureProblem, readFlag };

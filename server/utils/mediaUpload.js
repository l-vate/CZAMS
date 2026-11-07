// The optional picture or short clip a customer sends with a booking or a back job (a problem photo or video, or a photo of where the unit
// will go). One file. A picture follows the same types and size as every other image upload (JPG, PNG or WEBP, shrunk and cleaned, up to
// 8 MB); a clip may be an MP4, MOV or WEBM of up to 15 MB. The same request may carry other proofs, which keep their own rules.
const { createUploader, PROOF_TYPES, MEDIA_TYPES, VIDEO_MAX_BYTES, MAX_UPLOAD_BYTES, isVideoType, describeTypes, discardUploads } = require('./uploadSafety');

const MEDIA_FIELD = 'problemMedia';

// Everything the request may carry is let through to be read, then each field is held to its own types and size.
const mediaUploader = createUploader({ allowedTypes: [...PROOF_TYPES, ...MEDIA_TYPES.filter(isVideoType)], maxBytes: VIDEO_MAX_BYTES });

const filesOf = (req) => (Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat());

// Middleware for after the upload: the media field takes only pictures and clips, every other field keeps the proof types (no clip), and a
// picture is no bigger than any other image upload. A refused request stores nothing.
function mediaFieldRules(req, res, next) {
  const refuse = (message) => { discardUploads(req); return res.status(400).json({ message }); };
  for (const file of filesOf(req)) {
    if (file.fieldname === MEDIA_FIELD) {
      if (!MEDIA_TYPES.includes(file.mimetype)) return refuse(`Only ${describeTypes(MEDIA_TYPES)} files are allowed for a photo or video.`);
      if (!isVideoType(file.mimetype) && file.size > MAX_UPLOAD_BYTES) return refuse(`The photo must be ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB or smaller.`);
    } else if (!PROOF_TYPES.includes(file.mimetype)) {
      return refuse(`Only ${describeTypes(PROOF_TYPES)} files are allowed.`);
    } else if (file.size > MAX_UPLOAD_BYTES) {
      return refuse(`The file must be ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB or smaller.`);
    }
  }
  return next();
}

module.exports = { mediaUploader, mediaFieldRules, MEDIA_FIELD };

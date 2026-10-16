// One safe way to accept an uploaded file, shared by the profile photo, the payment, ID and refund
// proofs, and the service report photo.
//
//  - Only the types listed for that upload are accepted. SVG, HTML and anything else is refused.
//  - The stored extension comes from the validated type, never from the name the client sent, and
//    the name is random, so a file called "x.html" can never be stored or served as HTML.
//  - The browser's Content-Type can be forged, so the first bytes of the file are checked against the
//    type it claims. A file that does not match is refused.
//  - Files are held in memory and written to the file store (storage/fileStore.js) by storeUploads, only after the route has checked
//    everything else. A refused request stores nothing; one that fails after storing removes what it stored (discardUploads).
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { getStore } = require('../storage/fileStore');

const MB = 1024 * 1024;

// What each accepted type must start with. Checked against the saved file, not the header.
const FILE_TYPES = Object.freeze({
  'image/jpeg': { ext: '.jpg', label: 'JPG', matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: '.png', label: 'PNG', matches: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: '.webp', label: 'WEBP', matches: (b) => b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  'application/pdf': { ext: '.pdf', label: 'PDF', matches: (b) => b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-' },
});

// The allowed sets used around the app.
const IMAGE_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
const PHOTO_TYPES = Object.freeze(['image/jpeg', 'image/png']); // the signed paper form photo
const PROOF_TYPES = Object.freeze([...IMAGE_TYPES, 'application/pdf']); // payment, ID, refund and purchase proofs

const extensionFor = (mimetype) => FILE_TYPES[mimetype]?.ext;

const describeTypes = (types) => {
  const labels = types.map((t) => FILE_TYPES[t].label);
  return labels.length > 1 ? `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}` : labels[0];
};

// true when the first bytes of the file match what its declared type must start with.
function bytesMatch(mimetype, head) {
  const type = FILE_TYPES[mimetype];
  return !!type && Buffer.isBuffer(head) && type.matches(head);
}

const filesOf = (req) => {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  return Object.values(req.files || {}).flat();
};

const HEAD_BYTES = 16;

// A file kept in memory by multer matches its claimed type when its first bytes do.
const verifyBuffer = (file) => bytesMatch(file.mimetype, Buffer.isBuffer(file.buffer) ? file.buffer.subarray(0, HEAD_BYTES) : null);

// Writes this request's files to the file store (storage/fileStore.js). A route calls it once everything else has been checked, right
// before it saves its own record, so a refused request never stores anything. `kind` is one of KINDS, or a function of the multer file
// (for a route with several fields). If one file cannot be stored, the ones already stored by this call are removed and the error is thrown.
async function storeUploads(req, { kind, bookingId } = {}) {
  const store = getStore();
  const done = [];
  try {
    for (const file of filesOf(req)) {
      if (!file.stored) {
        await store.save({
          name: file.filename,
          buffer: file.buffer,
          contentType: file.mimetype,
          metadata: { kind: typeof kind === 'function' ? kind(file) : kind, uploadedBy: req.userId, bookingId },
        });
        file.stored = true;
        done.push(file);
      }
    }
  } catch (err) {
    await Promise.all(done.map(removeStored));
    throw err;
  }
}

async function removeStored(file) {
  file.stored = false;
  try {
    await getStore().remove(file.filename);
  } catch (err) {
    console.error('Could not remove a stored file:', err.message);
  }
}

// Removes every file this request stored. A route calls it when it fails or refuses a request after storing; a request that never reached
// the store has nothing to remove. Returns a promise, but callers may ignore it.
function discardUploads(req) {
  return Promise.all(filesOf(req).filter((f) => f.stored).map(removeStored));
}

// Express middleware for the step right after multer: every file in memory must pass the byte check, and then gets its random stored name
// (from the validated type, never from the client's name). If any fails the request ends with a 400; nothing was stored yet.
function verifyUploads(allowedTypes) {
  return (req, res, next) => {
    const files = filesOf(req);
    if (!files.every(verifyBuffer)) {
      return res.status(400).json({ message: `The file is not a real ${describeTypes(allowedTypes)} file.` });
    }
    files.forEach((file) => { file.filename = `${crypto.randomBytes(16).toString('hex')}${extensionFor(file.mimetype)}`; });
    return next();
  };
}

// Builds the upload helpers. `upload.single(name)` and `upload.fields(list)` return the middleware to put in a route. Files are held in
// memory (at most maxBytes each) until the route stores them.
function createUploader({ allowedTypes, maxBytes = 5 * MB }) {
  const instance = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes },
    fileFilter: (req, file, cb) => {
      if (allowedTypes.includes(file.mimetype)) cb(null, true);
      else cb(Object.assign(new Error(`Only ${describeTypes(allowedTypes)} files are allowed.`), { isUploadRejection: true }));
    },
  });

  // Turns an upload problem (wrong type, too big) into a clear 400 instead of a server error.
  const guarded = (middleware) => (req, res, next) => {
    middleware(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: `The file must be ${Math.round(maxBytes / MB)} MB or smaller.` });
      }
      if (err.isUploadRejection || err instanceof multer.MulterError) {
        return res.status(400).json({ message: err.isUploadRejection ? err.message : `File upload error: ${err.message}` });
      }
      return next(err);
    });
  };

  const check = verifyUploads(allowedTypes);
  return {
    single: (name) => [guarded(instance.single(name)), check],
    fields: (list) => [guarded(instance.fields(list)), check],
  };
}

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');

module.exports = {
  FILE_TYPES, IMAGE_TYPES, PHOTO_TYPES, PROOF_TYPES, UPLOADS_ROOT,
  extensionFor, bytesMatch, verifyUploads, storeUploads, discardUploads, createUploader, describeTypes,
};

// One safe way to accept an uploaded file, shared by the profile photo, the payment, ID and refund
// proofs, and the service report photo.
//
//  - Only the types listed for that upload are accepted. SVG, HTML and anything else is refused.
//  - The stored extension comes from the validated type, never from the name the client sent, and
//    the name is random, so a file called "x.html" can never be stored or served as HTML.
//  - The browser's Content-Type can be forged, so after saving the first bytes of the file are
//    checked against the type it claims. A file that does not match is deleted and refused.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

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

function readHead(filePath, length = 16) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const read = fs.readSync(fd, buffer, 0, length, 0);
    return buffer.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

// Checks a saved file. When it does not match its claimed type it is deleted and false is returned.
function verifySavedFile(file) {
  const ok = (() => {
    try {
      return bytesMatch(file.mimetype, readHead(file.path));
    } catch {
      return false;
    }
  })();
  if (!ok) fs.unlink(file.path, () => {});
  return ok;
}

const filesOf = (req) => {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  return Object.values(req.files || {}).flat();
};

// Express middleware for the step right after multer: every saved file must pass the byte check.
// If any fails, all of this request's files are removed and the request ends with a 400.
function verifyUploads(allowedTypes) {
  return (req, res, next) => {
    const files = filesOf(req);
    if (files.every(verifySavedFile)) return next();
    files.forEach((f) => fs.unlink(f.path, () => {}));
    return res.status(400).json({ message: `The file is not a real ${describeTypes(allowedTypes)} file.` });
  };
}

// Builds the upload helpers for one folder. `upload.single(name)` and `upload.fields(list)` return
// the middleware to put in a route, so a route reads the same as it did with plain multer.
function createUploader({ dir, allowedTypes, maxBytes = 5 * MB }) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    // Random name, extension from the validated type. The client's file name is never used.
    filename: (req, file, cb) => {
      cb(null, `${crypto.randomBytes(16).toString('hex')}${extensionFor(file.mimetype) || ''}`);
    },
  });

  const instance = multer({
    storage,
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
  extensionFor, bytesMatch, verifySavedFile, verifyUploads, createUploader, describeTypes,
};

// Where uploaded files live. Routes never touch a folder or the database for a file: they use the store returned by getStore().
//
//   save({ name, buffer, contentType, metadata })   stores a new file; a name already taken is refused (FileExistsError)
//   open(name)      { stream, contentType, size, metadata } or null when there is no such file
//   exists(name)    true or false
//   remove(name)    true when a file was removed, false when there was none (so removing twice is fine)
//   list()          [{ name, size, uploadedAt, metadata }] for the scripts
//
// Three implementations: GridFS (the existing Atlas database, bucket "uploads", survives a host restart: the default in production), disk
// (a local folder: the default in development, and what files lived in before) and memory (tests). FILE_STORE=gridfs or disk chooses.
//
// What is kept about a file: kind, who uploaded it, the booking when known, its size and its detected content type. The name the client
// sent is never kept. A file name is the random 32 character one, so the stored paths in existing records (/uploads/proofs/<name>) keep working.
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { safeProofName } = require('../utils/fileAccess');

const KINDS = Object.freeze({
  PROOF: 'proof',
  ID_PHOTO: 'id_photo',
  REFUND_PROOF: 'refund_proof',
  PURCHASE_PROOF: 'purchase_proof',
  SIGNED_FORM: 'signed_form',
  PROFILE_IMAGE: 'profile_image',
  SIGNATURE: 'signature',
  LEGACY: 'legacy', // a file that was already on disk before the store, whose use could not be worked out
});
const KIND_VALUES = Object.freeze(Object.values(KINDS));

class FileExistsError extends Error {
  constructor(name) {
    super(`A file named ${name} already exists`);
    this.name = 'FileExistsError';
    this.code = 'EEXIST';
  }
}

class BadFileNameError extends Error {
  constructor() {
    super('That is not a valid file name');
    this.name = 'BadFileNameError';
    this.code = 'EBADNAME';
  }
}

const checkName = (name) => {
  const safe = safeProofName(name);
  if (!safe) throw new BadFileNameError();
  return safe;
};

// The only things kept with a file. An unknown kind becomes legacy; nothing else the caller passes is stored (so no client file name).
function cleanMetadata({ buffer, contentType, metadata = {} }) {
  return {
    kind: KIND_VALUES.includes(metadata.kind) ? metadata.kind : KINDS.LEGACY,
    uploadedBy: metadata.uploadedBy ? String(metadata.uploadedBy) : null,
    bookingId: metadata.bookingId ? String(metadata.bookingId) : null,
    size: Buffer.byteLength(buffer),
    contentType: contentType || 'application/octet-stream',
  };
}

const TYPE_BY_EXTENSION = Object.freeze({
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf',
});
const contentTypeOfName = (name) => TYPE_BY_EXTENSION[path.extname(name).toLowerCase()] || 'application/octet-stream';

// ---- memory (tests)

function createMemoryStore() {
  const files = new Map();
  return {
    kind: 'memory',
    async save({ name, buffer, contentType, metadata }) {
      checkName(name);
      if (files.has(name)) throw new FileExistsError(name);
      const meta = cleanMetadata({ buffer, contentType, metadata });
      files.set(name, { buffer: Buffer.from(buffer), meta, uploadedAt: new Date() });
      return { name, size: meta.size };
    },
    async open(name) {
      const found = safeProofName(name) && files.get(name);
      if (!found) return null;
      return { stream: Readable.from([found.buffer]), contentType: found.meta.contentType, size: found.meta.size, metadata: { ...found.meta } };
    },
    async exists(name) { return !!safeProofName(name) && files.has(name); },
    async remove(name) { return !!safeProofName(name) && files.delete(name); },
    async list() {
      return [...files.entries()].map(([name, f]) => ({ name, size: f.meta.size, uploadedAt: f.uploadedAt, metadata: { ...f.meta } })).sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}

// ---- disk (development, and the old layout: proofs/ and profile-images/ under one root)

const PROOFS_FOLDER = 'proofs';
const PROFILE_FOLDER = 'profile-images';

function createDiskStore({ root = path.join(__dirname, '..', 'uploads') } = {}) {
  const folderFor = (kind) => (kind === KINDS.PROFILE_IMAGE ? PROFILE_FOLDER : PROOFS_FOLDER);
  const locate = async (name) => {
    for (const folder of [PROOFS_FOLDER, PROFILE_FOLDER]) {
      const abs = path.join(root, folder, name);
      try {
        const stat = await fs.promises.stat(abs);
        if (stat.isFile()) return { abs, folder, stat };
      } catch { /* not in this folder */ }
    }
    return null;
  };
  const describe = (name, folder, size) => ({
    kind: folder === PROFILE_FOLDER ? KINDS.PROFILE_IMAGE : KINDS.LEGACY, uploadedBy: null, bookingId: null, size, contentType: contentTypeOfName(name),
  });
  return {
    kind: 'disk',
    async save({ name, buffer, contentType, metadata }) {
      checkName(name);
      const meta = cleanMetadata({ buffer, contentType, metadata });
      if (await locate(name)) throw new FileExistsError(name);
      const dir = path.join(root, folderFor(meta.kind));
      await fs.promises.mkdir(dir, { recursive: true });
      try {
        await fs.promises.writeFile(path.join(dir, name), buffer, { flag: 'wx' });
      } catch (err) {
        if (err.code === 'EEXIST') throw new FileExistsError(name);
        throw err;
      }
      return { name, size: meta.size };
    },
    async open(name) {
      if (!safeProofName(name)) return null;
      const found = await locate(name);
      if (!found) return null;
      const metadata = describe(name, found.folder, found.stat.size);
      return { stream: fs.createReadStream(found.abs), contentType: metadata.contentType, size: found.stat.size, metadata };
    },
    async exists(name) { return !!safeProofName(name) && !!(await locate(name)); },
    async remove(name) {
      if (!safeProofName(name)) return false;
      const found = await locate(name);
      if (!found) return false;
      try {
        await fs.promises.unlink(found.abs);
        return true;
      } catch (err) {
        if (err.code === 'ENOENT') return false;
        throw err;
      }
    },
    async list() {
      const out = [];
      for (const folder of [PROOFS_FOLDER, PROFILE_FOLDER]) {
        let names = [];
        try { names = await fs.promises.readdir(path.join(root, folder)); } catch { names = []; }
        for (const name of names) {
          if (!safeProofName(name)) continue;
          const stat = await fs.promises.stat(path.join(root, folder, name));
          if (stat.isFile()) out.push({ name, size: stat.size, uploadedAt: stat.mtime, metadata: describe(name, folder, stat.size) });
        }
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}

// ---- GridFS (the existing mongoose connection; bucket "uploads" makes the collections uploads.files and uploads.chunks)

function createGridFsStore({ getDb, bucketName = 'uploads', mongo } = {}) {
  const driver = () => mongo || require('mongoose').mongo;
  const database = getDb || (() => require('mongoose').connection.db);
  const db = () => {
    const handle = database();
    if (!handle) throw new Error('The database is not connected, so files cannot be stored or read yet');
    return handle;
  };
  const bucket = () => new (driver().GridFSBucket)(db(), { bucketName });
  const filesCollection = () => db().collection(`${bucketName}.files`);

  // One file per name, enforced by the database: this is what settles two saves of the same name at once. Best effort, once.
  let indexAttempt;
  const ensureIndex = () => {
    if (!indexAttempt) {
      indexAttempt = filesCollection().createIndex({ filename: 1 }, { unique: true, name: 'filename_unique' }).catch((err) => {
        indexAttempt = undefined;
        console.error('Could not create the unique file name index:', err.message);
      });
    }
    return indexAttempt;
  };

  const find = async (name) => (safeProofName(name) ? filesCollection().findOne({ filename: name }) : null);

  return {
    kind: 'gridfs',
    async save({ name, buffer, contentType, metadata }) {
      checkName(name);
      const meta = cleanMetadata({ buffer, contentType, metadata });
      await ensureIndex();
      if (await find(name)) throw new FileExistsError(name);
      await new Promise((resolve, reject) => {
        const upload = bucket().openUploadStream(name, { metadata: meta });
        upload.on('error', reject);
        upload.on('finish', resolve);
        upload.end(buffer);
      }).catch((err) => {
        if (err && err.code === 11000) throw new FileExistsError(name);
        throw err;
      });
      return { name, size: meta.size };
    },
    async open(name) {
      const doc = await find(name);
      if (!doc) return null;
      const meta = doc.metadata || {};
      const contentType = meta.contentType || contentTypeOfName(name);
      return {
        stream: bucket().openDownloadStream(doc._id),
        contentType,
        size: doc.length,
        metadata: { kind: meta.kind || KINDS.LEGACY, uploadedBy: meta.uploadedBy || null, bookingId: meta.bookingId || null, size: meta.size || doc.length, contentType },
      };
    },
    async exists(name) { return !!(await find(name)); },
    async remove(name) {
      const doc = await find(name);
      if (!doc) return false;
      try {
        await bucket().delete(doc._id);
        return true;
      } catch (err) {
        if (/FileNotFound/i.test(err.name || '') || /File not found/i.test(err.message || '')) return false;
        throw err;
      }
    },
    async list() {
      const docs = await filesCollection().find({}).project({ filename: 1, length: 1, uploadDate: 1, metadata: 1 }).toArray();
      return docs
        .map((d) => ({ name: d.filename, size: d.length, uploadedAt: d.uploadDate, metadata: d.metadata || { kind: KINDS.LEGACY } }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}

// ---- choosing

// "gridfs" or "disk". FILE_STORE decides; unset or anything else means gridfs in production and disk otherwise.
function chooseStoreName(env = process.env) {
  const wanted = String(env.FILE_STORE || '').trim().toLowerCase();
  if (wanted === 'gridfs' || wanted === 'disk') return wanted;
  return env.NODE_ENV === 'production' ? 'gridfs' : 'disk';
}

// Reads fall back to the local folder, for files that were saved there before the store existed. Writes and removes never go to the fallback.
function withLegacyDisk(primary, legacy) {
  return {
    kind: primary.kind,
    save: (file) => primary.save(file),
    async open(name) { return (await primary.open(name)) || legacy.open(name); },
    async exists(name) { return (await primary.exists(name)) || legacy.exists(name); },
    remove: (name) => primary.remove(name),
    list: () => primary.list(),
  };
}

// The legacy disk fallback is on whenever files could still be on this machine's disk: in development (and with FILE_STORE=disk the disk is
// the store itself). In production with gridfs it is off: a name that is not in the store is a 404.
const legacyFallbackEnabled = (env = process.env) => env.NODE_ENV !== 'production';

let current = null;

function buildStore(env = process.env) {
  const disk = createDiskStore();
  if (chooseStoreName(env) === 'disk') return disk;
  const gridfs = createGridFsStore();
  return legacyFallbackEnabled(env) ? withLegacyDisk(gridfs, disk) : gridfs;
}

const getStore = () => {
  if (!current) current = buildStore();
  return current;
};
// For tests: use this store from now on (null goes back to the one chosen by the environment).
const setStore = (store) => { current = store; };

module.exports = {
  KINDS, FileExistsError, BadFileNameError, cleanMetadata, contentTypeOfName,
  createMemoryStore, createDiskStore, createGridFsStore, withLegacyDisk, chooseStoreName, legacyFallbackEnabled, buildStore, getStore, setStore,
};

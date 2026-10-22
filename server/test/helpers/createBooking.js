// A stand-in database and a tiny Express app for tests of POST /api/bookings and the customer booking routes. The
// real routes, the real auth middleware and the real validation run; only the Mongoose calls are replaced by plain
// objects in memory, so no database is needed. Install it once per test file with install(), reset it with reset().
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-a-real-one';

const User = require('../../models/User');
const Booking = require('../../models/Booking');
const Service = require('../../models/Service');
const Closure = require('../../models/Closure');
const TechnicianOff = require('../../models/TechnicianOff');
const SuppliedUnit = require('../../models/SuppliedUnit');
const AuditLog = require('../../models/AuditLog');
const Promo = require('../../models/Promo');
const Counter = require('../../models/Counter');
const PaymentSettings = require('../../models/PaymentSettings');
const Notification = require('../../models/Notification');
const BackJob = require('../../models/BackJob');
const { authCache } = require('../../utils/authCache');
const { manilaTodayKey } = require('../../utils/timeBlocks');
const { addDays } = require('../../utils/extensionDays');
const { matches, chain } = require('./memoryQueries');
const { isFieldTechnician } = require('../../utils/technicians');
const { createMemoryStore, setStore } = require('../../storage/fileStore');
const Lock = require('../../models/Lock');

const state = { locks: new Map(), store: null, versioned: false, backJobDelay: 0, users: [], services: [], bookings: [], notes: [], audits: [], catalog: [], closures: [], techOff: [], promos: [], backJobs: [], settings: null };
let seq = 0;
let server;
let base;

const DEFAULT_SETTINGS = {
  _id: 'default',
  paymentMethods: [{ name: 'Cash' }, { name: 'GCash' }, { name: 'Cheque' }, { name: 'Bank Transfer' }],
  downPaymentPercentages: [30, 50, 100],
  seniorPwdDiscountPercent: 20,
};

const asDoc = (obj) => {
  obj.save = async () => obj;
  obj.populate = async function populate() {
    const svc = state.services.find((s) => s._id === this.service);
    if (svc) this.service = svc;
    return this;
  };
  obj.toObject = () => JSON.parse(JSON.stringify(obj));
  obj.get = function get(key) { return this[key]; };
  obj.set = function set(key, value) { this[key] = value; };
  obj.unmarkModified = () => {};
  return obj;
};

function versionedCopy(canon) {
  const doc = asDoc(JSON.parse(JSON.stringify(canon)));
  doc.__v = canon.__v || 0;
  doc.save = async function save() {
    if ((canon.__v || 0) !== (this.__v || 0)) {
      const err = new Error('No matching document found for the version');
      err.name = 'VersionError';
      throw err;
    }
    const data = JSON.parse(JSON.stringify(this));
    Object.keys(canon).forEach((key) => { if (typeof canon[key] !== 'function') delete canon[key]; });
    Object.assign(canon, data);
    canon.__v = (data.__v || 0) + 1;
    this.__v = canon.__v;
    return this;
  };
  return doc;
}

// Most tests make many bookings for one customer, so the cap on Pending bookings is lifted for them. pendingHold.test.js puts the real value back.
function reset({ users = [], services = [], settings = DEFAULT_SETTINGS } = {}) {
  authCache.clear();
  require('../../constants/scheduling').MAX_PENDING_PER_CUSTOMER = 1000;
  // Uploaded files go to an in-memory store, never to disk or a database: state.store shows what was kept.
  state.store = createMemoryStore();
  setStore(state.store);
  state.locks = new Map();
  // A shop has a crew. A fixture with fewer than two field technicians gets five pairs, so a slot is not "full" only because nobody works there.
  state.users = users.filter(isFieldTechnician).length >= 2
    ? users
    : [...users, ...['TD1', 'TD2', 'TD3', 'TD4', 'TD5', 'TD6', 'TD7', 'TD8', 'TD9', 'TD10'].map((id) => ({ _id: id, name: `Default ${id}`, role: 'staff', isActive: true, position: 'Technician' }))];
  state.services = services;
  state.settings = settings;
  state.bookings = [];
  state.notes = [];
  state.audits = [];
  state.catalog = [];
  state.closures = [];
  state.techOff = [];
  state.promos = [];
  state.backJobs = [];
  state.backJobDelay = 0;
  state.versioned = false;
  seq = 0;
}

async function install() {
  User.findById = (id) => chain(state.users.find((u) => u._id === id) || null);
  User.findOne = (f) => chain(state.users.find((u) => matches(u, f)) || null);
  User.find = (f) => chain(state.users.filter((u) => matches(u, f)));
  Service.findById = (id) => chain(state.services.find((s) => s._id === id) || null);
  Service.find = (f) => chain(state.services.filter((s) => matches(s, f)));
  PaymentSettings.findById = () => chain(state.settings);
  Closure.findOne = (f) => chain(state.closures.find((c) => matches(c, f)) || null);
  Closure.find = (f) => chain(state.closures.filter((c) => matches(c, f)));
  TechnicianOff.find = (f) => chain(state.techOff.filter((o) => matches(o, f)));
  Promo.find = () => chain(state.promos);
  // locks: creating one that exists fails with a duplicate key error (what the unique _id does in MongoDB); an expired one can be deleted
  Lock.create = async (doc) => {
    if (state.locks.has(doc._id)) throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
    state.locks.set(doc._id, doc); // taken at once: the database decides who is first in one step
    await new Promise((resolve) => { setImmediate(resolve); }); // and the answer still takes a moment to come back, so requests overlap
    return doc;
  };
  Lock.deleteOne = async (filter) => {
    const held = state.locks.get(filter._id);
    if (held && (!filter.expiresAt || held.expiresAt < filter.expiresAt.$lt)) state.locks.delete(filter._id);
    return { acknowledged: true };
  };
  Counter.findOneAndUpdate = async () => ({ seq: (seq += 1) * 1000 });
  Notification.create = async (d) => { state.notes.push(d); return d; };
  // the audit trail and the supplied unit catalog, in memory (ids are valid 24 character ids, like the real ones)
  AuditLog.create = async (d) => { state.audits.push(d); return d; };
  Booking.exists = async (f) => state.bookings.find((b) => matches(b, f)) || null;
  const catalogDoc = (data) => {
    const doc = { isActive: true, isDeleted: false, ...data };
    doc.save = async () => doc;
    return doc;
  };
  SuppliedUnit.find = (f) => chain(state.catalog.filter((c) => matches(c, f)));
  SuppliedUnit.findById = (id) => chain(state.catalog.find((c) => String(c._id) === String(id)) || null);
  SuppliedUnit.create = async (data) => {
    const doc = catalogDoc({ _id: String(state.catalog.length + 1).padStart(24, '0'), ...JSON.parse(JSON.stringify(data)) });
    state.catalog.push(doc);
    return doc;
  };
  SuppliedUnit.deleteOne = async (f) => {
    const index = state.catalog.findIndex((c) => matches(c, f));
    if (index >= 0) state.catalog.splice(index, 1);
    return { deletedCount: index >= 0 ? 1 : 0 };
  };
  // With state.versioned, every read gives its own copy and a save is refused (VersionError) when the stored booking changed since
  // that read: what Mongoose's optimisticConcurrency does. Two requests at once can then not both succeed.
  Booking.findOne = (f) => {
    const found = state.bookings.find((b) => matches(b, f)) || null;
    if (!state.versioned || !found) return chain(found);
    const copy = versionedCopy(found);
    return { select() { return this; }, populate() { return this; }, lean() { return this; }, sort() { return this; }, then(resolve, reject) { return new Promise((done) => { setTimeout(() => done(copy), 8); }).then(resolve, reject); } };
  };
  Booking.find = (f) => chain(state.bookings.filter((b) => matches(b, f)));
  Booking.countDocuments = async (f) => state.bookings.filter((b) => matches(b, f)).length;
  Booking.create = async (data) => {
    const doc = asDoc({ _id: `oid-${state.bookings.length + 1}`, status: 'Pending', assignments: [], extensionDays: [], refund: {}, ...JSON.parse(JSON.stringify(data)) });
    state.bookings.push(doc);
    return doc;
  };
  Booking.findOneAndUpdate = (f, update) => {
    const found = state.bookings.find((b) => matches(b, f));
    if (found) {
      if (update.$set) Object.assign(found, update.$set);
      if (update.$unset) Object.keys(update.$unset).forEach((k) => { delete found[k]; });
      if (update.$push) Object.entries(update.$push).forEach(([k, v]) => { found[k] = [...(found[k] || []), JSON.parse(JSON.stringify(v))]; });
      if (!update.$set && !update.$unset && !update.$push) Object.assign(found, update);
    }
    return chain(found || null);
  };
  Booking.updateMany = async (f, update) => {
    const hits = state.bookings.filter((b) => matches(b, f));
    hits.forEach((b) => { if (update.$set) Object.assign(b, update.$set); });
    return { modifiedCount: hits.length };
  };
  User.countDocuments = async (f) => state.users.filter((u) => u.role === f.role && u.isActive !== false && u._id !== (f._id && f._id.$ne)).length;
  User.findByIdAndUpdate = (id, update) => {
    const u = state.users.find((x) => x._id === id);
    if (u) Object.assign(u, update);
    return chain(u ? { ...u, toObject() { return { ...u }; } } : null);
  };
  Booking.bulkWrite = async (ops) => {
    ops.forEach((op) => {
      const target = state.bookings.find((b) => matches(b, op.updateOne.filter));
      if (target && op.updateOne.update.$set) Object.assign(target, op.updateOne.update.$set);
    });
    return { modifiedCount: ops.length };
  };
  Counter.updateOne = async () => ({});
  Booking.deleteOne = async (f) => {
    const index = state.bookings.findIndex((b) => matches(b, f));
    if (index >= 0) state.bookings.splice(index, 1);
    return { deletedCount: index >= 0 ? 1 : 0 };
  };
  Booking.updateOne = async (f, update) => {
    const found = state.bookings.find((b) => matches(b, f));
    if (found && update.$set) Object.assign(found, update.$set);
    if (found && update.$push) Object.entries(update.$push).forEach(([k, v]) => { found[k] = [...(found[k] || []), JSON.parse(JSON.stringify(v))]; });
    return { acknowledged: true };
  };
  BackJob.findOne = (f) => {
    const found = state.backJobs.find((b) => matches(b, f)) || null;
    // a short pause, so two requests made together both look before either saves (what a real database allows)
    return state.backJobDelay ? new Promise((resolve) => { setTimeout(() => resolve(found), state.backJobDelay); }) : chain(found);
  };
  BackJob.create = async (data) => {
    const doc = JSON.parse(JSON.stringify(data));
    // the unique partial index: one OPEN claim per booking
    if (state.backJobs.some((b) => b.originalBookingId === doc.originalBookingId && b.isOpen !== false && doc.isOpen !== false)) {
      throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000, keyPattern: { originalBookingId: 1 } });
    }
    const saved = { _id: `bj-${state.backJobs.length + 1}`, isOpen: true, ...doc, toObject() { return { ...this }; } };
    state.backJobs.push(saved);
    return saved;
  };
  BackJob.findById = (id) => chain(state.backJobs.find((b) => b._id === id) || null);

  const app = express();
  app.use(express.json());
  app.use('/api/bookings', require('../../routes/bookingRoutes'));
  app.use('/api/bookings', require('../../routes/scopeLineRoutes'));
  app.use('/api/bookings', require('../../routes/unitRequestRoutes'));
  app.use('/api/bookings', require('../../routes/quotationRoutes'));
  app.use('/api/supplied-units', require('../../routes/suppliedUnitRoutes'));
  app.use('/api/back-jobs', require('../../routes/backJobRoutes'));
  app.use('/api/users', require('../../routes/userRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
}

const close = () => server && server.close();

// Puts a ready-made booking into the stand-in database (its service as a plain object, so warranty and pricing work).
function addBooking(fields) {
  const doc = asDoc({ _id: `oid-${state.bookings.length + 1}`, status: 'Pending', assignments: [], extensionDays: [], refund: {}, ...fields });
  state.bookings.push(doc);
  return doc;
}

// A JSON request to any mounted route, as the person named.
async function callPath(method, path, as = 'CUS1', body, { role = 'customer' } = {}) {
  const token = jwt.sign({ id: as, role }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// A date the booking rules accept: about a week from today in Manila, never a Sunday.
function goodDate(daysAhead = 7) {
  let date = addDays(manilaTodayKey(), daysAhead);
  while (new Date(`${date}T00:00:00Z`).getUTCDay() === 0) date = addDays(date, 1);
  return date;
}

// Sends POST /api/bookings as multipart, the way the form does. `fields` overrides the valid defaults; a value of
// undefined removes a field.
async function post(fields = {}, as = 'CUS1', { role = 'customer' } = {}) {
  const token = jwt.sign({ id: as, role }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const body = {
    service: 'S-CLEAN', units: [{ type: 'Split Type', quantity: 1, brandModel: 'Carrier' }], date: goodDate(), time: 'Morning', address: 'Quezon City',
    contactNumber: '09171234567', downPaymentPercent: 50, paymentMode: 'GCash', lastCleanedOver6MonthsAgo: false, isActivelyLeaking: false, ...fields,
  };
  const form = new FormData();
  Object.entries(body).forEach(([k, v]) => {
    if (v === undefined) return;
    form.append(k, k === 'units' && typeof v !== 'string' ? JSON.stringify(v) : String(v));
  });
  const res = await fetch(`${base}/api/bookings`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// Any JSON request to the booking routes.
async function call(method, path, as = 'CUS1', body, { role = 'customer' } = {}) {
  const token = jwt.sign({ id: as, role }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}/api/bookings${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const getBase = () => base;

// A catalog item in the stand-in database (a plain object that can be saved), as the admin would have entered it.
function addCatalogUnit(fields = {}) {
  const doc = { _id: String(state.catalog.length + 1).padStart(24, '0'), brand: 'Testbrand', model: 'T100', type: 'Split Type', hp: '1', inverter: true, price: 25000, isActive: true, isDeleted: false, ...fields };
  doc.save = async () => doc;
  state.catalog.push(doc);
  return doc;
}

module.exports = { base: getBase, state, install, reset, close, post, call, callPath, addBooking, addCatalogUnit, goodDate, DEFAULT_SETTINGS };

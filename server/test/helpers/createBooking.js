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
const Promo = require('../../models/Promo');
const Counter = require('../../models/Counter');
const PaymentSettings = require('../../models/PaymentSettings');
const Notification = require('../../models/Notification');
const BackJob = require('../../models/BackJob');
const { authCache } = require('../../utils/authCache');
const { manilaTodayKey } = require('../../utils/timeBlocks');
const { addDays } = require('../../utils/extensionDays');
const { matches, chain } = require('./memoryQueries');

const state = { backJobDelay: 0, users: [], services: [], bookings: [], notes: [], closures: [], promos: [], backJobs: [], settings: null };
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

function reset({ users = [], services = [], settings = DEFAULT_SETTINGS } = {}) {
  authCache.clear();
  state.users = users;
  state.services = services;
  state.settings = settings;
  state.bookings = [];
  state.notes = [];
  state.closures = [];
  state.promos = [];
  state.backJobs = [];
  state.backJobDelay = 0;
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
  Promo.find = () => chain(state.promos);
  Counter.findOneAndUpdate = async () => ({ seq: (seq += 1) * 1000 });
  Notification.create = async (d) => { state.notes.push(d); return d; };
  Booking.findOne = (f) => chain(state.bookings.find((b) => matches(b, f)) || null);
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

module.exports = { base: getBase, state, install, reset, close, post, call, callPath, addBooking, goodDate, DEFAULT_SETTINGS };

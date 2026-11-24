// Run with: npm test (inside server/). Admin accounts: a phone number is a Philippine mobile number (+63 then 10 digits starting with 9), the screens and the
// server use the same rule, an unchanged older number can stay, and an admin can delete a customer or technician account, but not an admin, not
// themselves, not a customer with something open and not a technician with a job history. The real routes and the real auth run; only the database
// is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const server = require('../utils/philippinePhone');
const User = require('../models/User');
const Booking = require('../models/Booking');
const BackJob = require('../models/BackJob');
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');
const { authCache } = require('../utils/authCache');
const { chain } = require('./helpers/memoryQueries');

const GOOD = ['9171234567', '09171234567', '+63 917 123 4567', '+639171234567', '63 917-123-4567', '(0917) 123 4567'];
const BAD = ['', '12345689', '8171234567', '917123456', '91712345678', '0017123456', '+1 917 123 4567', 'abc', '0917 123 456'];

test('every usual way of writing a Philippine mobile number is accepted and saved as +63 917 123 4567', () => {
  GOOD.forEach((v) => assert.equal(server.formatPhMobile(v), '+63 917 123 4567', v));
  GOOD.forEach((v) => assert.equal(server.isPhMobile(v), true, v));
});

test('anything else is refused: too short, too long, not starting with 9, another country, letters', () => {
  BAD.forEach((v) => { assert.equal(server.isPhMobile(v), false, JSON.stringify(v)); assert.equal(server.formatPhMobile(v), null, JSON.stringify(v)); });
});

test('the screens use the same rule as the server', async () => {
  const client = await import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'philippinePhone.js')).href);
  [...GOOD, ...BAD].forEach((v) => {
    assert.equal(client.isPhMobile(v), server.isPhMobile(v), JSON.stringify(v));
    assert.equal(client.formatPhMobile(v), server.formatPhMobile(v), JSON.stringify(v));
    assert.equal(client.localDigits(v), server.localDigits(v), JSON.stringify(v));
  });
  assert.equal(client.PH_MOBILE_MESSAGE, server.PH_MOBILE_MESSAGE);
});

// ---- the routes
const accounts = {
  ADM1: { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' },
  ADM2: { _id: 'ADM2', role: 'admin', isActive: true, name: 'Other admin' },
  CUS1: { _id: 'CUS1', role: 'customer', isActive: true, name: 'Ana', phone: '12345689' },
  CUS2: { _id: 'CUS2', role: 'customer', isActive: true, name: 'Ben', phone: '+63 917 123 4567' },
  STF1: { _id: 'STF1', role: 'staff', isActive: true, name: 'Tech One', position: 'Technician', phone: '12345689' },
  STF2: { _id: 'STF2', role: 'staff', isActive: true, name: 'Tech Two', position: 'Technician' },
};
let app;
let base;
let saved;
let deleted;
let counts;

test.before(async () => {
  AuditLog.create = async (d) => d;
  User.findById = (id) => chain(accounts[id] ? { ...accounts[id], isActive: accounts[id].isActive } : null);
  User.findOne = () => chain(null);
  User.countDocuments = async () => 1;
  User.findByIdAndDelete = async (id) => { deleted.push(id); return accounts[id]; };
  User.findByIdAndUpdate = async (id, update) => { saved.push({ id, update }); const doc = { ...accounts[id], ...update }; return { ...doc, toObject() { return { ...doc }; } }; };
  User.create = async (doc) => { saved.push({ create: doc }); return { ...doc, toObject() { return { ...doc }; } }; };
  Booking.find = () => chain([]);
  Booking.countDocuments = async (filter) => (filter && filter.customer ? counts.active : counts.jobs);
  BackJob.countDocuments = async () => 0;
  Report.countDocuments = async () => counts.reports;
  const a = express();
  a.use(express.json());
  a.use('/api/users', require('../routes/userRoutes'));
  app = await new Promise((resolve) => { const s = a.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${app.address().port}`;
});
test.after(() => app && app.close());
test.beforeEach(() => { authCache.clear(); saved = []; deleted = []; counts = { active: 0, jobs: 0, reports: 0 }; });

const call = async (method, url, body, as = 'ADM1') => {
  const token = jwt.sign({ id: as, role: accounts[as].role }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}${url}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  const out = { status: res.status, body: await res.json().catch(() => ({})) };
  if (out.status === 500) console.error('500 body', JSON.stringify(out.body));
  return out;
};

test('creating an account with a bad phone number is a 400 with the message; a good one is saved as +63 917 123 4567', async () => {
  const bad = await call('POST', '/api/users', { name: 'New Person', email: 'new1@example.test', phone: '12345689', role: 'customer', password: 'Correct-Horse-9' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.message, /\+63/);
  const good = await call('POST', '/api/users', { name: 'New Person', email: 'new2@example.test', phone: '0917 123 4567', role: 'customer', password: 'Correct-Horse-9' });
  assert.equal(good.status, 201, JSON.stringify(good.body));
  assert.equal(saved.find((s) => s.create).create.phone, '+63 917 123 4567');
});

test('editing: a changed bad number is refused; a changed good number is saved formatted; an unchanged older number does not block the edit', async () => {
  const bad = await call('PUT', '/api/users/CUS2', { phone: '555' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.message, /\+63/);
  const unchanged = await call('PUT', '/api/users/CUS1', { name: 'Ana Cruz', phone: '12345689' });
  assert.equal(unchanged.status, 200, JSON.stringify(unchanged.body));
  const changed = await call('PUT', '/api/users/CUS1', { phone: '09181234567' });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  const written = saved.map((s) => s.update).filter(Boolean).map((u) => (u.$set ? { ...u.$set } : u));
  assert.ok(written.some((u) => u.phone === '+63 918 123 4567'), JSON.stringify(written));
});

test('delete: only an admin may, and a customer or a technician with nothing on record is removed', async () => {
  assert.equal((await call('DELETE', '/api/users/CUS2', undefined, 'CUS1')).status, 403);
  assert.deepEqual(deleted, []);
  const customer = await call('DELETE', '/api/users/CUS2');
  assert.equal(customer.status, 200, JSON.stringify(customer.body));
  const tech = await call('DELETE', '/api/users/STF2');
  assert.equal(tech.status, 200, JSON.stringify(tech.body));
  assert.deepEqual(deleted, ['CUS2', 'STF2']);
});

test('delete is refused for yourself, for any admin, and for an account that is not there', async () => {
  assert.equal((await call('DELETE', '/api/users/ADM1')).status, 400);
  const admin = await call('DELETE', '/api/users/ADM2');
  assert.equal(admin.status, 400);
  assert.match(admin.body.message, /Deactivate/);
  assert.equal((await call('DELETE', '/api/users/NOPE')).status, 404);
  assert.deepEqual(deleted, []);
});

test('delete is refused for a customer with an active booking, and for a technician with jobs or reports (deactivate instead)', async () => {
  counts.active = 2;
  const customer = await call('DELETE', '/api/users/CUS2');
  assert.equal(customer.status, 409);
  assert.match(customer.body.message, /active bookings/);
  counts = { active: 0, jobs: 3, reports: 1 };
  const tech = await call('DELETE', '/api/users/STF1');
  assert.equal(tech.status, 409);
  assert.match(tech.body.message, /3 jobs and 1 service report/);
  assert.match(tech.body.message, /Deactivate/);
  assert.deepEqual(deleted, []);
});

// ---- the address of an admin made or edited account
const PARTS = { houseLot: 'Blk 5 Lot 2', street: 'Mabini St', subdivision: '', barangay: 'Commonwealth', city: 'Quezon City', province: 'Metro Manila', zip: '1121' };

test('an address given as parts must be complete and the ZIP exactly 4 digits, on create and on edit', async () => {
  const base = { name: 'New Person', email: 'addr1@example.test', phone: '9171234567', role: 'customer', password: 'Correct-Horse-9' };
  for (const zip of ['112', '11211', '11a1', '']) {
    const res = await call('POST', '/api/users', { ...base, addressParts: { ...PARTS, zip } });
    assert.equal(res.status, 400, `zip ${JSON.stringify(zip)}`);
    assert.match(res.body.message, /ZIP/);
  }
  const noStreet = await call('POST', '/api/users', { ...base, addressParts: { ...PARTS, street: '' } });
  assert.equal(noStreet.status, 400);
  assert.match(noStreet.body.message, /Street is required/);
  const edit = await call('PUT', '/api/users/CUS2', { addressParts: { ...PARTS, zip: '99' } });
  assert.equal(edit.status, 400);
  assert.match(edit.body.message, /ZIP/);
  assert.equal(saved.length, 0, 'nothing was saved');
});

test('a complete address is saved as parts and as the one line every other screen reads; blank parts change nothing', async () => {
  const created = await call('POST', '/api/users', { name: 'New Person', email: 'addr2@example.test', phone: '9171234567', role: 'customer', password: 'Correct-Horse-9', addressParts: PARTS });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const doc = saved.find((s) => s.create).create;
  assert.equal(doc.address, 'Blk 5 Lot 2, Mabini St, Brgy. Commonwealth, Quezon City, Metro Manila 1121');
  assert.equal(doc.addressParts.zip, '1121');
  const edited = await call('PUT', '/api/users/CUS2', { addressParts: PARTS });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  const update = saved.find((s) => s.update).update;
  assert.match(update.address, /Brgy\. Commonwealth, Quezon City, Metro Manila 1121$/);
  assert.equal(update.addressParts.city, 'Quezon City');
  saved = [];
  const blank = await call('PUT', '/api/users/CUS2', { name: 'Ben Cruz', addressParts: { houseLot: '', street: '', subdivision: '', barangay: '', city: '', province: '', zip: '' } });
  assert.equal(blank.status, 200, JSON.stringify(blank.body));
  const kept = saved.find((s) => s.update).update;
  assert.equal(kept.address, undefined);
  assert.equal(kept.addressParts, undefined);
});

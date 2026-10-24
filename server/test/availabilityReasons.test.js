// Run with: npm test (inside server/). Why a date or block cannot be booked, as the public calendar and the booking check say it:
// closed (the shop is closed, with the admin's words), noTechnicians (nobody can work: every technician is away) and fullyBooked
// (technicians are there but every crew is taken). The real routes and rules run; only the database is replaced.
// PRIVACY: the public answer never says which technician is on leave, their name or id, or why.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const harness = require('./helpers/createBooking');
const scheduling = require('../constants/scheduling');
const { getAvailability } = require('../utils/availability');
const { addDays } = require('../utils/extensionDays');

const { state, post, addBooking, goodDate } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true };
const tech = (id, name) => ({ _id: id, name, role: 'staff', isActive: true, position: 'Technician' });
const customer = (id) => ({ _id: id, role: 'customer', isActive: true, clientType: 'Residential', name: id });
const IDS = ['TECH-ALPHA', 'TECH-BRAVO', 'TECH-CHARLIE', 'TECH-DELTA'];
const NAMES = ['Alonzo Reyes', 'Benedicta Cruz', 'Cornelio Santos', 'Dalisay Ramos'];
const LEAVE_REASON = 'Chemotherapy appointment at the clinic';

let sundaySetting;
test.before(() => { harness.install(); sundaySetting = scheduling.SUNDAY_CLOSED; });
test.after(() => { scheduling.SUNDAY_CLOSED = sundaySetting; return harness.close(); });
test.beforeEach(() => {
  scheduling.SUNDAY_CLOSED = true;
  harness.reset({ users: [customer('CUS1'), { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' }, ...IDS.map((id, i) => tech(id, NAMES[i]))], services: [cleaning] });
});

const D = () => goodDate(10);
const dayOf = async (date) => (await getAvailability(date, date))[0];
const off = (ids, date, blocks, reason = LEAVE_REASON) => ids.forEach((technician) => state.techOff.push({ technician, date, blocks, reason }));
const bookCrew = (date, time, lead, helper) => addBooking({ bookingId: `CZ-${date}-${time}-${lead}`, customer: 'CUS1', service: cleaning, status: 'Approved', date, time, assignments: [{ lead, helper }] });
const sundayOnOrAfter = (key) => { let day = key; while (new Date(`${day}T00:00:00Z`).getUTCDay() !== 0) day = addDays(day, 1); return day; };

// ---- closed
test('a closure the admin added is closed, with the admin\'s words', async () => {
  state.closures.push({ date: D(), reason: 'Holiday' });
  const day = await dayOf(D());
  assert.equal(day.status, 'shop-closed');
  assert.equal(day.reasonCode, 'closed');
  assert.equal(day.reason, 'Holiday', 'the field the page already read keeps its meaning');
  assert.equal(day.closedLabel, 'Closed: Holiday');
});

test('a closure with a blank reason still reads "Closed: ...", never empty or undefined', async () => {
  state.closures.push({ date: D(), reason: '   ' });
  const label = (await dayOf(D())).closedLabel;
  assert.equal(label, 'Closed: Shop closed');
  assert.equal(/undefined|null/.test(label), false);
});

test('a Sunday is closed and reads "Closed: Sunday"', async () => {
  const sunday = sundayOnOrAfter(goodDate(10));
  const day = await dayOf(sunday);
  assert.equal(day.status, 'closed');
  assert.equal(day.reasonCode, 'closed');
  assert.equal(day.closedLabel, 'Closed: Sunday');
});

// ---- noTechnicians
test('every technician on leave for both blocks: no technicians, in both blocks, and the day is full for that reason', async () => {
  off(IDS, D(), ['Morning', 'Afternoon']);
  const day = await dayOf(D());
  assert.equal(day.status, 'full');
  assert.equal(day.morning, false);
  assert.equal(day.afternoon, false);
  assert.equal(day.morningReason, 'noTechnicians');
  assert.equal(day.afternoonReason, 'noTechnicians');
  assert.equal(day.reasonCode, 'noTechnicians');
});

test('every technician on leave for the morning only: the morning has no technicians and the afternoon is open', async () => {
  off(IDS, D(), ['Morning']);
  const day = await dayOf(D());
  assert.equal(day.status, 'limited');
  assert.equal(day.morning, false);
  assert.equal(day.morningReason, 'noTechnicians');
  assert.equal(day.afternoon, true);
  assert.equal(day.afternoonReason, null);
  assert.equal(day.reasonCode, undefined, 'a day with an open block has no day level reason');
});

test('one technician left and nobody has booked them: still no technicians, because no crew can be formed', async () => {
  off(IDS.slice(0, 3), D(), ['Morning']);
  assert.equal((await dayOf(D())).morningReason, 'noTechnicians');
});

// ---- fullyBooked
test('technicians are all working and every crew is booked: fully booked', async () => {
  bookCrew(D(), 'Morning', IDS[0], IDS[1]);
  bookCrew(D(), 'Morning', IDS[2], IDS[3]);
  const day = await dayOf(D());
  assert.equal(day.morningReason, 'fullyBooked');
  assert.equal(day.afternoonReason, null);
  assert.equal(day.status, 'limited');
});

test('some technicians on leave and the rest booked is fully booked, not no technicians', async () => {
  off([IDS[2], IDS[3]], D(), ['Morning']);
  bookCrew(D(), 'Morning', IDS[0], IDS[1]);
  assert.equal((await dayOf(D())).morningReason, 'fullyBooked');
  // three on leave and the one who is left is booked
  state.techOff.length = 0;
  state.bookings.length = 0;
  off([IDS[1], IDS[2], IDS[3]], D(), ['Morning']);
  addBooking({ bookingId: 'CZ-SOLO', customer: 'CUS1', service: cleaning, status: 'Approved', date: D(), time: 'Morning', assignments: [{ lead: IDS[0] }] });
  assert.equal((await dayOf(D())).morningReason, 'fullyBooked');
});

test('a Pending request nobody is assigned to yet uses up a crew: fully booked', async () => {
  bookCrew(D(), 'Morning', IDS[0], IDS[1]);
  addBooking({ bookingId: 'CZ-WAIT', customer: 'CUS1', service: cleaning, status: 'Pending', date: D(), time: 'Morning', assignments: [] });
  assert.equal((await dayOf(D())).morningReason, 'fullyBooked');
});

// ---- mixed
test('a morning with no technicians and a fully booked afternoon: each block says its own reason', async () => {
  off(IDS, D(), ['Morning']);
  bookCrew(D(), 'Afternoon', IDS[0], IDS[1]);
  bookCrew(D(), 'Afternoon', IDS[2], IDS[3]);
  const day = await dayOf(D());
  assert.equal(day.status, 'full');
  assert.equal(day.morningReason, 'noTechnicians');
  assert.equal(day.afternoonReason, 'fullyBooked');
  assert.equal(day.reasonCode, 'fullyBooked', 'when only one block has no technicians the day is not described as having none');
});

test('a day nobody has touched has no reasons and keeps the old fields', async () => {
  const day = await dayOf(D());
  assert.deepEqual({ status: day.status, morning: day.morning, afternoon: day.afternoon }, { status: 'open', morning: true, afternoon: true });
  assert.equal(day.morningReason, null);
  assert.equal(day.afternoonReason, null);
});

// ---- privacy
test('the public answer never says which technician is on leave: no names, ids or leave reasons', async () => {
  off(IDS.slice(0, 3), D(), ['Morning'], LEAVE_REASON);
  off(IDS, goodDate(11), ['Morning', 'Afternoon'], LEAVE_REASON);
  const app = express();
  app.use('/api/availability', require('../routes/availabilityRoutes'));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/availability/public?from=${D()}&to=${goodDate(12)}`;
    const res = await fetch(url);
    assert.equal(res.status, 200);
    const text = await res.text();
    const days = JSON.parse(text);
    assert.ok(days.some((d) => d.morningReason === 'noTechnicians'), 'the page is told there are no technicians');
    [...IDS, ...NAMES, LEAVE_REASON, 'Chemotherapy', 'technician_off', 'leave'].forEach((secret) => {
      assert.equal(text.toLowerCase().includes(secret.toLowerCase()), false, 'the public answer holds something it must not reveal');
    });
    const allowed = new Set(['date', 'status', 'morning', 'afternoon', 'morningReason', 'afternoonReason', 'reasonCode', 'reason', 'closedLabel']);
    days.forEach((d) => Object.keys(d).forEach((k) => assert.ok(allowed.has(k), `unexpected field in the public answer: ${k}`)));
  } finally {
    await new Promise((resolve) => { server.close(resolve); });
  }
});

// ---- the booking itself
test('booking a block where nobody can work says "No technicians are available on that date."', async () => {
  off(IDS, D(), ['Morning']);
  const res = await post({ date: D(), time: 'Morning' }, 'CUS1');
  assert.equal(res.status, 409);
  assert.equal(res.body.message, 'No technicians are available on that date.');
  assert.equal(/fully booked|already taken/i.test(res.body.message), false);
  assert.equal(state.bookings.length, 0);
});

test('booking a block where every crew is taken still says it is taken', async () => {
  bookCrew(D(), 'Morning', IDS[0], IDS[1]);
  bookCrew(D(), 'Morning', IDS[2], IDS[3]);
  const res = await post({ date: D(), time: 'Morning' }, 'CUS1');
  assert.equal(res.status, 409);
  assert.match(res.body.message, /already taken/);
});

test('some technicians on leave and the rest booked is the taken message, not the no technicians one', async () => {
  off([IDS[2], IDS[3]], D(), ['Morning']);
  bookCrew(D(), 'Morning', IDS[0], IDS[1]);
  const res = await post({ date: D(), time: 'Morning' }, 'CUS1');
  assert.equal(res.status, 409);
  assert.match(res.body.message, /already taken/);
});

test('booking a closed date is refused as closed, with the admin\'s reason, and a Sunday as closed on Sundays', async () => {
  state.closures.push({ date: D(), reason: 'Holiday' });
  const closed = await post({ date: D(), time: 'Morning' }, 'CUS1');
  assert.equal(closed.status, 400);
  assert.match(closed.body.message, /^The shop is closed on .+: Holiday$/);
  assert.equal(/fully booked|already taken|No technicians/i.test(closed.body.message), false);
  const sunday = sundayOnOrAfter(D());
  const res = await post({ date: sunday, time: 'Morning' }, 'CUS1');
  assert.equal(res.status, 400);
  assert.match(res.body.message, /closed on Sundays/);
});

// Run with: npm test (inside server/). Forces booking ID collisions without a database by
// making the create step throw the same duplicate-key error MongoDB raises.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWithUniqueBookingId, isBookingIdCollision, BookingIdExhaustedError, generateBookingId, MAX_ID_ATTEMPTS } = require('../utils/bookingId');

const idCollision = () => Object.assign(new Error('E11000 duplicate key error collection: bookings index: bookingId_1'), { code: 11000, keyPattern: { bookingId: 1 } });

test('generateBookingId keeps the CZ-year-number format', () => {
  assert.match(generateBookingId(), /^CZ-\d{4}-\d{4}$/);
});

test('first ID is used when there is no collision', async () => {
  const seen = [];
  const result = await createWithUniqueBookingId(async (id) => { seen.push(id); return { id }; }, { firstId: 'CZ-2026-1111' });
  assert.deepEqual(seen, ['CZ-2026-1111']);
  assert.equal(result.id, 'CZ-2026-1111');
});

test('a collision regenerates the ID and retries', async () => {
  const taken = new Set(['CZ-2026-1111', 'CZ-2026-2222']);
  const fresh = ['CZ-2026-2222', 'CZ-2026-3333'];
  const result = await createWithUniqueBookingId(async (id) => {
    if (taken.has(id)) throw idCollision();
    return { id };
  }, { firstId: 'CZ-2026-1111', generate: () => fresh.shift() });
  assert.equal(result.id, 'CZ-2026-3333');
});

test('gives up with BookingIdExhaustedError after 5 attempts in total', async () => {
  let calls = 0;
  await assert.rejects(
    createWithUniqueBookingId(async () => { calls += 1; throw idCollision(); }, { generate: () => 'CZ-2026-9999' }),
    (err) => err instanceof BookingIdExhaustedError && err.message === 'Could not generate a unique booking ID. Please try again.',
  );
  assert.equal(calls, 5);
  assert.equal(MAX_ID_ATTEMPTS, 5);
});

test('other errors are not retried', async () => {
  let calls = 0;
  await assert.rejects(createWithUniqueBookingId(async () => { calls += 1; throw new Error('boom'); }), /boom/);
  assert.equal(calls, 1);
});

test('a duplicate key on a different field is not treated as an ID collision', async () => {
  const other = Object.assign(new Error('E11000 duplicate key'), { code: 11000, keyPattern: { email: 1 } });
  assert.equal(isBookingIdCollision(other), false);
  let calls = 0;
  await assert.rejects(createWithUniqueBookingId(async () => { calls += 1; throw other; }), /duplicate key/);
  assert.equal(calls, 1);
});

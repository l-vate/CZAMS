// Booking IDs look like CZ-2026-4821 (CZ, year, 4 random digits) and back job IDs like BJ-2026-4821.
// Only 9,000 values exist per year, so two records can land on the same one. The database's unique
// index rejects the second (duplicate key error 11000); createWithUniqueBookingId and
// createWithUniqueBackJobId catch that, draw a new ID and retry.
const MAX_ID_ATTEMPTS = 5;

function generateBookingId() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CZ-${year}-${rand}`;
}

function generateBackJobId() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `BJ-${year}-${rand}`;
}

// True only for a duplicate key error on the given field's index, not on any other unique field.
function isCollisionOn(field, err) {
  if (err?.code !== 11000) return false;
  if (err.keyPattern) return field in err.keyPattern;
  return new RegExp(field).test(err.message || '');
}
const isBookingIdCollision = (err) => isCollisionOn('bookingId', err);
const isBackJobIdCollision = (err) => isCollisionOn('backJobId', err);

class BookingIdExhaustedError extends Error {
  constructor() {
    super('Could not generate a unique booking ID. Please try again.');
    this.name = 'BookingIdExhaustedError';
  }
}

class BackJobIdExhaustedError extends Error {
  constructor() {
    super('Could not generate a unique back job ID. Please try again.');
    this.name = 'BackJobIdExhaustedError';
  }
}

// create(id) must insert the record with that ID and return it. Tried with `firstId` (or a fresh
// ID), then with a new ID after each collision, up to maxAttempts times in all. Any other error is
// rethrown as is. generate and maxAttempts exist so a test can force a collision.
async function retryOnCollision(create, { firstId, generate, maxAttempts, isCollision, Exhausted }) {
  let id = firstId || generate();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await create(id);
    } catch (err) {
      if (!isCollision(err)) throw err;
      id = generate();
    }
  }
  throw new Exhausted();
}

function createWithUniqueBookingId(create, { firstId, generate = generateBookingId, maxAttempts = MAX_ID_ATTEMPTS } = {}) {
  return retryOnCollision(create, { firstId, generate, maxAttempts, isCollision: isBookingIdCollision, Exhausted: BookingIdExhaustedError });
}

function createWithUniqueBackJobId(create, { firstId, generate = generateBackJobId, maxAttempts = MAX_ID_ATTEMPTS } = {}) {
  return retryOnCollision(create, { firstId, generate, maxAttempts, isCollision: isBackJobIdCollision, Exhausted: BackJobIdExhaustedError });
}

module.exports = {
  generateBookingId, createWithUniqueBookingId, isBookingIdCollision, BookingIdExhaustedError,
  generateBackJobId, createWithUniqueBackJobId, isBackJobIdCollision, BackJobIdExhaustedError,
  MAX_ID_ATTEMPTS,
};

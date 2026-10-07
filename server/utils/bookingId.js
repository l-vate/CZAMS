// Booking IDs look like CZ-2026-4821 (CZ, year, 4 random digits). Only 9,000 values exist per
// year, so two bookings can land on the same one. The database's unique index rejects the second
// (duplicate key error 11000); createWithUniqueBookingId catches that, draws a new ID and retries.
const MAX_ID_ATTEMPTS = 5;

function generateBookingId() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CZ-${year}-${rand}`;
}

// True only for a duplicate key error on the bookingId index, not on any other unique field.
function isBookingIdCollision(err) {
  if (err?.code !== 11000) return false;
  if (err.keyPattern) return 'bookingId' in err.keyPattern;
  return /bookingId/.test(err.message || '');
}

class BookingIdExhaustedError extends Error {
  constructor() {
    super('Could not generate a unique booking ID. Please try again.');
    this.name = 'BookingIdExhaustedError';
  }
}

// create(bookingId) must insert the booking with that ID and return it. Tried with `firstId`
// (or a fresh ID), then with a new ID after each collision, up to maxAttempts times in all.
// Any other error is rethrown as is. generate and maxAttempts exist so a test can force a collision.
async function createWithUniqueBookingId(create, { firstId, generate = generateBookingId, maxAttempts = MAX_ID_ATTEMPTS } = {}) {
  let bookingId = firstId || generate();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await create(bookingId);
    } catch (err) {
      if (!isBookingIdCollision(err)) throw err;
      bookingId = generate();
    }
  }
  throw new BookingIdExhaustedError();
}

module.exports = { generateBookingId, createWithUniqueBookingId, isBookingIdCollision, BookingIdExhaustedError, MAX_ID_ATTEMPTS };

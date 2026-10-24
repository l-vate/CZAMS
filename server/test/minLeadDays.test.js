// Run with: npm test (inside server/). The booking lead time is one number in constants/scheduling.js, and the booking route and the
// public calendar agree on it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { MIN_LEAD_DAYS } = require('../constants/scheduling');
const availability = require('../utils/availability');
const { manilaTodayKey } = require('../utils/timeBlocks');
const { addDays } = availability;
const harness = require('./helpers/createBooking');

const { state, call } = harness;
const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };

test('the lead time is defined once and the calendar reads it', () => {
  assert.equal(MIN_LEAD_DAYS, 3);
  assert.equal(availability.MIN_LEAD_DAYS, MIN_LEAD_DAYS);
});

test.describe('the booking route uses the same lead', () => {
  test.before(() => harness.install());
  test.after(() => harness.close());
  test.beforeEach(() => harness.reset({ users: [{ _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential' }], services: [cleaning] }));

  const book = (date) => call('POST', '', 'CUS1', {
    service: 'S-CLEAN', units: [{ type: 'Split Type', quantity: 1 }], date, time: 'Morning', address: 'Quezon City', contactNumber: '09171234567',
    downPaymentPercent: 50, paymentMode: 'GCash', referenceNumber: '1234567890123', lastCleanedOver6MonthsAgo: false, isActivelyLeaking: false,
  });

  test('a date one day short of the lead is refused', async () => {
    const res = await book(addDays(manilaTodayKey(), MIN_LEAD_DAYS - 1));
    assert.equal(res.status, 400);
    assert.equal(state.bookings.length, 0);
  });
});

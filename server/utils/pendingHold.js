// A Pending booking holds its date and time block (first come, first served) and a customer may have only a few Pending bookings at
// once. Both checks run while holding a lock (utils/slotLock.js), one per slot and one per customer, so two requests at the same moment
// take turns and the second one sees what the first wrote. A slot is freed the moment its booking leaves Pending, Approved and
// In Progress (cancelled by the customer, rejected or cancelled by the admin): nothing is stored, the answer is always read live.
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const scheduling = require('../constants/scheduling');
const { isSlotOpen } = require('./availability');

class PendingLimitError extends Error {
  constructor() {
    super('You have reached the limit of pending bookings. Please wait for confirmation or cancel one.');
    this.name = 'PendingLimitError';
  }
}

class SlotTakenError extends Error {
  constructor() {
    super('That date and time is already taken by another booking. Please choose another time or date.');
    this.name = 'SlotTakenError';
  }
}

const slotKey = (date, time) => `slot:${date}|${time}`;
const pendingLimitKey = (customer) => `pending:${customer}`;

// Throws PendingLimitError when the customer already has the allowed number of Pending bookings.
async function assertUnderPendingLimit(Booking, customer) {
  const waiting = await Booking.countDocuments({ customer, status: BOOKING_STATUS.PENDING, isBackJob: { $ne: true } });
  if (waiting >= scheduling.MAX_PENDING_PER_CUSTOMER) throw new PendingLimitError();
}

// Throws SlotTakenError when no pair of technicians is left in that date and block.
async function assertSlotOpen(date, time, excludeBookingId) {
  if (!(await isSlotOpen(date, time, excludeBookingId))) throw new SlotTakenError();
}

module.exports = { PendingLimitError, SlotTakenError, slotKey, pendingLimitKey, assertUnderPendingLimit, assertSlotOpen };

// "You already submitted this booking": the same customer asking for the same service, units, date and time block while an earlier
// request for it is still alive (Pending, Approved or In Progress). A cancelled or completed one does not count, so a customer can book
// again. The check runs while holding duplicateKey()'s lock (utils/slotLock.js), so two copies sent at the same moment cannot both pass.
const { BOOKING_STATUS } = require('../constants/bookingStatus');

const ALIVE = [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS];

// The units of a booking as one comparable text: each type with its quantity, in a fixed order (brand and model are not part of it).
const unitsSignature = (units) => (units || [])
  .map((u) => `${u.type}x${u.quantity}`)
  .sort()
  .join(',');

const duplicateKey = ({ customer, date, time, service }) => `dup:${customer}|${date}|${time}|${service}`;

class DuplicateBookingError extends Error {
  constructor() {
    super('You already submitted this booking');
    this.name = 'DuplicateBookingError';
  }
}

async function findActiveDuplicate(Booking, { customer, date, time, service, units }) {
  const candidates = await Booking.find({ customer, date, time, status: { $in: ALIVE } }).select('bookingId units service');
  const wanted = unitsSignature(units);
  const serviceId = (b) => String(b.service && b.service._id !== undefined ? b.service._id : b.service);
  return candidates.find((b) => serviceId(b) === String(service) && unitsSignature(b.units) === wanted) || null;
}

module.exports = { duplicateKey, unitsSignature, findActiveDuplicate, DuplicateBookingError };

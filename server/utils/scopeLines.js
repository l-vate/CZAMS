// The scope of works on a booking: the admin builds it as lines (dismantling, installation, excess pipe, distance, other). The pure
// rules live here: what a line may hold, which bookings may be changed, what a change may do to the totals, and the sentences the
// customer is told. The routes (routes/scopeLineRoutes.js) only load, save and notify.
//
// How the lines count (utils/pricing.js): dismantling, installation, excess pipe and other are SERVICE lines, so the Senior/PWD
// discount applies to them; a distance line is a CHARGE and never is. Lines never touch the down payment: it works off the units alone, so
// a down payment already requested or paid never moves and only the remaining balance does.
const { invalid } = require('./validation');
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const { PAYMENT_STATUS, BALANCE_PAYMENT_STATUS } = require('../constants/paymentStatus');
const constants = require('../constants/scopeLines.json');
const { getBookingBasePrice, getPaymentBreakdown, getVatAmount, scopeLinesOf } = require('./pricing');
const { SERVICE_TYPE } = require('../constants/serviceTypes');

const { kinds: KINDS, presets: PRESETS, limits: LIMITS } = constants;
const EDITABLE_STATUSES = [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS];
const REASON_MIN = 3;

const roundMoney = (n) => Math.round(n * 100) / 100;
const peso = (n) => `₱${Number(n).toLocaleString('en-US', Number.isInteger(Number(n)) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// What an admin may send for one line. `existing` is the line being edited (its values fill what is not sent), absent for a new line.
// Returns { problem, values }: problem is null or { status, message }; values are { kind, description, quantity, unitLabel, unitRate, amount }.
function readLineInput(body = {}, existing = null) {
  const kind = body.kind !== undefined ? body.kind : existing?.kind;
  if (!KINDS.includes(kind)) return { problem: invalid(`Choose the kind of line: ${KINDS.join(', ')}.`) };
  const preset = PRESETS[kind];

  let description = body.description !== undefined ? body.description : existing?.description;
  description = typeof description === 'string' ? description.trim() : '';
  if (!description && kind !== 'other') description = preset.description;
  if (!description) return { problem: invalid('Describe the work for an Other line.') };
  if (description.length > LIMITS.description) return { problem: invalid(`Keep the description to ${LIMITS.description} characters or fewer.`) };

  const quantity = body.quantity !== undefined ? Number(body.quantity) : (existing ? existing.quantity : 1);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > LIMITS.maxQuantity) {
    return { problem: invalid(`The quantity must be more than 0 and at most ${LIMITS.maxQuantity}.`) };
  }

  let unitLabel = body.unitLabel !== undefined ? body.unitLabel : existing?.unitLabel;
  unitLabel = typeof unitLabel === 'string' ? unitLabel.trim() : '';
  if (!unitLabel) unitLabel = preset.unitLabel;
  if (unitLabel.length > LIMITS.unitLabel) return { problem: invalid(`Keep the unit name to ${LIMITS.unitLabel} characters or fewer.`) };

  const rawRate = body.unitRate !== undefined ? body.unitRate : existing?.unitRate;
  const unitRate = rawRate === undefined || rawRate === null || rawRate === '' ? NaN : Number(rawRate);
  if (!Number.isFinite(unitRate) || unitRate < 0) return { problem: invalid('Enter the rate for one unit, 0 or more.') };

  const amount = roundMoney(quantity * unitRate);
  if (amount > LIMITS.maxAmount) return { problem: invalid(`A single line cannot be more than ${peso(LIMITS.maxAmount)}.`) };
  return { problem: null, values: { kind, description, quantity, unitLabel, unitRate: roundMoney(unitRate), amount } };
}

// The reason an edit or a removal must carry.
function readReason(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text.length < REASON_MIN) return { problem: invalid(`Give a short reason of at least ${REASON_MIN} characters.`) };
  if (text.length > LIMITS.reason) return { problem: invalid(`Keep the reason to ${LIMITS.reason} characters or fewer.`) };
  return { problem: null, reason: text };
}

// The booking as it would be with `lines` as its scope of works: a plain copy, so the real document is untouched while the totals
// are tried. The distance based charge field follows the distance lines (they are the same charge, never counted twice).
function withLines(booking, lines) {
  const plain = typeof booking.toObject === 'function' ? booking.toObject() : { ...booking };
  const distance = lines.filter((l) => l.kind === 'distance');
  return {
    ...plain,
    service: booking.service,
    scopeLines: lines,
    distanceAdjustment: distance.length > 0 ? distance.reduce((sum, l) => sum + l.amount, 0) : 0,
  };
}

// What the customer owes in all, as they are told it: the base price, plus the 12% VAT for a commercial client unless the quoted prices
// already include it.
function totalOwed(booking) {
  const base = getBookingBasePrice(booking);
  return booking.isCommercial && !booking.taxInclusive ? base + getVatAmount(booking) : base;
}

// null when the lines may be changed to `after`, otherwise { status, message }.
function scopeChangeProblem(booking, after) {
  if (!EDITABLE_STATUSES.includes(booking.status)) {
    return invalid('The scope of works can only be changed while a booking is Pending, Approved or In Progress.');
  }
  if (booking.isBackJob) return invalid('A free back job visit has no charges, so it has no scope of works.');
  // The price of an Installation service already is the installation, so a new "Installation" line would charge it a second time. Dismantling,
  // excess pipe, distance and other work can still be added; a line that was already there stays editable.
  if (booking.service?.serviceType === SERVICE_TYPE.INSTALLATION) {
    const installLines = (b) => scopeLinesOf(b).filter((l) => l.kind === 'installation').length;
    if (installLines(after) > installLines(booking)) {
      return invalid('The installation is already part of this service price, so adding an Installation line would charge it twice. Add dismantling, excess pipe or other work instead.');
    }
  }
  if (booking.balancePaid || [BALANCE_PAYMENT_STATUS.PAID, BALANCE_PAYMENT_STATUS.TO_VERIFY].includes(booking.balancePaymentStatus)) {
    return invalid('The balance has already been paid or is waiting to be checked, so the scope of works can no longer change the total. Handle a difference through the refund flow.');
  }
  const paid = [PAYMENT_STATUS.PARTIALLY_PAID, PAYMENT_STATUS.FULLY_PAID].includes(booking.paymentStatus) ? (booking.downPaymentPaidAmount || 0) : 0;
  const newTotal = getBookingBasePrice(after);
  if (paid > newTotal) {
    return invalid(`The customer has already paid ${peso(paid)}, which is more than the new total of ${peso(newTotal)}. That change is not allowed here: handle the difference through the refund flow.`);
  }
  return null;
}

const lineView = (l) => ({ kind: l.kind, description: l.description, quantity: l.quantity, unitLabel: l.unitLabel, unitRate: l.unitRate, amount: l.amount });
const describeLine = (l) => `${l.description} (${l.quantity} ${l.unitLabel} at ${peso(l.unitRate)} = ${peso(l.amount)})`;

// The sentence the customer is notified with after an add, an edit or a removal, with the new total.
function changeMessage(bookingId, action, line, before, total) {
  const what = action === 'added' ? `${describeLine(line)} was added to the scope of works`
    : action === 'removed' ? `${describeLine(line)} was removed from the scope of works`
      : `${describeLine(before)} was changed to ${describeLine(line)}`;
  return `Booking ${bookingId}: ${what}. Your new total is ${peso(total)}.`;
}

module.exports = {
  KINDS, PRESETS, LIMITS, EDITABLE_STATUSES, REASON_MIN,
  readLineInput, readReason, withLines, totalOwed, scopeChangeProblem, lineView, describeLine, changeMessage, scopeLinesOf, peso,
  getPaymentBreakdown, getVatAmount,
};

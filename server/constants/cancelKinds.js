// The only two reasons for which an admin may keep part of a down payment when cancelling a booking. Every other cancellation (the customer's own,
// the owner who cannot supply or serve, an expired booking, a confirmed no show) refunds the whole down payment. The admin types the amount.
// The keys are what the cancel request sends (src/utils/cancelBooking.js has the same keys for the dialog); the labels are what the customer reads.
const CANCEL_KIND = Object.freeze({
  CUSTOMER_UNAVAILABLE: 'customer_unavailable',
  TECHNICIANS_ON_THE_WAY: 'technicians_on_the_way',
});

const CANCEL_KIND_LABEL = Object.freeze({
  [CANCEL_KIND.CUSTOMER_UNAVAILABLE]: 'Customer not available at the address',
  [CANCEL_KIND.TECHNICIANS_ON_THE_WAY]: 'Technicians already on the way',
});

const CANCEL_KIND_VALUES = Object.values(CANCEL_KIND);

module.exports = { CANCEL_KIND, CANCEL_KIND_LABEL, CANCEL_KIND_VALUES };

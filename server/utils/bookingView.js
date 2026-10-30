// The admin's shape of a booking: the document as a plain object plus its computed warranty status and where an Installation unit came
// from. Every route that returns a booking includes it, otherwise the admin detail view loses that section the moment any other field
// gets updated. Shared by the booking routes and the scope of works routes.
const { getWarrantyStatus, unitSourceOf } = require('./warranty');
const { quotationOf } = require('./quotation');
const { paymentDueOf, approvalPaymentBlock, unitAwaitingConfirmation } = require('./paymentDue');

function withWarranty(booking) {
  const obj = booking.toObject();
  obj.warranty = getWarrantyStatus(booking);
  obj.unitSource = unitSourceOf(booking); // where an Installation unit came from: 'company' or 'customer'
  obj.quotationTerms = quotationOf(booking); // the effective duration, exclusions and warranty terms (null for any other service)
  // Worked out here so the admin's screen never re-derives the money rules: what is due from the customer now, why Approve is not available yet
  // (a sentence for the admin, or null), and whether the booking waits for the owner to confirm the unit.
  obj.paymentDue = paymentDueOf(booking);
  obj.approvalBlock = booking.status === 'Pending' ? approvalPaymentBlock(booking) : null;
  obj.awaitingUnitConfirmation = unitAwaitingConfirmation(booking);
  return obj;
}

module.exports = { withWarranty };

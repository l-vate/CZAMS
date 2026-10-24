// The admin's shape of a booking: the document as a plain object plus its computed warranty status and where an Installation unit came
// from. Every route that returns a booking includes it, otherwise the admin detail view loses that section the moment any other field
// gets updated. Shared by the booking routes and the scope of works routes.
const { getWarrantyStatus, unitSourceOf } = require('./warranty');
const { quotationOf } = require('./quotation');

function withWarranty(booking) {
  const obj = booking.toObject();
  obj.warranty = getWarrantyStatus(booking);
  obj.unitSource = unitSourceOf(booking); // where an Installation unit came from: 'company' or 'customer'
  obj.quotationTerms = quotationOf(booking); // the effective duration, exclusions and warranty terms (null for any other service)
  return obj;
}

module.exports = { withWarranty };

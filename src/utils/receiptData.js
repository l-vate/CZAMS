// Turns a saved booking into the figures the invoice / receipt shows. Used by the customer pages and
// by the admin booking modal and payments page, so all of them print the same document.
import { getBookingLineItems, getPaymentBreakdown } from './bookingPricing';
import { isBookingFullyPaid } from './receiptStatus';

export { isBookingFullyPaid, documentTitle } from './receiptStatus';

// `person` is who the document is made out to: { customerName, contactNumber }.
export function buildReceiptForm(booking, { customerName, contactNumber }) {
  const { lineItems, basePrice, discountAmount, discountLabel } = getBookingLineItems(booking);
  const downPaymentPercent = booking.downPaymentPercent ?? null;
  const { downPayment: toPayNow, balance: remaining } = getPaymentBreakdown(booking);

  return {
    id: booking.bookingId,
    createdAt: booking.createdAt,
    customerName: customerName || '-',
    address: booking.address,
    contactNumber: contactNumber || '-',
    service: booking.service?.name || booking.service?.category || '-',
    lineItems,
    basePrice,
    toPayNow,
    remaining,
    discountAmount,
    discountLabel,
    downPaymentPercent,
    paymentMode: booking.paymentMode,
    paymentMode2: booking.paymentMode2,
    isFullyPaid: isBookingFullyPaid(booking),
    isCommercial: booking.isCommercial,
    vatAmount: booking.vatAmount,
    taxInclusive: booking.taxInclusive,
    quotationTerms: booking.quotationTerms,
    site: booking.site,
    poNumber: booking.poNumber,
    paymentTermsDays: booking.paymentTermsDays,
    paymentDueAt: booking.paymentDueAt,
    referenceNumber: booking.referenceNumber,
    balanceReferenceNumber: booking.balanceReferenceNumber,
  };
}

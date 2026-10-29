// Run with: npm test (inside server/). E17-9: a cancelled booking is a record the customer can keep looking at. The confirmation screen has a
// "View booking details" button; opened from My Bookings or an email, a cancelled booking shows read-only details with who cancelled it, when,
// why, and the money (amount, fee, refund) in plain words; no action buttons; only the owner and the admin can open it. No database; the client
// files are loaded through Vite.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const harness = require('./helpers/createBooking');
const { startSsrServer } = require('./helpers/viteSsr');
const { renderNotificationEmail } = require('../utils/emailTemplate');
const { toCustomerView } = require('../utils/customerView');

const root = path.join(__dirname, '..', '..');
const fromRoot = createRequire(path.join(root, 'package.json'));
const { state, call, addBooking, goodDate } = harness;

let vite;
let closeVite;
// the booking page reads the signed-in user from localStorage when it loads
before(async () => {
  global.localStorage = { getItem: () => JSON.stringify({ name: 'Customer One', role: 'customer', phone: '09171234567' }), setItem() {}, removeItem() {} };
  harness.install();
  ({ vite, close: closeVite } = await startSsrServer());
});
after(async () => { delete global.localStorage; await harness.close(); await closeVite(); });

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const users = [
  { _id: 'CUS1', role: 'customer', isActive: true, name: 'Customer One', email: 'one@example.test' },
  { _id: 'CUS2', role: 'customer', isActive: true, name: 'Customer Two', email: 'two@example.test' },
  { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' },
];
test.beforeEach(() => harness.reset({ users, services: [cleaning] }));

const cancelled = (over = {}) => ({
  _id: 'B1', bookingId: 'CZ-2026-0001', status: 'Cancelled', service: { name: 'Cleaning', serviceType: 'Cleaning', price: 1000, unitTypePricing: [] },
  units: [{ type: 'Split Type', quantity: 2, hp: '1', brandModel: 'Daikin' }], date: '2026-11-12', time: 'Morning', address: 'Quezon City', contactNumber: '09171234567',
  downPaymentPercent: 50, discount: { status: 'None' }, scopeLines: [], paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000, paymentMode: 'GCash',
  cancelledAt: '2026-11-10T02:00:00.000Z', cancelledBy: 'customer', customer: { _id: 'CUS1', name: 'Customer One' }, refund: { status: 'None' }, ...over,
});
const refund = (over) => ({ status: 'Pending', isSameDay: false, downPaymentAmount: 1000, ...over });

test('the money in plain words: the amount and what happens next, for every case', async () => {
  const { refundText, NO_DOWN_PAYMENT_TEXT, PROOF_WAITING_TEXT } = await vite.ssrLoadModule('/src/utils/cancelledSummary.js');
  assert.equal(refundText(cancelled()), NO_DOWN_PAYMENT_TEXT);
  assert.equal(NO_DOWN_PAYMENT_TEXT, "No down payment was on file for this booking, so there's nothing to refund.");
  assert.equal(refundText(cancelled({ paymentStatus: 'to_verify' })), PROOF_WAITING_TEXT, 'a proof still being checked is not "no down payment on file"');
  const early = refundText(cancelled({ refund: refund({ refundableAmount: 1000, dispatchDeduction: 0 }) }));
  assert.match(early, /down payment of ₱1,000 will be refunded in full/);
  assert.match(early, /Our team will review it and send the refund, and you will be told here and in the app/);
  const lateNoFee = refundText(cancelled({ refund: refund({ isSameDay: true }) }));
  assert.match(lateNoFee, /transportation fee may be deducted from your down payment of ₱1,000/);
  assert.match(lateNoFee, /will decide the fee and then send the refund/);
  const lateFee = refundText(cancelled({ refund: refund({ isSameDay: true, dispatchDeduction: 350, dispatchReason: 'Fuel and the crew trip', refundableAmount: 650 }) }));
  assert.match(lateFee, /Your refund is ₱650: your down payment of ₱1,000 minus a transportation fee of ₱350 \(Fuel and the crew trip\)/);
  const owner = refundText(cancelled({ ownerCancelled: true, refund: refund({ ownerInitiated: true, refundableAmount: 1000, dispatchDeduction: 0 }) }));
  assert.match(owner, /whole down payment of ₱1,000 will be refunded, with no transportation fee/);
  const sent = refundText(cancelled({ refund: refund({ status: 'Processed', isSameDay: true, dispatchDeduction: 350, dispatchReason: 'Fuel', refundableAmount: 650 }) }));
  assert.match(sent, /Your refund of ₱650 has been sent/);
  assert.match(sent, /transportation fee of ₱350 was deducted from your down payment of ₱1,000 \(Fuel\)/);
  for (const text of [early, lateNoFee, lateFee, owner, sent]) assert.equal(/\u2014|\u2013/.test(text), false, 'no long dashes');
});

test('who cancelled it', async () => {
  const { cancelledByText } = await vite.ssrLoadModule('/src/utils/cancelledSummary.js');
  assert.match(cancelledByText(cancelled()), /You cancelled this booking/);
  assert.match(cancelledByText(cancelled({ cancelledBy: 'admin' })), /Cancelled by the owner/);
  assert.match(cancelledByText(cancelled({ cancelledBy: 'admin', ownerCancelled: true })), /owner cancelled this booking because we could not supply or serve it/);
  assert.match(cancelledByText({}), /was cancelled/);
});

test('the figures: a late cancel shows the fee and its reason; an owner cancel shows no fee; no refund case shows none', async () => {
  const { refundFigures } = await vite.ssrLoadModule('/src/utils/cancelledSummary.js');
  assert.deepEqual(refundFigures(cancelled()), []);
  const late = refundFigures(cancelled({ refund: refund({ isSameDay: true, dispatchDeduction: 350, dispatchReason: 'Fuel', refundableAmount: 650 }) }));
  assert.deepEqual(late, [['Down payment', '₱1,000'], ['Transportation fee', '₱350'], ['Reason for the fee', 'Fuel'], ['Refund amount', '₱650'], ['Refund status', 'Being processed']]);
  const owner = refundFigures(cancelled({ ownerCancelled: true, refund: refund({ ownerInitiated: true, refundableAmount: 1000, dispatchDeduction: 0 }) }));
  assert.deepEqual(owner, [['Down payment', '₱1,000'], ['Transportation fee', 'None (the owner cancelled)'], ['Refund amount', '₱1,000'], ['Refund status', 'Being processed']]);
});

const renderComponent = async (name, props) => {
  const React = fromRoot('react');
  const { renderToStaticMarkup } = fromRoot('react-dom/server');
  const { MemoryRouter } = fromRoot('react-router-dom');
  const mod = await vite.ssrLoadModule('/src/pages/customer/book_details.jsx');
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(mod[name], props)));
};

test('the confirmation screen has a third button, "View booking details", with the other two', async () => {
  const html = await renderComponent('BookingCancelled', { booking: cancelled(), bookingId: 'CZ-2026-0001', refund: cancelled().refund, onBookAgain() {}, onBackToDashboard() {}, onViewDetails() {} });
  for (const label of ['Back to Dashboard', 'View booking details', 'Book Another Service']) assert.match(html, new RegExp(label));
  assert.match(html, /cancelled-view-btn/);
  assert.match(html, /No down payment was on file for this booking, so there&#x27;s nothing to refund\./);
  const withMoney = await renderComponent('BookingCancelled', { booking: cancelled({ refund: refund({ refundableAmount: 1000 }) }), bookingId: 'CZ-2026-0001', refund: refund({ refundableAmount: 1000 }), onBookAgain() {}, onBackToDashboard() {}, onViewDetails() {} });
  assert.match(withMoney, /down payment of ₱1,000 will be refunded in full/);
  assert.doesNotMatch(withMoney, /nothing to refund/);
});

test('the cancellation record names who, when, why and the money', async () => {
  const html = await renderComponent('CancelledSummary', {
    booking: cancelled({ cancelledBy: 'admin', ownerCancelled: true, cancelReason: 'We do not carry that brand', refund: refund({ ownerInitiated: true, refundableAmount: 1000, dispatchDeduction: 0 }) }),
    formatWhen: (d) => `on ${d.slice(0, 10)}`,
  });
  assert.match(html, /owner cancelled this booking because we could not supply or serve it/);
  assert.match(html, /Cancelled on on 2026-11-10/);
  assert.match(html, /Reason:<\/strong> We do not carry that brand/);
  assert.match(html, /whole down payment of ₱1,000 will be refunded, with no transportation fee/);
  assert.match(html, /None \(the owner cancelled\)/);
});

test('the details page for a cancelled booking is read-only: a Cancelled badge, the record, and no action button', async () => {
  const React = fromRoot('react');
  const { renderToStaticMarkup } = fromRoot('react-dom/server');
  const { MemoryRouter, Routes, Route } = fromRoot('react-router-dom');
  const Page = (await vite.ssrLoadModule('/src/pages/customer/book_details.jsx')).default;
  {
    const booking = cancelled({ cancelledBy: 'admin', ownerCancelled: true, cancelReason: 'We do not carry that brand', refund: refund({ ownerInitiated: true, refundableAmount: 1000, dispatchDeduction: 0 }) });
    const html = renderToStaticMarkup(React.createElement(
      MemoryRouter,
      { initialEntries: [{ pathname: '/customer/book_details/CZ-2026-0001', state: { booking } }] },
      React.createElement(Routes, null, React.createElement(Route, { path: '/customer/book_details/:bookingId', element: React.createElement(Page) })),
    ));
    assert.match(html, /Booking Cancelled/);
    assert.match(html, /status-badge cancelled">Cancelled</);
    assert.match(html, /Cancellation/);
    assert.match(html, /Booking ID: CZ-2026-0001/);
    assert.match(html, /Split Type/);
    assert.match(html, /Daikin/);
    for (const action of ['Reschedule', 'Cancel booking', 'Pay ', 'Upload', 'Report an Issue', 'Pick New Date']) assert.equal(html.includes(action), false, `no "${action}" on a cancelled booking`);
    assert.doesNotMatch(html, /Yes, cancel it/);
  }
});

test('the booking page source: the confirmation shows only right after cancelling, and both cards sit next to each other', () => {
  const page = fs.readFileSync(path.join(root, 'src', 'pages', 'customer', 'book_details.jsx'), 'utf8');
  assert.match(page, /if \(cancelled && justCancelled\)/);
  assert.match(page, /setJustCancelled\(true\)/);
  assert.match(page, /onViewDetails=\{\(\) => setJustCancelled\(false\)\}/);
  assert.match(page, /<EmailStatusCard bookingId=\{booking\.bookingId\} \/>/);
  assert.match(page, /In-app notification/);
});

test('My Bookings links every booking, a cancelled one too, to the same details page', () => {
  const list = fs.readFileSync(path.join(root, 'src', 'pages', 'customer', 'my_bookings.jsx'), 'utf8');
  assert.match(list, /navigate\(`\/customer\/book_details\/\$\{booking\.bookingId\}`/);
  const block = list.slice(list.indexOf('view-details-btn') - 200, list.indexOf('view-details-btn') + 300);
  assert.equal(/status\s*[!=]==?\s*BOOKING_STATUS\.CANCELLED/.test(block), false, 'no condition hides the link for a cancelled booking');
});

test('the email "View booking" button for a cancelled booking opens the same page', () => {
  const { html } = renderNotificationEmail({
    type: 'booking_cancelled', message: 'Your booking CZ-2026-0001 was cancelled by our team.', appUrl: 'https://app.example.test', booking: cancelled(), recipientRole: 'customer',
  });
  assert.ok(html.includes('href="https://app.example.test/customer/book_details/CZ-2026-0001"'));
  assert.match(html, />View booking</);
});

// ---- who may open it (the real route)
const stored = () => addBooking({
  bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Cancelled', units: [{ type: 'Split Type', quantity: 1 }], date: goodDate(7), time: 'Morning',
  downPaymentPercent: 50, paymentStatus: 'partially_paid', downPaymentPaidAmount: 500, cancelledBy: 'admin', ownerCancelled: true, cancelReason: 'We do not carry that brand', cancelledAt: new Date(),
  refund: { status: 'Pending', ownerInitiated: true, reason: 'We do not carry that brand', isSameDay: false, downPaymentAmount: 500, refundableAmount: 500, dispatchDeduction: 0 },
  discount: { type: 'Senior', status: 'Approved', idPhoto: '/uploads/id/secret-id.png', consentGiven: true },
  technicianInstructions: 'internal note', queueRank: 3,
});

test('the owner can open it and gets the cancellation fields, never the ID photo or internal notes', async () => {
  stored();
  const res = await call('GET', '/CZ-1', 'CUS1');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'Cancelled');
  assert.equal(res.body.ownerCancelled, true);
  assert.equal(res.body.cancelReason, 'We do not carry that brand');
  assert.equal(res.body.refund.ownerInitiated, true);
  assert.equal(res.body.refund.refundableAmount, 500);
  const dump = JSON.stringify(res.body);
  for (const leak of ['secret-id', 'internal note', 'queueRank']) assert.equal(dump.includes(leak), false, leak);
});

test('another customer cannot open it', async () => {
  stored();
  const res = await call('GET', '/CZ-1', 'CUS2');
  assert.ok([403, 404].includes(res.status), String(res.status));
  assert.equal(JSON.stringify(res.body).includes('We do not carry'), false);
});

test('the admin can open it through the admin list', async () => {
  stored();
  const res = await call('GET', '', 'ADM1', undefined, { role: 'admin' });
  assert.equal(res.status, 200);
  const list = Array.isArray(res.body) ? res.body : res.body.bookings || [];
  assert.ok(list.some((b) => b.bookingId === 'CZ-1' && b.status === 'Cancelled'));
  assert.equal(state.bookings.length, 1);
});

test('no cancelled-view field leaks an admin id: the customer view of a cancelled booking is whitelisted', () => {
  const view = toCustomerView({ ...state.bookings[0], bookingId: 'CZ-9', status: 'Cancelled', ownerCancelled: true, cancelReason: 'x reason', unitDecline: { reason: 'r', note: 'n', declinedBy: 'ADM1', declinedAt: new Date() }, refund: { status: 'Pending', ownerInitiated: true, reason: 'x reason', processedBy: 'ADM1' } });
  assert.equal(JSON.stringify(view).includes('ADM1'), false);
});

// Run with: npm test (inside server/). E17-5: "Before you pay" is its own step right before Payment (for a service that has the block), the step
// counter follows, the optional "I may need these works" checklist is saved, shown to the admin and in the new booking notification, and never
// changes the price. No database; the client files are loaded through Vite.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const harness = require('./helpers/createBooking');
const { startSsrServer } = require('./helpers/viteSsr');
const { readMayNeedWorks, describeMayNeedWorks } = require('../utils/mayNeedWorks');
const { toCustomerView } = require('../utils/customerView');
const { getPaymentBreakdown } = require('../utils/pricing');

const root = path.join(__dirname, '..', '..');
const fromRoot = createRequire(path.join(root, 'package.json'));
const { state, post, goodDate, addCatalogUnit } = harness;

let vite;
let closeVite;
before(async () => { harness.install(); ({ vite, close: closeVite } = await startSsrServer()); });
after(async () => { await harness.close(); await closeVite(); });

const install = { _id: 'S-INST', name: 'Installation', serviceType: 'Installation', price: 5000, isActive: true };
const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const users = [{ _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' }, { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' }];
test.beforeEach(() => harness.reset({ users, services: [install, cleaning] }));

test('step order: an Installation has Before you pay right before Payment (6 steps); every other service keeps 5', async () => {
  const { bookingSteps, STEP_ID } = await vite.ssrLoadModule('/src/utils/bookingSteps.js');
  const withBlock = bookingSteps({ serviceType: 'Installation' });
  assert.deepEqual(withBlock.map((s) => s.id), [STEP_ID.SERVICE, STEP_ID.UNIT, STEP_ID.SCHEDULE, STEP_ID.BEFORE_YOU_PAY, STEP_ID.PAYMENT, STEP_ID.SUMMARY]);
  assert.deepEqual(withBlock.map((s) => s.label), ['Choose Service', 'Unit Details', 'Location & Schedule', 'Before you pay', 'Payment', 'Booking Summary']);
  const without = bookingSteps({ serviceType: 'Cleaning' });
  assert.deepEqual(without.map((s) => s.label), ['Choose Service', 'Unit Details', 'Location & Schedule', 'Payment', 'Booking Summary']);
  assert.equal(bookingSteps(undefined).length, 5, 'before a service is chosen the count is the usual one');
});

test('the step counter: Step 5 of 6 for Payment on an Installation, Step 4 of 5 on any other service', async () => {
  const { bookingSteps, stepCounter } = await vite.ssrLoadModule('/src/utils/bookingSteps.js');
  const inst = bookingSteps({ serviceType: 'Installation' });
  assert.equal(stepCounter(inst, 4), 'Step 4 of 6 - Before you pay');
  assert.equal(stepCounter(inst, 5), 'Step 5 of 6 - Payment');
  const other = bookingSteps({ serviceType: 'Cleaning' });
  assert.equal(stepCounter(other, 4), 'Step 4 of 5 - Payment');
});

test('the Payment step no longer carries the terms; the new step does, with the callout in the exact words', async () => {
  const page = fs.readFileSync(path.join(root, 'src', 'pages', 'customer', 'book_service.jsx'), 'utf8');
  assert.doesNotMatch(page, /<QuotationTerms/, 'the terms moved out of the Payment step');
  const React = fromRoot('react');
  const { renderToStaticMarkup } = fromRoot('react-dom/server');
  const Step = (await vite.ssrLoadModule('/src/components/before_you_pay_step.jsx')).default;
  const html = renderToStaticMarkup(React.createElement(Step, { form: {}, setForm() {} }));
  assert.match(html, /Before you pay/);
  assert.match(html, /Estimated time/);
  assert.match(html, /Not included in the price/);
  assert.match(html, /Warranty/);
  const callout = 'If any of these are needed, or your site needs extra work such as longer pipe or a distance charge, the owner will get back to you with a quotation and the updated total. You will see it on your booking.';
  assert.ok(html.includes(callout), 'the callout wording is exact');
  assert.match(html, /role="note"/);
  assert.equal(/\u2014|\u2013/.test(html), false, 'no dashes of the long kind in the text');
});

test('the checklist offers feeder line, carpentry, masonry, electrical and Other (with a short text once ticked)', async () => {
  const React = fromRoot('react');
  const { renderToStaticMarkup } = fromRoot('react-dom/server');
  const Step = (await vite.ssrLoadModule('/src/components/before_you_pay_step.jsx')).default;
  const plain = renderToStaticMarkup(React.createElement(Step, { form: {}, setForm() {} }));
  for (const label of ['Feeder line', 'Carpentry', 'Masonry', 'Electrical', 'Other']) assert.match(plain, new RegExp(`<span>${label}</span>`));
  assert.match(plain, /I may need these works \(optional\)/);
  assert.doesNotMatch(plain, /What other work\?/, 'no text box until Other is ticked');
  const ticked = renderToStaticMarkup(React.createElement(Step, { form: { mayNeedWorks: { other: true, otherText: 'new outlet' } }, setForm() {} }));
  assert.match(ticked, /What other work\?/);
  assert.match(ticked, /value="new outlet"/);
  assert.match(plain, /does not change your price/);
});

test('the checklist is optional: nothing ticked sends nothing, and Other needs its text to go on', async () => {
  const { worksToSend, worksIncomplete } = await vite.ssrLoadModule('/src/utils/mayNeedWorks.js');
  assert.equal(worksToSend(undefined), undefined);
  assert.equal(worksToSend({ feederLine: false, carpentry: false, other: false, otherText: '' }), undefined);
  assert.equal(worksToSend({ masonry: true, otherText: '' }).masonry, true);
  assert.equal(worksIncomplete(undefined), false);
  assert.equal(worksIncomplete({ other: true, otherText: '  ' }), true);
  assert.equal(worksIncomplete({ other: true, otherText: 'outlet' }), false);
});

test('server rule: ticked works are kept, none is nothing, Other needs text, junk is refused', () => {
  assert.deepEqual(readMayNeedWorks(undefined), { problem: null, value: undefined });
  assert.deepEqual(readMayNeedWorks(JSON.stringify({ feederLine: false })), { problem: null, value: undefined });
  assert.deepEqual(readMayNeedWorks(JSON.stringify({ feederLine: true, masonry: true, bogus: true })).value, { feederLine: true, masonry: true });
  assert.ok(readMayNeedWorks(JSON.stringify({ other: true, otherText: '  ' })).problem);
  assert.ok(readMayNeedWorks(JSON.stringify({ other: true, otherText: 'x'.repeat(81) })).problem);
  assert.ok(readMayNeedWorks('not json').problem);
  assert.ok(readMayNeedWorks('[1]').problem);
  assert.equal(describeMayNeedWorks({ feederLine: true, other: true, otherText: 'a new outlet' }), 'feeder line, other: a new outlet');
});

const book = (extra = {}) => {
  const item = addCatalogUnit({ brand: 'Daikin' });
  return post({ service: 'S-INST', date: goodDate(9), clientSuppliedUnit: false, units: [{ type: 'Split Type', quantity: 1, hp: '1', brand: 'Daikin', supplied: { catalogId: item._id } }], ...extra });
};

test('a booking keeps the checklist, the customer sees their own, and the admin is told in the new booking notification', async () => {
  const res = await book({ mayNeedWorks: JSON.stringify({ feederLine: true, electrical: true, other: true, otherText: 'a new outlet' }) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual(state.bookings[0].mayNeedWorks, { feederLine: true, electrical: true, other: true, otherText: 'a new outlet' });
  assert.deepEqual(res.body.mayNeedWorks, state.bookings[0].mayNeedWorks, 'the customer sees their own ticks');
  const note = state.notes.find((n) => n.type === 'booking_new');
  assert.ok(note, 'the admin is notified of the new booking');
  assert.match(note.message, /may need: feeder line, electrical, other: a new outlet/);
  assert.match(note.message, /Send a quotation/);
});

test('without the checklist the booking is unchanged, and Other with no text is refused', async () => {
  assert.equal((await book()).status, 201);
  assert.equal(state.bookings[0].mayNeedWorks, undefined);
  assert.equal(state.notes.find((n) => n.type === 'booking_new').message.includes('may need'), false);
  harness.reset({ users, services: [install, cleaning] });
  const bad = await book({ mayNeedWorks: JSON.stringify({ other: true, otherText: '' }) });
  assert.equal(bad.status, 400);
  assert.equal(state.bookings.length, 0);
});

test('it never changes the price', async () => {
  const withWorks = await book({ mayNeedWorks: JSON.stringify({ feederLine: true, carpentry: true, masonry: true, electrical: true }) });
  assert.equal(withWorks.status, 201);
  const priced = { ...state.bookings[0], service: install };
  const total = getPaymentBreakdown(priced).total;
  harness.reset({ users, services: [install, cleaning] });
  assert.equal((await book()).status, 201);
  assert.equal(getPaymentBreakdown({ ...state.bookings[0], service: install }).total, total);
});

test('the admin booking page shows it, and a customer view carries it', async () => {
  const React = fromRoot('react');
  const { renderToStaticMarkup } = fromRoot('react-dom/server');
  const { MemoryRouter } = fromRoot('react-router-dom');
  const Modal = (await vite.ssrLoadModule('/src/components/admin_service_details_modal.jsx')).default;
  const booking = {
    _id: 'B1', bookingId: 'CZ-1', status: 'Pending', service: install, units: [{ type: 'Split Type', quantity: 1 }], downPaymentPercent: 30, discount: { status: 'None' }, scopeLines: [],
    customer: { _id: 'CUS1', name: 'Customer One' }, address: 'Quezon City', date: '2026-11-10', time: 'Morning', paymentStatus: 'Unpaid',
    mayNeedWorks: { masonry: true, other: true, otherText: 'a new outlet' },
  };
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Modal, { booking, asPage: true, onClose() {}, onUpdated() {} })));
  assert.match(html, /CUSTOMER MAY NEED THESE WORKS/);
  assert.match(html, /Masonry, other: a new outlet/);
  assert.match(html, /does not change the price/);
  assert.deepEqual(toCustomerView(booking).mayNeedWorks, booking.mayNeedWorks);
  const without = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Modal, { booking: { ...booking, mayNeedWorks: undefined }, asPage: true, onClose() {}, onUpdated() {} })));
  assert.doesNotMatch(without, /CUSTOMER MAY NEED/);
});

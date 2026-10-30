// Run with: npm test (inside server/). E25 on the customer's screens: the payment labels tell the truth (nothing says "paid" before an admin has
// verified a payment), the Billing "To Verify" and "Due" filters find what they should, the unknown-address page leads to the right home, and
// Billing and the booking page read what is due from the server. The client files are loaded through Vite; no database.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { startSsrServer } = require('./helpers/viteSsr');

let vite;
let closeVite;
before(async () => { ({ vite, close: closeVite } = await startSsrServer()); });
after(async () => { await closeVite(); });

const src = (file) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', file), 'utf8');

test('a proof that was just sent is "Waiting for verification", never partially paid or paid', async () => {
  const { customerPaymentStatus, PAYMENT_LABEL } = await vite.ssrLoadModule('/src/utils/customerPayment.js');
  assert.equal(customerPaymentStatus({ paymentStatus: 'to_verify' }).label, PAYMENT_LABEL.WAITING);
  assert.equal(customerPaymentStatus({ paymentStatus: 'Unpaid' }).label, 'Unpaid');
  assert.equal(customerPaymentStatus({ paymentStatus: 'partially_paid' }).label, 'Down payment verified');
  assert.equal(customerPaymentStatus({ paymentStatus: 'fully_paid' }).label, 'Fully paid');
  assert.equal(customerPaymentStatus({ paymentStatus: 'rejected' }).label, 'Payment rejected');
  assert.equal(customerPaymentStatus({ paymentStatus: 'partially_paid', balancePaymentStatus: 'to_verify' }).label, 'Waiting for verification', 'a balance proof waiting');
  assert.equal(customerPaymentStatus({ paymentStatus: 'partially_paid', balancePaymentStatus: 'rejected' }).label, 'Payment rejected');
  assert.equal(customerPaymentStatus({ paymentStatus: 'partially_paid', balancePaymentStatus: 'paid' }).label, 'Fully paid');
  for (const status of ['Unpaid', 'to_verify', 'rejected']) {
    const label = customerPaymentStatus({ paymentStatus: status }).label;
    assert.ok(!['Partially Paid', 'Fully paid', 'Down payment verified'].includes(label), `${status} must not read as paid: ${label}`);
  }
});

test('the rejection reason is shown for the payment that was rejected only', async () => {
  const { rejectionReasonOf } = await vite.ssrLoadModule('/src/utils/customerPayment.js');
  assert.equal(rejectionReasonOf({ paymentStatus: 'rejected', downPaymentRejectionReason: 'Wrong reference' }), 'Wrong reference');
  assert.equal(rejectionReasonOf({ paymentStatus: 'partially_paid', balancePaymentStatus: 'rejected', balanceRejectionReason: 'Blurry proof' }), 'Blurry proof');
  assert.equal(rejectionReasonOf({ paymentStatus: 'partially_paid' }), '');
});

test('Billing filters: To Verify lists every booking with a proof waiting, Due lists what is owed now', async () => {
  const { billMatchesFilter, BILL_FILTERS } = await vite.ssrLoadModule('/src/utils/customerPayment.js');
  const bill = (over) => ({ paymentStatus: 'Unpaid', due: { kind: null }, ...over });
  const proof = bill({ paymentStatus: 'to_verify', isToVerify: true });
  const balanceProof = bill({ paymentStatus: 'partially_paid', isPartiallyPaid: true, isBalanceToVerify: true });
  const owed = bill({ due: { kind: 'down' } });
  const verified = bill({ paymentStatus: 'partially_paid', isPartiallyPaid: true });
  assert.ok(BILL_FILTERS.includes('To Verify') && BILL_FILTERS.includes('Due'));
  assert.equal(billMatchesFilter(proof, 'To Verify'), true);
  assert.equal(billMatchesFilter(balanceProof, 'To Verify'), true);
  assert.equal(billMatchesFilter(owed, 'To Verify'), false);
  assert.equal(billMatchesFilter(owed, 'Due'), true);
  assert.equal(billMatchesFilter(proof, 'Due'), false);
  assert.equal(billMatchesFilter(verified, 'Down payment verified'), true);
  assert.equal(billMatchesFilter(proof, 'Down payment verified'), false);
  assert.equal(billMatchesFilter(bill({ isCancelled: true, isToVerify: true }), 'To Verify'), false, 'a cancelled booking only shows under All');
  assert.equal(billMatchesFilter(bill({ isCancelled: true }), 'All'), true);
  assert.equal(billMatchesFilter(bill({ isBackJob: true, due: { kind: 'down' } }), 'Due'), false, 'a free back job has nothing to bill');
});

test('Billing reads what is due from the server and has a Due now list; the old fixed "wait" for every installation is gone', () => {
  const billing = src('pages/customer/billings.jsx');
  assert.match(billing, /b\.paymentDue/);
  assert.match(billing, /Due now/);
  assert.match(billing, /We are confirming the unit\. You will be asked to pay your down payment once it is confirmed\./);
  assert.doesNotMatch(billing, /b\.service\?\.serviceType === SERVICE_TYPE\.INSTALLATION && b\.status === BOOKING_STATUS\.PENDING/);
  assert.doesNotMatch(billing, /'Partially Paid'/);
  const details = src('pages/customer/book_details.jsx');
  assert.match(details, /booking\.paymentDue/);
});

test('the booking form says why Next is off', () => {
  const form = src('pages/customer/book_service.jsx');
  assert.match(form, /const nextProblem = \(\) =>/);
  assert.match(form, /const canNext = \(\) => nextProblem\(\) === ''/);
  assert.match(form, /className="bs-next-reason"/);
  assert.match(form, /aria-describedby=\{nextProblem\(\) \? 'bs-next-reason'/);
  assert.doesNotMatch(form, /Wait for our confirmation before paying/);
});

test('an unknown address shows a friendly page with a button to the right home', async () => {
  const NotFound = (await vite.ssrLoadModule('/src/pages/not_found_page.jsx')).default;
  const { MemoryRouter } = require('react-router-dom');
  const render = () => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(NotFound)));
  global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const signedOut = render();
  assert.match(signedOut, /Page not found/);
  assert.match(signedOut, /href="\/"/);
  assert.match(signedOut, /Go to the home page/);
  for (const [role, home] of [['admin', '/admin/dashboard'], ['staff', '/staff/dashboard'], ['customer', '/customer/dashboard']]) {
    global.localStorage = { getItem: (k) => (k === 'token' ? 'x' : k === 'user' ? JSON.stringify({ role }) : null), setItem() {}, removeItem() {} };
    assert.match(render(), new RegExp(`href="${home}"`), role);
  }
  delete global.localStorage;
  assert.match(src('App.jsx'), /<Route path="\*" element=\{<NotFoundPage \/>\} \/>/);
});

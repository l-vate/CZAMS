'use strict';
// Run with: npm test (inside server/). The admin's Cancel Booking dialog: it asks why, each choice sends the right request, the owner choice says in
// plain words what the customer gets, and the customer reads who cancelled and why. Components are rendered to markup (no browser, no server).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { startSsrServer } = require('./helpers/viteSsr');

const root = path.join(__dirname, '..', '..');
const fromRoot = createRequire(path.join(root, 'package.json'));
const React = fromRoot('react');
const { renderToStaticMarkup } = fromRoot('react-dom/server');

let vite;
let close;
let util;
test.before(async () => {
  ({ vite, close } = await startSsrServer());
  util = await vite.ssrLoadModule('/src/utils/cancelBooking.js');
});
test.after(async () => { if (close) await close(); });

const src = (...f) => fs.readFileSync(path.join(root, ...f), 'utf8').replace(/\r\n/g, '\n');
const dialog = async (props) => {
  const { CancelBookingDialog } = await vite.ssrLoadModule('/src/components/cancel_booking_dialog.jsx');
  return renderToStaticMarkup(React.createElement(CancelBookingDialog, { bookingId: 'CZ-2026-1001', onConfirm() {}, onClose() {}, ...props }));
};
const confirmDisabled = (html) => /<button type="button" class="sdm-btn sdm-btn-danger cbd-btn" disabled="">/.test(html);

// ---- what each choice sends ----------------------------------------------------------------------------------------------------------

test('a reason has to be chosen first', () => {
  for (const choice of [null, undefined, '', 'nope']) assert.match(util.cancelRequest(choice, 'a reason').problem, /Choose a reason/);
});

test('Customer request sends the plain cancel with that reason and needs no text', () => {
  assert.deepEqual(util.cancelRequest('customer'), { body: { status: 'Cancelled', cancelReason: 'Customer request' } });
  assert.deepEqual(util.cancelRequest('customer', 'ignored'), { body: { status: 'Cancelled', cancelReason: 'Customer request' } });
});

test('We cannot supply or serve sends ownerInitiated with the details as the reason, and the details are required', () => {
  assert.deepEqual(util.cancelRequest('owner', '  We do not carry that brand  '), { body: { status: 'Cancelled', ownerInitiated: true, cancelReason: 'We do not carry that brand' } });
  for (const text of ['', '  ', 'no', undefined]) assert.match(util.cancelRequest('owner', text).problem, /at least 3 characters/, String(text));
  assert.match(util.cancelRequest('owner', 'x'.repeat(201)).problem, /200 characters or fewer/);
  assert.equal(util.cancelRequest('owner', 'x'.repeat(200)).body.cancelReason.length, 200);
});

test('Other sends the plain cancel with the text as the reason (not ownerInitiated), and the text is required', () => {
  const sent = util.cancelRequest('other', 'The customer moved away');
  assert.deepEqual(sent, { body: { status: 'Cancelled', cancelReason: 'The customer moved away' } });
  assert.equal('ownerInitiated' in sent.body, false);
  for (const text of ['', ' ab ', undefined]) assert.match(util.cancelRequest('other', text).problem, /at least 3 characters/, String(text));
  assert.match(util.cancelRequest('other', 'x'.repeat(201)).problem, /200 characters or fewer/);
});

// ---- the dialog ----------------------------------------------------------------------------------------------------------------------

test('the dialog is a modal dialog with a required Reason for cancelling and the three choices', async () => {
  const html = await dialog({});
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="cbd-title"/);
  assert.match(html, /<h3 id="cbd-title" class="cbd-title">Cancel booking CZ-2026-1001\?<\/h3>/);
  assert.match(html, /<legend class="cbd-legend">Reason for cancelling <span aria-hidden="true">\(required\)<\/span><\/legend>/);
  assert.deepEqual([...html.matchAll(/<span>([^<]+)<\/span><\/label>/g)].map((m) => m[1]), ['Customer request', 'We cannot supply or serve', 'Other']);
  assert.equal((html.match(/type="radio" required="" name="cancel-reason"/g) || []).length, 3);
  assert.equal((html.match(/ required=""/g) || []).length, 3, 'each reason is marked required');
  assert.match(html, />Back<\/button>/);
  assert.match(html, />Cancel Booking<\/button>/);
});

test('it cannot be confirmed without a reason', async () => {
  assert.equal(confirmDisabled(await dialog({})), true);
  assert.equal(confirmDisabled(await dialog({ initialChoice: 'owner' })), true, 'the details are missing');
  assert.equal(confirmDisabled(await dialog({ initialChoice: 'owner', initialText: 'ab' })), true, 'too short');
  assert.equal(confirmDisabled(await dialog({ initialChoice: 'other', initialText: '' })), true);
  assert.equal(confirmDisabled(await dialog({ initialChoice: 'other', initialText: 'ab' })), true);
});

test('it can be confirmed once the choice is complete', async () => {
  assert.equal(confirmDisabled(await dialog({ initialChoice: 'customer' })), false);
  assert.equal(confirmDisabled(await dialog({ initialChoice: 'owner', initialText: 'We do not carry that brand' })), false);
  assert.equal(confirmDisabled(await dialog({ initialChoice: 'other', initialText: 'The customer moved away' })), false);
});

test('only the choices that need words show a text box, and Customer request shows none', async () => {
  assert.doesNotMatch(await dialog({}), /cbd-input/);
  assert.doesNotMatch(await dialog({ initialChoice: 'customer' }), /cbd-input/);
  const owner = await dialog({ initialChoice: 'owner' });
  assert.match(owner, /Details \(the customer is told\)/);
  assert.match(owner, /<input[^>]*class="cbd-input"[^>]*maxLength="200"|<input[^>]*maxLength="200"[^>]*class="cbd-input"/);
  assert.match(await dialog({ initialChoice: 'other' }), /Reason \(required\)/);
});

test('We cannot supply or serve says in plain words that the customer gets the whole verified down payment back, no fee, on any date', async () => {
  const owner = await dialog({ initialChoice: 'owner' });
  assert.match(owner, /The customer receives a full refund of the verified down payment, with no transportation fee, on any date\./);
  for (const choice of ['customer', 'other', null]) assert.doesNotMatch(await dialog({ initialChoice: choice }), /full refund of the verified down payment/, String(choice));
});

test('a server error is shown inside the dialog, and while saving the buttons are off', async () => {
  const failed = await dialog({ initialChoice: 'customer', error: 'This booking can no longer be cancelled.' });
  assert.match(failed, /role="alert">This booking can no longer be cancelled\.<\/p>/);
  const saving = await dialog({ initialChoice: 'customer', saving: true });
  assert.match(saving, /Cancelling\.\.\.<\/button>/);
  assert.equal((saving.match(/ disabled=""/g) || []).length, 2, 'Back and Cancel are both off while it saves');
});

test('keyboard: Escape closes it, Tab stays inside it, focus goes to the first reason and back to the button', () => {
  const code = src('src', 'components', 'cancel_booking_dialog.jsx');
  assert.match(code, /event\.key === 'Escape' && !saving/);
  assert.match(code, /event\.key !== 'Tab'/);
  assert.match(code, /firstRef\.current\?\.focus\(\)/);
  assert.match(code, /before\.focus\(\)/);
  assert.match(code, /aria-invalid=\{touched && Boolean\(request\.problem\)\}/);
});

test('every control is at least 44 px tall, it fits a 390 px screen, and the buttons stack on a phone', () => {
  const css = src('src', 'css', 'components', 'cancel_booking_dialog.css');
  for (const rule of ['.cbd-choice', '.cbd-input', '.cbd-btn']) assert.match(css, new RegExp(`\\${rule} \\{[^}]*min-height: 44px`), rule);
  assert.match(css, /\.cbd-dialog \{[^}]*width: min\(480px, 100%\)[^}]*max-height: calc\(100vh - 32px\)[^}]*overflow-y: auto/);
  assert.match(css, /@media \(max-width: 480px\) \{[\s\S]*\.cbd-actions \{ flex-direction: column-reverse; \}[\s\S]*\.cbd-btn \{ width: 100%; \}/);
  assert.match(src('src', 'main.jsx'), /cancel_booking_dialog\.css/);
});

// ---- the booking details ---------------------------------------------------------------------------------------------------------------

test('Cancel Booking keeps its visibility rules and its confirmation, now the dialog; the separate button is gone', () => {
  const code = src('src', 'components', 'admin_service_details_modal.jsx');
  assert.match(code, /const canCancel = !\[BOOKING_STATUS\.COMPLETED, BOOKING_STATUS\.CANCELLED\]\.includes\(booking\.status\)/);
  assert.match(code, /\{canCancel && \(\s*<button className="sdm-btn sdm-btn-danger" onClick=\{handleCancel\} disabled=\{saving\}>\s*Cancel Booking/);
  assert.doesNotMatch(code, /window\.confirm\('Cancel this booking/);
  assert.match(code, /<CancelBookingDialog bookingId=\{booking\.bookingId\} saving=\{saving\} error=\{error\} onConfirm=\{confirmCancel\}/);
  assert.match(code, /if \(await patchBooking\(body\)\) setCancelOpen\(false\)/, 'it closes only when the cancel worked');
  assert.doesNotMatch(code, /Cancel: we cannot supply or serve/);
});

// ---- what the customer reads -------------------------------------------------------------------------------------------------------------

test('the customer reads who cancelled, for each case', async () => {
  const { cancelledByText } = await vite.ssrLoadModule('/src/utils/cancelledSummary.js');
  assert.equal(cancelledByText({ status: 'Cancelled', cancelledBy: 'admin', ownerCancelled: true, cancelReason: 'We do not carry that brand' }), 'The owner cancelled this booking because we could not supply or serve it.');
  assert.equal(cancelledByText({ status: 'Cancelled', cancelledBy: 'admin', cancelReason: 'Customer request' }), 'Cancelled by the owner.');
  assert.equal(cancelledByText({ status: 'Cancelled', cancelledBy: 'admin' }), 'Cancelled by the owner.');
  assert.equal(cancelledByText({ status: 'Cancelled', cancelledBy: 'customer' }), 'You cancelled this booking.', 'a customer cancelling is not changed');
});

test('the customer sees the reason for an owner cancellation and for an admin cancellation, and never for their own', () => {
  const page = src('src', 'pages', 'customer', 'book_details.jsx');
  assert.match(page, /\{booking\.cancelReason && \(booking\.ownerCancelled \|\| booking\.cancelledBy === 'admin' \|\| expired\) && <p className="cancelled-summary-line"><strong>Reason:<\/strong> \{booking\.cancelReason\}<\/p>\}/);
});

test('the refund text for each case is the one the server rule makes true', async () => {
  const { refundText } = await vite.ssrLoadModule('/src/utils/cancelledSummary.js');
  const owner = refundText({ status: 'Cancelled', refund: { status: 'Pending', ownerInitiated: true, downPaymentAmount: 1000, refundableAmount: 1000 } });
  assert.match(owner, /whole down payment of .*1,000.* will be refunded, with no transportation fee/);
  const before = refundText({ status: 'Cancelled', refund: { status: 'Pending', isSameDay: false, downPaymentAmount: 1000, refundableAmount: 1000 } });
  assert.match(before, /refunded in full/);
  const late = refundText({ status: 'Cancelled', refund: { status: 'Pending', isSameDay: true, downPaymentAmount: 1000 } });
  assert.match(late, /decide the fee/);
});

test('the space for the validation message is always there while a text box is, so it appearing on blur cannot move the choices', async () => {
  for (const choice of ['owner', 'other']) {
    assert.match(await dialog({ initialChoice: choice }), /<p id="cbd-problem" class="cbd-problem cbd-problem--slot" aria-live="polite"><\/p>/, choice);
  }
  assert.doesNotMatch(await dialog({ initialChoice: 'customer' }), /cbd-problem--slot/);
  assert.match(src('src', 'css', 'components', 'cancel_booking_dialog.css'), /\.cbd-problem--slot \{ min-height: 2\.6em;/);
  assert.match(src('src', 'css', 'components', 'cancel_booking_dialog.css'), /\.cbd-dialog \.cbd-choice \{[^}]*min-height: 44px/, 'in front of the global 40 px rule for radio labels on a phone');
});

// Run with: npm test (inside server/). Three fixes: a balance our team recorded in person (cheque, cash) shows on the customer's side; dates in a CSV never
// show as hashes in Excel; the audit log's "View details" reads as labelled rows. Read from the source and the pure helpers; no database.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startSsrServer } = require('./helpers/viteSsr');
const { toCustomerView } = require('../utils/customerView');

let vite;
let closeVite;
before(async () => { ({ vite, close: closeVite } = await startSsrServer()); });
after(async () => { await closeVite(); });

const src = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', ...parts), 'utf8');

test('the customer view carries how a balance was received in person, but not who recorded it or the log', () => {
  const booking = {
    bookingId: 'CZ-1', status: 'Completed', paymentStatus: 'fully_paid', balancePaymentStatus: 'paid', balancePaid: true, paymentMode2: 'Cheque',
    paymentEvents: [
      { track: 'down', status: 'verified', amount: 500, method: 'GCash', by: { id: 'ADM1', name: 'Admin One' }, at: '2026-10-01T02:00:00Z' },
      { track: 'balance', status: 'recorded', amount: 500, method: 'Cheque', reference: 'CHK-0042', inPerson: true, by: { id: 'ADM1', name: 'Admin One' }, at: '2026-10-20T02:00:00Z' },
    ],
  };
  const view = toCustomerView(booking);
  assert.deepEqual(view.balanceRecordedInPerson, { method: 'Cheque', reference: 'CHK-0042', at: '2026-10-20T02:00:00Z' });
  assert.equal(view.paymentEvents, undefined, 'the payment log stays hidden');
  assert.ok(!JSON.stringify(view).includes('Admin One'), 'no admin name');
  assert.equal(toCustomerView({ bookingId: 'CZ-2', status: 'Approved', paymentEvents: [{ track: 'down', status: 'verified' }] }).balanceRecordedInPerson, undefined);
});

test('the customer booking page shows the balance as paid with its method and cheque number, and the receipt carries the reference', () => {
  const page = src('pages', 'customer', 'book_details.jsx');
  assert.match(page, /const balanceSettled = isFullyPaid \|\| booking\.balancePaid \|\| booking\.balancePaymentStatus === BALANCE_PAYMENT_STATUS\.PAID;/);
  assert.match(page, /balanceSettled \? '₱0 \(paid\)'/);
  assert.match(page, /Balance Payment Mode/);
  assert.match(page, /\(received in person\)/);
  assert.match(page, /Balance Reference or Cheque No\./);
  assert.match(page, /inPerson \? 'Received in person' : 'None'/);
  assert.match(src('components', 'receipt_modal.jsx'), /balanceReferenceNumber = booking\?\.balanceReferenceNumber \|\| form\.balanceReferenceNumber \|\| recordedBalance\?\.reference/);
});

test('a date in a CSV is written as text so it never shows hashes, and nothing else changes', async () => {
  const { csvCell, buildCsv } = await vite.ssrLoadModule('/src/utils/csvExport.js');
  assert.equal(csvCell('2026-11-03'), '"=""2026-11-03"""');
  assert.equal(csvCell('Nov 3, 2026'), '"=""Nov 3, 2026"""');
  assert.equal(csvCell('November 3, 2026'), '"=""November 3, 2026"""');
  assert.equal(csvCell('N/A'), 'N/A');
  assert.equal(csvCell('2026-11-03 extra'), '2026-11-03 extra');
  assert.equal(csvCell(20261103), '20261103', 'a number is a number');
  assert.equal(csvCell('=1+1'), "'=1+1", 'a real formula is still defused');
  const csv = buildCsv({ columns: ['Booking ID', 'Service Date'], rows: [['CZ-1', '2026-11-03']] });
  assert.ok(csv.includes('CZ-1,"=""2026-11-03"""'));
});

test('View details lists what happened, who, when, the record and what changed in words, with the action code last', async () => {
  const { auditDetails } = await vite.ssrLoadModule('/src/utils/auditText.js');
  const line = {
    _id: 'A1', action: 'booking.charges', entityType: 'Booking', entityId: 'CZ-2026-1', createdAt: '2026-10-22T03:13:00.000Z',
    actor: { id: 'ADM1', name: 'Charlz Layug', role: 'admin' }, summary: 'Changed the distance or mobilization charge',
    meta: { distanceAdjustment: 350, mobilizationFee: null, confirmed: true, blocks: ['Morning', 'Afternoon'], track: { before: 'down', after: 'balance' } },
  };
  const d = auditDetails(line);
  assert.equal(d.what, 'Changed the distance or mobilization charge');
  assert.equal(d.who, 'Charlz Layug (admin)');
  assert.match(d.when, /October 22, 2026/);
  assert.match(d.when, /Manila time/);
  assert.equal(d.record, 'Booking CZ-2026-1');
  assert.deepEqual(d.values, [
    ['Distance adjustment', '₱350'], ['Mobilization fee', 'None'], ['Confirmed', 'Yes'], ['Blocks', 'Morning, Afternoon'], ['Track', 'down → balance'],
  ]);
  assert.equal(d.action, 'booking.charges');
  const entry = src('components', 'audit_entry.jsx');
  assert.ok(entry.indexOf('What happened') < entry.indexOf('What changed') && entry.indexOf('What changed') < entry.indexOf('Action code'));
  assert.doesNotMatch(entry, /<pre/, 'no raw JSON in the panel');
});

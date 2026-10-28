// Run with: npm test (inside server/). E17-4: the old "Distance Based Charge" row and its Edit control are gone from the admin payment panel. A
// distance charge is a "distance" line in the Scope of works, the one place for it. An older booking that holds a value in the old field shows it
// as a read-only row and its total does not change; a distance line adds to the total once. No database; the client files load through Vite.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { startSsrServer } = require('./helpers/viteSsr');
const server = require('../utils/pricing');

const root = path.join(__dirname, '..', '..');
const fromRoot = createRequire(path.join(root, 'package.json'));

let vite;
let closeVite;
before(async () => { ({ vite, close: closeVite } = await startSsrServer()); });
after(async () => { await closeVite(); });

const cleaning = { _id: 'S1', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, unitTypePricing: [] };
const install = { _id: 'S2', name: 'Installation', serviceType: 'Installation', price: 1000, unitTypePricing: [] };
const base = (over = {}) => ({
  _id: 'B1', bookingId: 'CZ-1', status: 'Pending', service: cleaning, units: [{ type: 'Split Type', quantity: 1 }], downPaymentPercent: 30, discount: { status: 'None' },
  scopeLines: [], customer: { _id: 'CUS1', name: 'Customer One' }, address: 'Cebu City, Cebu', date: '2026-11-10', time: 'Morning', paymentStatus: 'Unpaid', ...over,
});
const line = (kind, amount) => ({ kind, description: kind === 'distance' ? 'Distance based charge' : kind, quantity: 1, unitLabel: 'trip', unitRate: amount, amount });

async function renderPanel(booking) {
  const React = fromRoot('react');
  const { renderToStaticMarkup } = fromRoot('react-dom/server');
  const { MemoryRouter } = fromRoot('react-router-dom');
  const Modal = (await vite.ssrLoadModule('/src/components/admin_service_details_modal.jsx')).default;
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Modal, { booking, asPage: true, onClose() {}, onUpdated() {} })));
}

test('no old distance row and no Edit for it on a new booking, even outside Quezon City', async () => {
  const html = await renderPanel(base());
  assert.doesNotMatch(html, /Distance Based Charge/);
  assert.doesNotMatch(html, /Mobilization Fee<\/span>/, 'no charge row for something nobody entered');
  assert.doesNotMatch(html, /Admin Pricing Adjustments/);
  assert.match(html, /mobilization fee in the Scope of works/, 'the notice points to the one place for it');
});

test('an older booking with a value in the old field shows it read-only, with no Edit', async () => {
  const html = await renderPanel(base({ distanceAdjustment: 300 }));
  assert.match(html, /Mobilization Fee/);
  assert.match(html, /₱300/);
  const row = html.slice(html.indexOf('Mobilization Fee'), html.indexOf('Mobilization Fee') + 600);
  assert.doesNotMatch(row, /<button[^>]*>Edit<\/button>/);
});

test('a booking with a distance line shows the charge once, in the scope, and no separate old row', async () => {
  const html = await renderPanel(base({ distanceAdjustment: 600, scopeLines: [line('distance', 600)] }));
  assert.doesNotMatch(html, /Distance Based Charge<\/span>/, 'no second row for the same charge');
  assert.equal((html.match(/Distance based charge/gi) || []).length >= 1, true, 'the scope line is listed');
});

test('an Installation shows an older mobilization fee read-only (no Edit), and no row at all when there is none', async () => {
  const html = await renderPanel(base({ service: install, mobilizationFee: 2500 }));
  assert.match(html, /Mobilization Fee/);
  assert.match(html, /₱2,500/);
  assert.doesNotMatch(html, />Edit</, 'a distance charge is added as a line in the Scope of works, not edited here');
  const none = await renderPanel(base({ service: install, address: 'Somewhere far, Bulacan' }));
  assert.doesNotMatch(none, /Mobilization Fee/, 'nothing new is entered as a mobilization fee');
});

test('totals: an old value still counts once, and a distance line adds to the total once', async () => {
  const client = await vite.ssrLoadModule('/src/utils/bookingPricing.js');
  const before = base();
  const old = base({ distanceAdjustment: 300 });
  const withLine = base({ scopeLines: [line('distance', 600)], distanceAdjustment: 600 });
  const total = (b) => server.getPaymentBreakdown(b).total;
  assert.equal(total(before), 1000);
  assert.equal(total(old), 1300, 'the old value adds to the total as it always did');
  assert.equal(total(withLine), 1600, 'a distance line adds once, not twice');
  for (const b of [before, old, withLine]) assert.equal(client.getPaymentBreakdown(b).total, total(b), 'the page and the server agree');
  assert.equal(server.getPaymentBreakdown(withLine).downPayment, server.getPaymentBreakdown(before).downPayment, 'the down payment never moves');
  assert.equal(server.getPaymentBreakdown(old).downPayment, server.getPaymentBreakdown(before).downPayment);
});

test('the read-only rule on its own', async () => {
  const { legacyDistanceAmount } = await vite.ssrLoadModule('/src/utils/chargeRows.js');
  assert.equal(legacyDistanceAmount(base()), null);
  assert.equal(legacyDistanceAmount(base({ distanceAdjustment: 0 })), null);
  assert.equal(legacyDistanceAmount(base({ distanceAdjustment: 300 })), 300);
  assert.equal(legacyDistanceAmount(base({ distanceAdjustment: 600, scopeLines: [line('distance', 600)] })), null);
});

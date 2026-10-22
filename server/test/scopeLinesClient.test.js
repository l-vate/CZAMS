// Run with: npm test (inside server/). The page's pricing (src/utils/bookingPricing.js) gives the same total, down payment and balance as
// the server (utils/pricing.js) for bookings with scope of works lines, a supplied unit, a Senior/PWD discount and the old charge fields.
// No database; the client file is loaded through Vite.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const { startSsrServer } = require('./helpers/viteSsr');
const server = require('../utils/pricing');

let vite;
let closeVite;
before(async () => { ({ vite, close: closeVite } = await startSsrServer()); });
after(async () => { await closeVite(); });

const service = { name: 'Installation', serviceType: 'Installation', price: 1000, unitTypePricing: [] };
const base = { service, units: [{ type: 'Split Type', quantity: 2 }], downPaymentPercent: 50, discount: { status: 'None' }, scopeLines: [] };
const line = (kind, amount) => ({ kind, description: kind, quantity: 1, unitLabel: 'unit', unitRate: amount, amount });

const cases = {
  'no lines, no charges': base,
  'old charge fields only': { ...base, distanceAdjustment: 300, mobilizationFee: 2500 },
  'service and distance lines': { ...base, scopeLines: [line('installation', 3000), line('excessPipe', 450), line('distance', 600)], distanceAdjustment: 600 },
  'lines with a Senior discount': { ...base, discount: { status: 'Approved', type: 'Senior', percent: 20 }, scopeLines: [line('dismantling', 1000), line('distance', 500)], distanceAdjustment: 500 },
  'a supplied unit with a price': { ...base, units: [{ type: 'Split Type', quantity: 2, supplied: { brand: 'Test', model: 'X1', price: 25000, inverter: true } }] },
  'a supplied unit still waiting for a price': { ...base, units: [{ type: 'Split Type', quantity: 2, supplied: { source: 'requested' } }] },
  'everything together': {
    ...base,
    discount: { status: 'Approved', type: 'PWD', percent: 20, dpPaidBeforeApproval: 0 },
    units: [{ type: 'Split Type', quantity: 1, supplied: { brand: 'Test', model: 'X2', price: 18000 } }],
    scopeLines: [line('installation', 2000), line('other', 350), line('distance', 400)], distanceAdjustment: 400, mobilizationFee: 100,
  },
};

for (const [name, booking] of Object.entries(cases)) {
  test(`the page and the server agree: ${name}`, async () => {
    const client = await vite.ssrLoadModule('/src/utils/bookingPricing.js');
    const fromPage = client.getPaymentBreakdown(booking);
    const fromServer = server.getPaymentBreakdown(booking);
    assert.equal(fromPage.total, fromServer.total, 'total');
    assert.equal(fromPage.downPayment, fromServer.downPayment, 'down payment');
    assert.equal(fromPage.balance, fromServer.balance, 'balance');
  });
}

test('the page lists each scope line once and counts a distance line once', async () => {
  const client = await vite.ssrLoadModule('/src/utils/bookingPricing.js');
  const { lineItems, basePrice } = client.getBookingLineItems(cases['service and distance lines']);
  assert.equal(lineItems.filter((l) => l.isScope).length, 3);
  assert.equal(lineItems.filter((l) => l.type === 'Distance Based Charge').length, 0, 'the old charge line is not added on top of a distance line');
  assert.equal(basePrice, 2000 + 3000 + 450 + 600);
});

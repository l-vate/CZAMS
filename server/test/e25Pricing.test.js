// Run with: npm test (inside server/). E25: one set of amounts. VAT is collected in the balance, the down payment works off the service and
// follows the price until a proof is sent, a booking made before the fix keeps its numbers once it is done or paid, and the page's pricing
// (src/utils/bookingPricing.js) gives the same figures as the server for every case.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const { startSsrServer } = require('./helpers/viteSsr');
const server = require('../utils/pricing');

let vite;
let closeVite;
before(async () => { ({ vite, close: closeVite } = await startSsrServer()); });
after(async () => { await closeVite(); });

const service = { name: 'Cleaning', serviceType: 'Cleaning', price: 1000, unitTypePricing: [] };
const line = (kind, amount) => ({ kind, description: kind, quantity: 1, unitLabel: 'unit', unitRate: amount, amount });
const base = { service, units: [{ type: 'Split Type', quantity: 1 }], downPaymentPercent: 50, discount: { status: 'None' }, scopeLines: [], pricingVersion: 2, paymentStatus: 'Unpaid', status: 'Pending' };
const commercial = { ...base, isCommercial: true };

test('a residential booking has no VAT: total, down payment and balance as before', () => {
  const b = server.getPaymentBreakdown(base);
  assert.deepEqual([b.total, b.vat, b.grandTotal, b.downPayment, b.balance], [1000, 0, 1000, 500, 500]);
});

test('a commercial booking collects its VAT in the balance, and the down payment does not include VAT', () => {
  const b = server.getPaymentBreakdown(commercial);
  assert.equal(b.total, 1000);
  assert.equal(b.vat, 120);
  assert.equal(b.grandTotal, 1120);
  assert.equal(b.downPayment, 500, 'the percent of the service only');
  assert.equal(b.balance, 620, 'the rest of the total including VAT');
});

test('quoted prices that already include VAT add nothing on top', () => {
  const b = server.getPaymentBreakdown({ ...commercial, taxInclusive: true });
  assert.deepEqual([b.vat, b.grandTotal, b.balance], [0, 1000, 500]);
});

test('the supplied unit and a distance charge are in the total and the balance but not in the down payment; VAT covers them', () => {
  const b = server.getPaymentBreakdown({
    ...commercial,
    units: [{ type: 'Split Type', quantity: 1, supplied: { price: 25000 } }],
    scopeLines: [line('distance', 500)], distanceAdjustment: 500,
  });
  assert.equal(b.total, 26500);
  assert.equal(b.vat, 3180);
  assert.equal(b.downPayment, 500);
  assert.equal(b.balance, 26500 + 3180 - 500);
});

test('the down payment works off the base price only: scope lines follow in the balance, before and after a proof is sent', () => {
  const withLine = { ...base, scopeLines: [line('dismantling', 1000), line('installation', 2000), line('excessPipe', 300), line('other', 100)] };
  const b = server.getPaymentBreakdown(withLine);
  assert.equal(b.total, 4400);
  assert.equal(b.downPayment, 500, '50% of the base price 1000, not of the scope lines');
  assert.equal(b.balance, 3900);
  const sent = { ...withLine, paymentStatus: 'to_verify', downPaymentPaidAmount: 500 };
  assert.equal(server.getPaymentBreakdown(sent).downPayment, 500, 'what was asked when the proof was sent');
  assert.equal(server.getPaymentBreakdown(sent).balance, 3900);
  assert.equal(server.getPaymentBreakdown({ ...sent, paymentStatus: 'rejected', downPaymentPaidAmount: undefined }).downPayment, 500, 'a rejected proof follows the base price again');
});

test('while no proof is sent the down payment follows the base price when it changes', () => {
  const dearer = { ...base, service: { ...service, price: 1400 } };
  assert.equal(server.getPaymentBreakdown(dearer).downPayment, 700);
  assert.equal(server.getPaymentBreakdown({ ...dearer, paymentStatus: 'to_verify', downPaymentPaidAmount: 500 }).downPayment, 500, 'fixed once sent');
});

test('30, 50 and 100 percent, a zero down payment, and centavo rounding', () => {
  for (const [pct, dp] of [[30, 300], [50, 500], [100, 1000], [0, 0]]) {
    assert.equal(server.getPaymentBreakdown({ ...base, downPaymentPercent: pct }).downPayment, dp, `${pct}%`);
  }
  const odd = server.getPaymentBreakdown({ ...commercial, service: { ...service, price: 333 }, downPaymentPercent: 30 });
  assert.equal(odd.vat, 40);
  assert.equal(odd.downPayment, 100);
  assert.equal(odd.balance, 333 + 40 - 100);
});

test('a booking made before the fix keeps its numbers once it is Completed, fully paid or cancelled', () => {
  const old = { ...commercial, pricingVersion: undefined, scopeLines: [line('dismantling', 1000)] };
  // not done yet: the current rules
  assert.equal(server.getPaymentBreakdown(old).vat, 240);
  // done or paid: the old figures (no VAT in the balance)
  for (const over of [{ status: 'Completed' }, { paymentStatus: 'fully_paid' }, { balancePaid: true }, { status: 'Cancelled' }]) {
    const b = server.getPaymentBreakdown({ ...old, ...over });
    assert.equal(b.vat, 0, JSON.stringify(over));
    assert.equal(b.downPayment, 500, JSON.stringify(over));
    assert.equal(b.balance, 1500, JSON.stringify(over));
  }
  // a booking of the new version is never locked
  assert.equal(server.getPaymentBreakdown({ ...old, pricingVersion: 2, status: 'Completed' }).vat, 240);
});

test('a down payment verified before the fix (no amount stored) is the percent of the base price', () => {
  const old = { ...base, pricingVersion: undefined, paymentStatus: 'partially_paid', scopeLines: [line('dismantling', 1000)] };
  assert.equal(server.getPaymentBreakdown(old).downPayment, 500);
});

const cases = {
  residential: base,
  commercial,
  'commercial, tax inclusive': { ...commercial, taxInclusive: true },
  'lines, supplied unit and distance': { ...commercial, units: [{ type: 'Split Type', quantity: 2, supplied: { price: 25000 } }], scopeLines: [line('installation', 3000), line('excessPipe', 450), line('distance', 600)], distanceAdjustment: 600 },
  'with a Senior discount': { ...commercial, discount: { status: 'Approved', type: 'Senior', percent: 20 }, scopeLines: [line('dismantling', 1000)] },
  'proof sent': { ...commercial, paymentStatus: 'to_verify', downPaymentPaidAmount: 450, scopeLines: [line('dismantling', 1000)] },
  'verified before the fix': { ...commercial, pricingVersion: undefined, paymentStatus: 'partially_paid', status: 'Approved' },
  'completed before the fix': { ...commercial, pricingVersion: undefined, status: 'Completed', paymentStatus: 'partially_paid' },
  'no down payment': { ...commercial, downPaymentPercent: 0 },
};
for (const [name, booking] of Object.entries(cases)) {
  test(`the page and the server give the same figures: ${name}`, async () => {
    const client = await vite.ssrLoadModule('/src/utils/bookingPricing.js');
    const s = server.getPaymentBreakdown(booking);
    const c = client.getPaymentBreakdown(booking);
    for (const key of ['total', 'vat', 'grandTotal', 'downPayment', 'balance', 'overpaid']) assert.equal(c[key], s[key], key);
  });
}

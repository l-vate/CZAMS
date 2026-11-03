// Run with: npm test (inside server/). E30: a booking that owes a down payment must name how it will be paid. The server refuses one without a mode
// whatever the form sent, for an Installation and for every other service.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');

const { state, post, goodDate } = harness;
const users = [{ _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' }];
const services = [
  { _id: 'S-INST', name: 'Installation', serviceType: 'Installation', price: 5000, isActive: true },
  { _id: 'S-CLN', name: 'Regular Cleaning', serviceType: 'Cleaning', price: 800, isActive: true },
];

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({ users, services }));

const units = [{ type: 'Split Type', quantity: 1, hp: '1', brandModel: 'Carrier' }];

test('no mode of payment is refused with a clear message, for an Installation and a cleaning', async () => {
  const cases = [
    ['S-INST', { clientSuppliedUnit: true, unitWaiverAcknowledged: true, unitWaiverName: 'Customer One' }],
    ['S-CLN', {}],
  ];
  for (const [service, extra] of cases) {
    for (const paymentMode of ['', '   ', undefined]) {
      const res = await post({ service, date: goodDate(9), units, paymentMode, ...extra }, 'CUS1');
      assert.equal(res.status, 400, `${service} with mode ${JSON.stringify(paymentMode)}`);
      assert.match(res.body.message, /Choose a mode of payment for the down payment/);
    }
  }
  assert.equal(state.bookings.length, 0, 'nothing was saved');
});

test('a mode that is not on offer is refused, and a named mode books', async () => {
  const bad = await post({ service: 'S-CLN', date: goodDate(9), units, paymentMode: 'Bitcoin' }, 'CUS1');
  assert.equal(bad.status, 400);
  const ok = await post({ service: 'S-CLN', date: goodDate(9), units, paymentMode: 'GCash' }, 'CUS1');
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
});

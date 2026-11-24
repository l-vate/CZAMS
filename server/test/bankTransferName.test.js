// Run with: npm test (inside server/). The admin names the payment methods, so a bank account may be "Bank Transfer (BDO)". Any method named "Bank Transfer ..."
// is a bank transfer: a customer may pay with it online and it needs a proof and a reference number, exactly like plain "Bank Transfer". Cash and cheque still
// are not offered online. The screens and the server use the same rule.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startSsrServer } = require('./helpers/viteSsr');
const server = require('../constants/paymentModes');
const { onlinePaymentModeProblem } = require('../utils/paymentGuards');
const { modeNeedsReference } = require('../utils/paymentReference');

const ONLINE = ['GCash', 'gcash ', 'Bank Transfer', 'bank transfer', 'Bank Transfer (BDO)', 'Bank Transfer - BPI', 'Bank Transfer BDO', ' Bank Transfer: Metrobank'];
const NOT_ONLINE = ['Cash', 'Cheque', 'Bank', 'Bank Transfers', 'Banker Transfer', 'My Bank Transfer', 'GCash Cash', ''];

test('GCash and every method named "Bank Transfer ..." can be paid online and need a reference; nothing else can', () => {
  ONLINE.forEach((m) => { assert.equal(onlinePaymentModeProblem(m), null, m); assert.equal(modeNeedsReference(m), true, m); });
  NOT_ONLINE.filter((m) => m !== '').forEach((m) => { assert.ok(onlinePaymentModeProblem(m), m); assert.equal(modeNeedsReference(m), false, m); });
  assert.equal(onlinePaymentModeProblem(''), null, 'a blank mode is not a problem (a booking with no down payment has none)');
});

test('the screens use the same rule as the server', async () => {
  const { vite, close } = await startSsrServer();
  const client = await vite.ssrLoadModule('/src/constants/paymentModes.js');
  const reference = await vite.ssrLoadModule('/src/utils/paymentReference.js').finally(close);
  [...ONLINE, ...NOT_ONLINE].forEach((m) => {
    assert.equal(client.isOnlinePaymentMode(m), server.isOnlinePaymentMode(m), JSON.stringify(m));
    assert.equal(reference.needsReference(m), modeNeedsReference(m), JSON.stringify(m));
  });
});

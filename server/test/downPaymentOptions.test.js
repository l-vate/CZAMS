// Run with: npm test (inside server/). The booking form offers "No down payment (agreed terms)" only to a Commercial client whose account has
// agreed payment terms (7 to 10 days), and the extra Return customer option only to a Return customer. Loads the client's plain options file.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'downPaymentOptions.js')).href);
const PERCENTS = [30, 50, 100];
const labels = (options) => options.map((o) => `${o.value}:${o.label}`);

test('a regular customer sees only the configured percentages', async () => {
  const { getDownPaymentOptions } = await load();
  assert.deepEqual(labels(getDownPaymentOptions(false, PERCENTS)), ['30:30% Down Payment', '50:50% Down Payment', '100:Full Payment (100%)']);
  assert.deepEqual(labels(getDownPaymentOptions(false, PERCENTS, { onAgreedTerms: false })), labels(getDownPaymentOptions(false, PERCENTS)));
});

test('a Commercial client on agreed terms also sees "No down payment (agreed terms)", first', async () => {
  const { getDownPaymentOptions } = await load();
  const options = getDownPaymentOptions(false, PERCENTS, { onAgreedTerms: true });
  assert.equal(options[0].value, 0);
  assert.equal(options[0].label, 'No down payment (agreed terms)');
  assert.equal(options.filter((o) => o.value === 0).length, 1);
  assert.equal(options.length, 4);
});

test('a Return customer keeps the return wording, and never gets two zero options', async () => {
  const { getDownPaymentOptions } = await load();
  assert.equal(getDownPaymentOptions(true, PERCENTS)[0].label, 'No Down Payment (Return Customer)');
  assert.equal(getDownPaymentOptions(true, PERCENTS, { onAgreedTerms: true }).filter((o) => o.value === 0).length, 1);
});

test('only a Commercial account with terms of 7 to 10 days counts as being on agreed terms', async () => {
  const { hasAgreedTerms } = await load();
  assert.equal(hasAgreedTerms({ clientType: 'Commercial', agreedPaymentTermsDays: 7 }), true);
  assert.equal(hasAgreedTerms({ clientType: 'Commercial', agreedPaymentTermsDays: 10 }), true);
  [
    { clientType: 'Residential', agreedPaymentTermsDays: 7 },
    { clientType: 'Commercial', agreedPaymentTermsDays: null },
    { clientType: 'Commercial' },
    { clientType: 'Commercial', agreedPaymentTermsDays: 6 },
    { clientType: 'Commercial', agreedPaymentTermsDays: 11 },
    { clientType: 'Commercial', agreedPaymentTermsDays: '7' },
    { clientType: 'Commercial', agreedPaymentTermsDays: 7.5 },
    null, undefined, {},
  ].forEach((account) => assert.equal(hasAgreedTerms(account), false, JSON.stringify(account)));
});

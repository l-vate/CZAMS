// Run with: npm test (inside server/).
const test = require('node:test');
const assert = require('node:assert/strict');
const { readProfileFields } = require('../utils/profileFields');

const staff = (body) => readProfileFields({ role: 'staff', body });
const commercial = (body) => readProfileFields({ role: 'customer', clientType: 'Commercial', body });

test('a staff position is trimmed and kept', () => {
  assert.deepEqual(staff({ position: '  Cashier ' }), { problem: null, values: { position: 'Cashier' } });
});

test('a position of 40 characters is fine and 41 is a 400', () => {
  assert.equal(staff({ position: 'x'.repeat(40) }).problem, null);
  assert.equal(staff({ position: 'x'.repeat(41) }).problem.status, 400);
});

test('an empty position clears it', () => {
  assert.deepEqual(staff({ position: '   ' }).values, { position: '' });
});

test('position is ignored for customers and admins', () => {
  assert.deepEqual(readProfileFields({ role: 'customer', clientType: 'Residential', body: { position: 'Cashier' } }).values, {});
  assert.deepEqual(readProfileFields({ role: 'admin', body: { position: 'Cashier' } }).values, {});
});

test('company details are trimmed and kept for a Commercial customer', () => {
  const r = commercial({ companyName: ' Acme Corp ', representativeName: ' Juan Cruz ' });
  assert.deepEqual(r.values, { companyName: 'Acme Corp', representativeName: 'Juan Cruz' });
});

test('company details of 80 characters pass and 81 is a 400', () => {
  assert.equal(commercial({ companyName: 'x'.repeat(80), representativeName: 'y'.repeat(80) }).problem, null);
  assert.equal(commercial({ companyName: 'x'.repeat(81) }).problem.status, 400);
  assert.equal(commercial({ representativeName: 'y'.repeat(81) }).problem.status, 400);
});

test('company details are ignored for Residential customers, staff and admins', () => {
  const body = { companyName: 'Acme', representativeName: 'Juan' };
  assert.deepEqual(readProfileFields({ role: 'customer', clientType: 'Residential', body }).values, {});
  assert.deepEqual(readProfileFields({ role: 'customer', body }).values, {});
  assert.deepEqual(staff(body).values, {});
  assert.deepEqual(readProfileFields({ role: 'admin', body }).values, {});
});

test('non-text values are ignored rather than stored', () => {
  assert.deepEqual(staff({ position: 42 }).values, {});
  assert.deepEqual(commercial({ companyName: { $gt: '' } }).values, {});
});

// Run with: npm test (inside server/). Pure logic only, no database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateTemporaryPassword, isBcryptHash } = require('../utils/password');

test('generated passwords are 10 letters and digits, no look-alikes, with at least one of each', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const p = generateTemporaryPassword();
    seen.add(p);
    assert.match(p, /^[A-Za-z0-9]{10}$/);
    assert.doesNotMatch(p, /[0O1lI5S2Z8B]/);
    assert.match(p, /[A-Za-z]/);
    assert.match(p, /[0-9]/);
    assert.equal(isBcryptHash(p), false);
  }
  assert.ok(seen.size > 1990, 'passwords are random');
});

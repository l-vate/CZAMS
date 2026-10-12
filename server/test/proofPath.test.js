// Run with: npm test (inside server/). Tests the helper that maps a stored proof path to the new route's file name.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'proofPath.js')).href);

test('a stored proof path maps to its file name; stored data is not rewritten', async () => {
  const { proofNameOf } = await load();
  assert.equal(proofNameOf('/uploads/proofs/0123456789abcdef0123456789abcdef.png'), '0123456789abcdef0123456789abcdef.png');
  assert.equal(proofNameOf('/uploads/proofs/old-name_1.JPG'), 'old-name_1.JPG');
});

test('anything that is not a stored proof path maps to nothing', async () => {
  const { proofNameOf } = await load();
  [
    null, undefined, '', 'photo.jpg', 'https://example.com/a.png', '/uploads/profile-images/a.png',
    '/uploads/proofs/', '/uploads/proofs/../secret', '/uploads/proofs/a/b.png', '/uploads/proofs/%2e%2e/x', '/uploads/proofs/.env',
  ].forEach((v) => assert.equal(proofNameOf(v), null, String(v)));
});

test('a pdf path is recognised', async () => {
  const { isPdfPath } = await load();
  assert.equal(isPdfPath('/uploads/proofs/a.PDF'), true);
  assert.equal(isPdfPath('/uploads/proofs/a.png'), false);
  assert.equal(isPdfPath(null), false);
});

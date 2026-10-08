// Run with: npm test (inside server/).
const test = require('node:test');
const assert = require('node:assert/strict');
const { consentProblem, readFlag, PHOTO_MIME_TYPES, PHOTO_MAX_BYTES } = require('../utils/reportEvidence');

test('no signature and no photo is a 400', () => {
  assert.equal(consentProblem({ hasPhoto: false }).status, 400);
  assert.equal(consentProblem({ signedName: 'Ana', hasPhoto: false }).status, 400);
  assert.equal(consentProblem({ signatureDataUrl: 'data:image/png;base64,xx', hasPhoto: false }).status, 400);
  assert.equal(consentProblem({ signedName: '   ', signatureDataUrl: 'data:x', hasPhoto: false }).status, 400);
});

test('a drawn signature with a name still passes without a photo', () => {
  assert.equal(consentProblem({ signedName: 'Ana', signatureDataUrl: 'data:image/png;base64,xx', hasPhoto: false }), null);
});

test('a photo alone passes', () => {
  assert.equal(consentProblem({ hasPhoto: true }), null);
});

test('only JPG and PNG up to 5 MB are accepted', () => {
  assert.deepEqual([...PHOTO_MIME_TYPES], ['image/jpeg', 'image/png']);
  assert.equal(PHOTO_MAX_BYTES, 5 * 1024 * 1024);
});

test('multipart flags read as booleans', () => {
  assert.equal(readFlag('true'), true);
  assert.equal(readFlag(true), true);
  assert.equal(readFlag('false'), false);
  assert.equal(readFlag(undefined), false);
});

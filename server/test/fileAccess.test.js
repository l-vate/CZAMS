// Run with: npm test (inside server/). The pure rules for opening proof files: file names, who may open
// what, and the signed links. No database.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FILE_KIND, safeProofName, servingRulesFor, decideAccess, createLinkParts, verifyLinkParts, LINK_TTL_SECONDS,
} = require('../utils/fileAccess');

const SECRET = 'a-test-secret-not-a-real-one';

// ---- file names
test('a plain file name is accepted', () => {
  assert.equal(safeProofName('0123456789abcdef0123456789abcdef.png'), '0123456789abcdef0123456789abcdef.png');
  assert.equal(safeProofName('old-name_1.JPG'), 'old-name_1.JPG');
});

test('path traversal, absolute paths and odd names are all refused', () => {
  const attacks = [
    '../server.js', '..', '../../.env', '....//x', 'a/../b', 'a/b.png', 'a\\b.png', '..\\..\\win.ini',
    '/etc/passwd', 'C:\\Windows\\win.ini', 'C:win.ini', '%2e%2e%2fsecret', '%252e%252e%252f', 'x%00.png',
    '.hidden', '.env', 'a..b.png', '', ' ', 'a b.png', 'a;b', 'a:b', 'x'.repeat(200), 'name.png/', null, undefined, 42, {},
  ];
  attacks.forEach((a) => assert.equal(safeProofName(a), null, `should refuse ${JSON.stringify(a)}`));
});

// ---- how a file is served
test('jpg, jpeg, png, webp and pdf are shown inline with their own type', () => {
  assert.deepEqual(servingRulesFor('a.jpg'), { contentType: 'image/jpeg', disposition: 'inline' });
  assert.deepEqual(servingRulesFor('a.JPEG'), { contentType: 'image/jpeg', disposition: 'inline' });
  assert.deepEqual(servingRulesFor('a.png'), { contentType: 'image/png', disposition: 'inline' });
  assert.deepEqual(servingRulesFor('a.webp'), { contentType: 'image/webp', disposition: 'inline' });
  assert.deepEqual(servingRulesFor('a.pdf'), { contentType: 'application/pdf', disposition: 'inline' });
});

test('anything else (an old upload) is a download of opaque bytes, never rendered', () => {
  ['a.html', 'a.svg', 'a.js', 'a.exe', 'noextension', 'a.png.html'].forEach((n) => {
    assert.deepEqual(servingRulesFor(n), { contentType: 'application/octet-stream', disposition: 'attachment' }, n);
  });
});

// ---- who may open what: every role against every kind of file
const owner = 'CUS1';
const refFor = (kind) => [{ kind, customer: owner, memberIds: ['T1', 'T2'] }];
const KINDS = Object.values(FILE_KIND);

test('an admin may open any file, even one nothing references', () => {
  KINDS.forEach((k) => assert.equal(decideAccess({ role: 'admin', userId: 'ADM1', references: refFor(k) }), true, k));
  assert.equal(decideAccess({ role: 'admin', userId: 'ADM1', references: [] }), true);
});

test('the customer who owns the booking may open every kind of their own file except the Senior/PWD ID photo', () => {
  KINDS.forEach((k) => assert.equal(decideAccess({ role: 'customer', userId: owner, references: refFor(k) }), k !== FILE_KIND.ID_PHOTO, k));
});

test('another customer may open none of them', () => {
  KINDS.forEach((k) => assert.equal(decideAccess({ role: 'customer', userId: 'CUS2', references: refFor(k) }), false, k));
  assert.equal(decideAccess({ role: 'customer', userId: 'CUS2', references: [] }), false);
});

test('a technician on the job (lead or helper) may open only the signed form photo', () => {
  ['T1', 'T2'].forEach((tech) => {
    KINDS.forEach((k) => {
      const want = k === FILE_KIND.SIGNED_FORM;
      assert.equal(decideAccess({ role: 'staff', userId: tech, references: refFor(k) }), want, `${tech} ${k}`);
    });
  });
});

test('a technician who is not on the job may open none of them', () => {
  KINDS.forEach((k) => assert.equal(decideAccess({ role: 'staff', userId: 'T9', references: refFor(k) }), false, k));
});

test('a file referenced twice is allowed if any one reference allows it', () => {
  const refs = [
    { kind: FILE_KIND.DOWN_PAYMENT, customer: 'CUS5', memberIds: [] },
    { kind: FILE_KIND.SIGNED_FORM, customer: 'CUS6', memberIds: ['T1'] },
  ];
  assert.equal(decideAccess({ role: 'staff', userId: 'T1', references: refs }), true);
  assert.equal(decideAccess({ role: 'customer', userId: 'CUS5', references: refs }), true);
  assert.equal(decideAccess({ role: 'customer', userId: 'CUS7', references: refs }), false);
});

test('an unknown role and a missing reference list are refused', () => {
  assert.equal(decideAccess({ role: 'guest', userId: 'X', references: refFor(FILE_KIND.SIGNED_FORM) }), false);
  assert.equal(decideAccess({ role: 'staff', userId: 'T1' }), false);
  assert.equal(decideAccess({ role: undefined, userId: 'T1', references: refFor(FILE_KIND.SIGNED_FORM) }), false);
});

// ---- signed links
const NOW = 1_800_000_000_000;
const link = (over = {}) => ({ name: 'a.png', userId: 'CUS1', now: NOW, secret: SECRET, ...over });

test('a fresh link verifies for the same file and user', () => {
  const parts = createLinkParts(link());
  assert.ok(parts.sig && parts.exp && parts.u === 'CUS1');
  assert.equal(verifyLinkParts({ name: 'a.png', ...parts, now: NOW + 1000, secret: SECRET }), true);
});

test('a link is valid for 5 minutes, then expired', () => {
  assert.equal(LINK_TTL_SECONDS, 300);
  const parts = createLinkParts(link());
  assert.equal(verifyLinkParts({ name: 'a.png', ...parts, now: NOW + 299_000, secret: SECRET }), true);
  assert.equal(verifyLinkParts({ name: 'a.png', ...parts, now: NOW + 301_000, secret: SECRET }), false);
  assert.equal(verifyLinkParts({ name: 'a.png', ...parts, now: NOW + 3_600_000, secret: SECRET }), false);
});

test('a link for a different file does not work', () => {
  const parts = createLinkParts(link());
  assert.equal(verifyLinkParts({ name: 'b.png', ...parts, now: NOW, secret: SECRET }), false);
});

test('a link made for one user does not work as another user', () => {
  const parts = createLinkParts(link());
  assert.equal(verifyLinkParts({ name: 'a.png', ...parts, u: 'CUS2', now: NOW, secret: SECRET }), false);
});

test('a tampered expiry or signature does not work', () => {
  const parts = createLinkParts(link());
  assert.equal(verifyLinkParts({ name: 'a.png', ...parts, exp: parts.exp + 9999, now: NOW, secret: SECRET }), false);
  assert.equal(verifyLinkParts({ name: 'a.png', ...parts, sig: parts.sig.replace(/.$/, parts.sig.endsWith('0') ? '1' : '0'), now: NOW, secret: SECRET }), false);
  assert.equal(verifyLinkParts({ name: 'a.png', ...parts, sig: 'short', now: NOW, secret: SECRET }), false);
  assert.equal(verifyLinkParts({ name: 'a.png', ...parts, sig: undefined, now: NOW, secret: SECRET }), false);
  assert.equal(verifyLinkParts({ name: 'a.png', ...parts, exp: 'abc', now: NOW, secret: SECRET }), false);
});

test('a link signed with another secret does not work (so rotating the secret ends every link)', () => {
  const parts = createLinkParts(link({ secret: 'old-secret' }));
  assert.equal(verifyLinkParts({ name: 'a.png', ...parts, now: NOW, secret: SECRET }), false);
});

test('with no secret configured no link can be made or verified', () => {
  assert.equal(createLinkParts(link({ secret: '' })), null);
  assert.equal(verifyLinkParts({ name: 'a.png', u: 'CUS1', exp: String(NOW / 1000 + 100), sig: 'ab', now: NOW, secret: '' }), false);
});

test('the signature is not the JWT secret and does not contain it', () => {
  const parts = createLinkParts(link());
  assert.equal(JSON.stringify(parts).includes(SECRET), false);
});

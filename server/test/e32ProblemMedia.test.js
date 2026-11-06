// Run with: npm test (inside server/). The optional photo or video a customer sends with a booking or a back job: allowed types and sizes,
// who may open it (admin, the customer who sent it, the technicians on the job, nobody else), and a booking without one. No database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { bytesMatch, VIDEO_MAX_BYTES, MAX_UPLOAD_BYTES, MEDIA_TYPES } = require('../utils/uploadSafety');
const { mediaFieldRules, MEDIA_FIELD } = require('../utils/mediaUpload');
const { decideAccess, findReferences, servingRulesFor, FILE_KIND } = require('../utils/fileAccess');
const { toTechnicianView } = require('../utils/technicianView');
const { toCustomerView, toCustomerBackJob } = require('../utils/customerView');
const Booking = require('../models/Booking');

const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(8)]);
const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(12)]);

test('the picture types are the same as every other image upload; a clip may be MP4, MOV or WEBM', () => {
  assert.deepEqual([...MEDIA_TYPES].sort(), ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'].sort());
  assert.equal(MAX_UPLOAD_BYTES, 8 * 1024 * 1024);
  assert.equal(VIDEO_MAX_BYTES, 15 * 1024 * 1024);
});

test('a clip is checked by its first bytes, not by what it claims to be', () => {
  assert.equal(bytesMatch('video/mp4', mp4), true);
  assert.equal(bytesMatch('video/quicktime', mp4), true);
  assert.equal(bytesMatch('video/webm', webm), true);
  assert.equal(bytesMatch('video/mp4', Buffer.from('<html>not a video</html>')), false);
  assert.equal(bytesMatch('video/webm', mp4), false);
});

function run(files) {
  let status = 0;
  let body = null;
  let nexted = false;
  const req = { files: files.reduce((all, f) => ({ ...all, [f.fieldname]: [...(all[f.fieldname] || []), f] }), {}) };
  const res = { status(code) { status = code; return this; }, json(b) { body = b; return this; } };
  mediaFieldRules(req, res, () => { nexted = true; });
  return { status, body, nexted };
}
const file = (fieldname, mimetype, size) => ({ fieldname, mimetype, size, filename: 'x' });
const MB = 1024 * 1024;

test('size and type limits for the photo or video', () => {
  assert.equal(run([file(MEDIA_FIELD, 'image/jpeg', 7 * MB)]).nexted, true);
  assert.equal(run([file(MEDIA_FIELD, 'image/webp', 3 * MB)]).nexted, true);
  assert.equal(run([file(MEDIA_FIELD, 'video/mp4', 14 * MB)]).nexted, true);
  const bigPhoto = run([file(MEDIA_FIELD, 'image/png', 9 * MB)]);
  assert.equal(bigPhoto.status, 400);
  assert.match(bigPhoto.body.message, /8 MB or smaller/);
  assert.equal(run([file(MEDIA_FIELD, 'application/pdf', 1 * MB)]).status, 400); // a PDF is not a photo or a video
});

test('a clip is refused in every other field, which keep the proof types and the 8 MB size', () => {
  assert.equal(run([file('proof', 'video/mp4', 1 * MB)]).status, 400);
  assert.equal(run([file('discountId', 'video/webm', 1 * MB)]).status, 400);
  assert.equal(run([file('proof', 'application/pdf', 1 * MB), file(MEDIA_FIELD, 'video/mp4', 2 * MB)]).nexted, true);
  assert.equal(run([file('proof', 'image/png', 9 * MB)]).status, 400);
  assert.equal(run([]).nexted, true); // a booking without a photo
});

test('a clip is served inline with its own type', () => {
  assert.deepEqual(servingRulesFor('abc.mp4'), { contentType: 'video/mp4', disposition: 'inline' });
  assert.deepEqual(servingRulesFor('abc.webm'), { contentType: 'video/webm', disposition: 'inline' });
  assert.deepEqual(servingRulesFor('abc.mov'), { contentType: 'video/quicktime', disposition: 'inline' });
  assert.equal(servingRulesFor('abc.exe').disposition, 'attachment');
});

test('who may open the photo or video: admin, its customer, the technicians on the job; no one else', () => {
  const refs = [{ kind: FILE_KIND.PROBLEM_MEDIA, customer: 'cust-1', memberIds: ['tech-1', 'tech-2'] }];
  assert.equal(decideAccess({ role: 'admin', userId: 'a', references: refs }), true);
  assert.equal(decideAccess({ role: 'customer', userId: 'cust-1', references: refs }), true);
  assert.equal(decideAccess({ role: 'customer', userId: 'cust-2', references: refs }), false); // another customer
  assert.equal(decideAccess({ role: 'staff', userId: 'tech-2', references: refs }), true);
  assert.equal(decideAccess({ role: 'staff', userId: 'tech-9', references: refs }), false); // a technician not on the job
  assert.equal(decideAccess({ role: 'customer', userId: 'cust-1', references: [] }), false);
});

test('a path is found on a booking and on a back job claim', async () => {
  const path = '/uploads/proofs/abc.mp4';
  const Booking = { find: () => ({ select: async () => [{ bookingId: 'CZ-1', customer: 'c1', problemMedia: path }] }) };
  const BackJob = { find: () => ({ select: async () => [{ customer: 'c2' }] }) };
  const Report = { find: () => ({ select: async () => [] }) };
  const refs = await findReferences(path, { Booking, Report, BackJob, getMemberIds: () => ['t1'] });
  assert.deepEqual(refs.map((r) => [r.kind, r.customer]), [[FILE_KIND.PROBLEM_MEDIA, 'c1'], [FILE_KIND.PROBLEM_MEDIA, 'c2']]);
});

test('a booking without a photo is unchanged, and the views carry the photo when there is one', () => {
  assert.equal(new Booking({}).problemMedia, undefined);
  const base = { _id: 'a', bookingId: 'CZ-1', units: [], customer: { _id: 'c' } };
  assert.equal(toCustomerView(base).problemMedia, undefined);
  assert.equal(toTechnicianView(base).problemMedia, undefined);
  assert.equal(toCustomerView({ ...base, problemMedia: '/uploads/proofs/a.png' }).problemMedia, '/uploads/proofs/a.png');
  assert.equal(toTechnicianView({ ...base, problemMedia: '/uploads/proofs/a.png' }).problemMedia, '/uploads/proofs/a.png');
  assert.equal(toCustomerBackJob({ backJobId: 'BJ-1', proofMedia: '/uploads/proofs/a.mp4' }).proofMedia, '/uploads/proofs/a.mp4');
});

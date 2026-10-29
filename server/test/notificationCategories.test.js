'use strict';
// Run with: npm test (inside server/). E20 follow-up: every notification kind the server can send belongs to exactly one category on the
// notifications page. Adding a kind to server/constants/notificationTypes.js without listing it in src/constants/notificationCategories.js fails here.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startSsrServer } = require('./helpers/viteSsr');
const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');

let vite;
let close;
let cats;
test.before(async () => {
  ({ vite, close } = await startSsrServer());
  cats = await vite.ssrLoadModule('/src/constants/notificationCategories.js');
});
test.after(async () => { if (close) await close(); });

const KINDS = Object.values(NOTIFICATION_TYPE);

test('every kind the server sends has a category (add new kinds to src/constants/notificationCategories.js)', () => {
  const missing = KINDS.filter((kind) => !(kind in cats.NOTIFICATION_CATEGORY));
  assert.deepEqual(missing, [], `kinds with no category: ${missing.join(', ')}`);
});

test('no category is listed for a kind the server does not send (a stale or misspelled entry)', () => {
  const stale = Object.keys(cats.NOTIFICATION_CATEGORY).filter((kind) => !KINDS.includes(kind));
  assert.deepEqual(stale, []);
});

test('each kind is in exactly one category, and every category used is a real, labelled one', () => {
  assert.equal(KINDS.length, 46);
  for (const kind of KINDS) {
    const owners = cats.CATEGORY_ORDER.filter((c) => cats.typesInCategory(c).includes(kind));
    assert.equal(owners.length, 1, kind);
    assert.equal(cats.categoryOf(kind), owners[0]);
    assert.ok(cats.CATEGORY_LABEL[owners[0]], kind);
  }
  assert.deepEqual(cats.CATEGORY_ORDER.map((c) => cats.CATEGORY_LABEL[c]), ['Bookings', 'Payments', 'Refunds', 'Units', 'Jobs and reports', 'Chat', 'Account', 'Other']);
});

test('a kind nobody listed falls under Other, and the read filter for Other is every listed kind to leave out', () => {
  assert.equal(cats.categoryOf('some_new_kind'), 'other');
  assert.equal(cats.categoryOf(undefined), 'other');
  assert.deepEqual(cats.readFilterFor(null), undefined);
  assert.deepEqual(cats.readFilterFor('chat'), { types: ['chat_message'] });
  assert.deepEqual(cats.readFilterFor('other'), { exceptTypes: Object.keys(cats.NOTIFICATION_CATEGORY) });
});

test('the mapping, as agreed', () => {
  const by = (c) => cats.typesInCategory(c).sort();
  assert.deepEqual(by('refunds'), ['refund_confirmed', 'refund_flagged', 'refund_processed', 'refund_rejected', 'refund_requested']);
  assert.deepEqual(by('units'), ['unit_request_declined', 'unit_request_resolved']);
  assert.deepEqual(by('chat'), ['chat_message']);
  assert.deepEqual(by('account'), ['technician_deactivated']);
  assert.ok(by('payments').includes('payment_submitted') && by('payments').includes('discount_approved'));
  assert.ok(by('jobs').includes('job_assigned') && by('jobs').includes('backjob_decided') && by('jobs').includes('report_removed'));
  assert.ok(by('bookings').includes('booking_cancelled') && by('bookings').includes('reschedule_denied'));
});

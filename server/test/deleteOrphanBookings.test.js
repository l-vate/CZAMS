// Run with: npm test (inside server/). The script that deletes bookings of deleted customers refuses to run unless it is clear which database it
// will touch, and never deletes on the live database without a backup. Only the rule is tested here: nothing connects.
const test = require('node:test');
const assert = require('node:assert/strict');
const { refusal } = require('../scripts/deleteOrphanBookings');

const ok = (over) => refusal({ audit: false, live: false, apply: false, backupDone: false, connectedName: 'CZAMS', liveName: undefined, ...over });

test('with no flag it refuses, so a plain run can never reach a database', () => {
  assert.match(ok({}), /--audit/);
});

test('--audit works only on CZAMS_audit_test', () => {
  assert.equal(ok({ audit: true, connectedName: 'CZAMS_audit_test' }), null);
  assert.match(ok({ audit: true, connectedName: 'CZAMS' }), /CZAMS_audit_test/);
  assert.match(ok({ audit: true, live: true, connectedName: 'CZAMS_audit_test' }), /not both/);
});

test('the live database needs ORPHAN_DB_NAME to match exactly, and a backup before anything is deleted', () => {
  assert.match(ok({ live: true }), /ORPHAN_DB_NAME/);
  assert.match(ok({ live: true, liveName: 'Other', connectedName: 'CZAMS' }), /says "Other"/);
  assert.equal(ok({ live: true, liveName: 'CZAMS', connectedName: 'CZAMS' }), null, 'a dry run is allowed');
  assert.match(ok({ live: true, liveName: 'CZAMS', connectedName: 'CZAMS', apply: true }), /backup/);
  assert.equal(ok({ live: true, liveName: 'CZAMS', connectedName: 'CZAMS', apply: true, backupDone: true }), null);
});

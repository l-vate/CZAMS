// Run with: npm test (inside server/). The profile page's explanation for the disabled Delete Account button (src/utils/deletionBlock.js).
// The server is the one that refuses the deletion (test/accountDeletionBlockers.test.js); this only says so first. No database.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'deletionBlock.js')).href);

test('only Pending, Approved and In Progress bookings count as active', async () => {
  const { countActiveBookings } = await load();
  const list = ['Pending', 'Approved', 'In Progress', 'Completed', 'Cancelled'].map((status) => ({ status }));
  assert.equal(countActiveBookings(list), 3);
  assert.equal(countActiveBookings([{ status: 'Completed' }, { status: 'Cancelled' }]), 0);
  assert.equal(countActiveBookings([]), 0);
  assert.equal(countActiveBookings(null), 0);
});

test('the note gives the count with the right singular or plural, and is empty when nothing blocks', async () => {
  const { deletionBlockNote } = await load();
  assert.equal(deletionBlockNote(0), '');
  assert.match(deletionBlockNote(1), /You cannot delete your account while you have active bookings\. You have 1 active booking\. Complete or cancel it first\./);
  assert.match(deletionBlockNote(3), /You have 3 active bookings\. Complete or cancel them first\./);
});

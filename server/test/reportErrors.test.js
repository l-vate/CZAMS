const test = require('node:test');
const assert = require('node:assert/strict');
const { reportErrorResponse } = require('../utils/reportErrors');

test('a duplicate key (a second report for the same job) is a 400 with a clear message', () => {
  const err = Object.assign(new Error('E11000 duplicate key error collection: reports index: bookingId_1'), { code: 11000 });
  assert.deepEqual(reportErrorResponse(err), { status: 400, message: 'A report already exists for this job.' });
});

test('an error the technician cannot fix is not turned into a 400', () => {
  assert.equal(reportErrorResponse(new Error('connection lost')), null);
  assert.equal(reportErrorResponse(null), null);
});

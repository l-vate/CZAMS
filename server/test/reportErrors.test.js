const test = require('node:test');
const assert = require('node:assert/strict');
const Report = require('../models/Report');
const { validateReportInput, reportErrorResponse } = require('../utils/reportErrors');

// ---- E1-5: a second report for the same job
test('a duplicate key (a second report for the same job) is a 400 with a clear message', () => {
  const err = Object.assign(new Error('E11000 duplicate key error collection: reports index: bookingId_1'), { code: 11000 });
  assert.deepEqual(reportErrorResponse(err), { status: 400, message: 'A report already exists for this job.' });
});

test('an error the technician cannot fix is not turned into a 400', () => {
  assert.equal(reportErrorResponse(new Error('connection lost')), null);
  assert.equal(reportErrorResponse(null), null);
});

// ---- E1-6: the five inputs the audit found answering a generic 500
const rejected = [
  ['labor hours above 24', { laborHours: '25' }, /Labor hours must be a number from 0 to 24/],
  ['negative labor hours', { laborHours: '-1' }, /Labor hours must be a number from 0 to 24/],
  ['labor hours that are not a number', { laborHours: 'abc' }, /Labor hours must be a number from 0 to 24/],
  ['an invalid follow-up date', { followUpRequired: true, followUpDate: 'not-a-date' }, /follow-up date must be a valid date/],
  ['an unknown resolution', { issueResolution: 'Bogus' }, /Resolution must be one of Complete, Partial, Unresolved/],
];

rejected.forEach(([name, input, message]) => {
  test(`rejects ${name} with a 400 and a field-specific message`, () => {
    const problem = validateReportInput(input);
    assert.equal(problem.status, 400);
    assert.match(problem.message, message);
  });
});

test('accepts good input and leaves optional fields empty', () => {
  assert.equal(validateReportInput({}), null);
  assert.equal(validateReportInput({ laborHours: '0' }), null);
  assert.equal(validateReportInput({ laborHours: '24', issueResolution: 'Complete' }), null);
  assert.equal(validateReportInput({ laborHours: '', issueResolution: '' }), null);
  assert.equal(validateReportInput({ followUpRequired: true, followUpDate: '2026-11-01' }), null);
});

test('a follow-up date that is not required is not checked', () => {
  assert.equal(validateReportInput({ followUpRequired: false, followUpDate: 'garbage' }), null);
});

// What the model throws if something slips past validateReportInput: still a 400, never a 500.
test('a model validation error becomes a field-specific 400', async () => {
  const doc = new Report({ bookingId: 'CZ-1', booking: '64b64c1f1c1f1c1f1c1f1c1f', technicianId: 'STF1', workSummary: 'ok', laborHours: 25 });
  const err = await doc.validate().then(() => null, (e) => e);
  assert.deepEqual(reportErrorResponse(err), { status: 400, message: 'Labor hours must be a number from 0 to 24.' });
});

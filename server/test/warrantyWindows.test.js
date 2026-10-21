// Run with: npm test (inside server/). The warranty windows are the owner's answers, kept in one object (WARRANTY_WINDOWS in
// utils/warranty.js) and counted in Manila calendar days and months from the completion day. Pure: no database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { getWarrantyStatus, WARRANTY_WINDOWS, unitSourceOf } = require('../utils/warranty');

// a completed booking; `at` is the completion instant
const job = (serviceType, at, over = {}) => ({ status: 'Completed', completedAt: new Date(at), service: { serviceType }, ...over });
// the last instant of a Manila day, and the first instant after it
const endOfDay = (key) => new Date(`${key}T23:59:59.999+08:00`);
const startAfter = (key) => new Date(endOfDay(key).getTime() + 1);
const expiresOn = (status) => new Date(status.workmanship.expiresAt.getTime() + 8 * 3600000).toISOString().slice(0, 10);

test('the windows are the owner\'s answers, in one object', () => {
  assert.deepEqual(WARRANTY_WINDOWS.cleaning, { days: 7, scope: 'Water leaks only' });
  assert.equal(WARRANTY_WINDOWS.installationCompanyUnit.months, 6);
  assert.equal(WARRANTY_WINDOWS.installationCustomerUnit.months, 3);
  assert.equal(WARRANTY_WINDOWS.leakRepair.months, 1);
  assert.throws(() => { 'use strict'; WARRANTY_WINDOWS.cleaning.days = 99; }, TypeError, 'frozen');
});

test('cleaning: 7 days from the completion day, water leaks only; the last day counts, the next one does not', () => {
  const at = '2026-10-01T10:00:00+08:00';
  const status = getWarrantyStatus(job('Cleaning', at), endOfDay('2026-10-08'));
  assert.equal(status.applicable, true);
  assert.equal(status.type, 'Cleaning');
  assert.equal(status.scope, 'Water leaks only');
  assert.equal(expiresOn(status), '2026-10-08');
  assert.equal(status.workmanship.active, true, 'still covered at 23:59:59.999 on the 8th');
  assert.equal(getWarrantyStatus(job('Cleaning', at), startAfter('2026-10-08')).workmanship.active, false, 'expired the next instant');
  assert.equal(status.unit, null);
});

test('installation of a unit bought from Cooling Zone: 6 months, plus the unit warranty', () => {
  const status = getWarrantyStatus(job('Installation', '2026-03-15T09:00:00+08:00', { clientSuppliedUnit: false }), endOfDay('2026-09-15'));
  assert.equal(status.type, 'Installation (CZA-supplied unit)');
  assert.equal(status.unitSource, 'company');
  assert.equal(expiresOn(status), '2026-09-15');
  assert.equal(status.workmanship.active, true);
  assert.equal(getWarrantyStatus(job('Installation', '2026-03-15T09:00:00+08:00'), startAfter('2026-09-15')).workmanship.active, false);
  assert.ok(status.unit, 'the unit itself is covered');
});

test('installation of a customer-supplied unit: 3 months, and no warranty on the unit itself', () => {
  const booking = job('Installation', '2026-03-15T09:00:00+08:00', { clientSuppliedUnit: true });
  const status = getWarrantyStatus(booking, endOfDay('2026-06-15'));
  assert.equal(status.type, 'Installation (client-supplied unit)');
  assert.equal(status.unitSource, 'customer');
  assert.equal(expiresOn(status), '2026-06-15');
  assert.equal(status.workmanship.active, true);
  assert.equal(getWarrantyStatus(booking, startAfter('2026-06-15')).workmanship.active, false);
  assert.equal(status.unit, null, 'nothing on the unit');
});

test('leak repair (system reprocess): 1 month', () => {
  const booking = job('Leak Repair', '2026-10-10T09:00:00+08:00');
  const status = getWarrantyStatus(booking, endOfDay('2026-11-10'));
  assert.equal(status.type, 'Leak Repair');
  assert.equal(expiresOn(status), '2026-11-10');
  assert.equal(status.workmanship.active, true);
  assert.equal(getWarrantyStatus(booking, startAfter('2026-11-10')).workmanship.active, false);
});

test('month-end: 31 August plus 6 months ends on the last day of February, never in March', () => {
  assert.equal(expiresOn(getWarrantyStatus(job('Installation', '2026-08-31T10:00:00+08:00'))), '2027-02-28');
  assert.equal(expiresOn(getWarrantyStatus(job('Installation', '2027-08-31T10:00:00+08:00'))), '2028-02-29', 'a leap year');
});

test('month-end: 30 November plus 3 months (customer unit), 31 January plus 1 month (leak repair)', () => {
  assert.equal(expiresOn(getWarrantyStatus(job('Installation', '2026-11-30T10:00:00+08:00', { clientSuppliedUnit: true }))), '2027-02-28');
  assert.equal(expiresOn(getWarrantyStatus(job('Leak Repair', '2027-01-31T10:00:00+08:00'))), '2027-02-28');
  assert.equal(expiresOn(getWarrantyStatus(job('Leak Repair', '2028-01-31T10:00:00+08:00'))), '2028-02-29');
  assert.equal(expiresOn(getWarrantyStatus(job('Leak Repair', '2026-08-31T10:00:00+08:00'))), '2026-09-30');
});

test('the completion day is the Manila day: 20:00 UTC on 31 August is already 1 September in Manila', () => {
  assert.equal(expiresOn(getWarrantyStatus(job('Installation', '2026-08-31T20:00:00Z'))), '2027-03-01');
  assert.equal(expiresOn(getWarrantyStatus(job('Cleaning', '2026-12-28T20:00:00Z'))), '2027-01-05');
});

test('a service with no owner window is never in warranty: Repair, Maintenance, Check-up, Other', () => {
  ['Repair', 'Maintenance', 'Check-up', 'Other'].forEach((type) => {
    assert.equal(getWarrantyStatus(job(type, '2026-10-01T10:00:00+08:00')).applicable, false, type);
  });
});

test('nothing is covered until the job is completed', () => {
  assert.equal(getWarrantyStatus({ status: 'Approved', service: { serviceType: 'Cleaning' } }).applicable, false);
});

test('the unit source is read from the booking: company or customer for an Installation, nothing for other services', () => {
  assert.equal(unitSourceOf({ service: { serviceType: 'Installation' }, clientSuppliedUnit: false }), 'company');
  assert.equal(unitSourceOf({ service: { serviceType: 'Installation' }, clientSuppliedUnit: true }), 'customer');
  assert.equal(unitSourceOf({ service: { serviceType: 'Cleaning' }, clientSuppliedUnit: true }), null);
});

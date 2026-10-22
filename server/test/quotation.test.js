// Run with: npm test (inside server/). The quotation details of an installation booking (E13-4): estimated duration, exclusions, warranty
// terms, the quoted prices including VAT, and the site details. Covers each field's default, the admin's edit, who may edit, what the
// customer and the technician see, the audit trail, that old bookings are unaffected, and that the warranty defaults did not change.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');
const { getWarrantyStatus, WARRANTY_WINDOWS } = require('../utils/warranty');
const { quotationOf, standardMonths } = require('../utils/quotation');
const { getBookingBasePrice } = require('../utils/pricing');
const { toCustomerView } = require('../utils/customerView');
const { toTechnicianView } = require('../utils/technicianView');

const { state, post, call, addBooking, addCatalogUnit, goodDate } = harness;

const install = { _id: 'S-INST', name: 'Installation', serviceType: 'Installation', price: 5000, isActive: true };
const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true };
const users = [
  { _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' },
  { _id: 'COM1', role: 'customer', isActive: true, clientType: 'Commercial', name: 'Company', agreedPaymentTermsDays: null },
  { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' },
  { _id: 'STF1', role: 'staff', isActive: true, name: 'Tech', position: 'Technician' },
];
const asAdmin = { role: 'admin' };
const asStaff = { role: 'staff' };

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({ users, services: [install, cleaning] }));

const unit = () => { const item = addCatalogUnit(); return [{ type: 'Split Type', quantity: 1, hp: '1', supplied: { catalogId: item._id } }]; };
const bookInstall = (extra = {}, as = 'CUS1', opts) => post({ service: 'S-INST', date: goodDate(9), clientSuppliedUnit: false, units: unit(), ...extra }, as, opts);
const bid = () => state.bookings[0].bookingId;
const patch = (body, as = 'ADM1', opts = asAdmin) => call('PATCH', `/${bid()}/quotation`, as, body, opts);

// ---- the defaults
test('a new installation starts with the standard duration and exclusions', async () => {
  assert.equal((await bookInstall()).status, 201);
  const q = state.bookings[0].quotation;
  assert.deepEqual(q.estimatedDays, { min: 1, max: 2 });
  assert.deepEqual(q.exclusions, ['Feeder line', 'Carpentry works', 'Masonry works', 'Electrical works']);
  const terms = quotationOf({ ...state.bookings[0], service: install });
  assert.deepEqual(terms.estimatedDays, { min: 1, max: 2 });
  assert.equal(terms.exclusions.length, 4);
  assert.equal(terms.taxInclusive, false);
});

test('another service gets no quotation details', async () => {
  const res = await post({ service: 'S-CLEAN', date: goodDate(9) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(state.bookings[0].quotation, undefined);
  assert.equal(quotationOf({ ...state.bookings[0], service: cleaning }), null);
});

test('the warranty defaults are the standard windows and did not change', async () => {
  assert.equal(WARRANTY_WINDOWS.installationCompanyUnit.months, 6);
  assert.equal(WARRANTY_WINDOWS.installationCustomerUnit.months, 3);
  assert.equal(standardMonths(false), 6);
  assert.equal(standardMonths(true), 3);
  await bookInstall();
  const terms = quotationOf({ ...state.bookings[0], service: install });
  assert.equal(terms.warranty.workmanshipMonths, 6, 'a company unit is 6 months by default');
  assert.equal(terms.warranty.workmanshipCustom, false);
  assert.match(terms.warranty.unitText, /Compressor 5 years, minor parts 1 year/);
  const own = quotationOf({ ...state.bookings[0], clientSuppliedUnit: true, service: install });
  assert.equal(own.warranty.workmanshipMonths, 3, 'the customer\'s own unit is 3 months by default');
  assert.equal(own.warranty.unitText, null, 'a customer\'s own unit has no unit warranty');
});

test('a booking made before these fields existed shows none and keeps its warranty', () => {
  const old = { service: install, clientSuppliedUnit: false, status: 'Completed', completedAt: '2026-01-10T00:00:00Z' };
  const terms = quotationOf(old);
  assert.equal(terms.estimatedDays, null);
  assert.equal(terms.exclusions, null);
  assert.equal(terms.warranty.workmanshipMonths, 6);
  const status = getWarrantyStatus(old, new Date('2026-02-01T00:00:00Z'));
  assert.equal(new Date(status.workmanship.expiresAt).toISOString().slice(0, 10), '2026-07-10');
});

// ---- the admin edits them
test('the admin changes each field and every change is on the audit trail with before and after', async () => {
  await bookInstall();
  const res = await patch({
    estimatedDays: { min: 2, max: 3 },
    exclusions: ['Feeder line', ' Painting ', ''],
    warrantyMonths: 3,
    unitWarrantyText: 'Compressor 5 years, parts 1 year, as quoted',
    taxInclusive: true,
    site: { building: 'Tower A', floorRoom: '5F Room 502', attention: 'Ms. Reyes' },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const b = state.bookings[0];
  assert.deepEqual(b.quotation.estimatedDays, { min: 2, max: 3 });
  assert.deepEqual(b.quotation.exclusions, ['Feeder line', 'Painting']);
  assert.equal(b.quotation.warrantyMonths, 3);
  assert.equal(b.quotation.unitWarrantyText, 'Compressor 5 years, parts 1 year, as quoted');
  assert.equal(b.taxInclusive, true);
  assert.deepEqual(b.site, { building: 'Tower A', floorRoom: '5F Room 502', attention: 'Ms. Reyes' });
  assert.equal(res.body.quotationTerms.warranty.workmanshipMonths, 3);
  assert.equal(res.body.quotationTerms.warranty.workmanshipCustom, true);

  assert.equal(state.audits.length, 1);
  const audit = state.audits[0];
  assert.equal(audit.action, 'quotation.update');
  assert.equal(audit.actor.id, 'ADM1');
  assert.equal(audit.meta.before.estimatedDays, '1-2');
  assert.equal(audit.meta.after.estimatedDays, '2-3');
  assert.equal(audit.meta.before.warrantyMonths, null);
  assert.equal(audit.meta.after.warrantyMonths, 3);
  assert.equal(audit.meta.before.taxInclusive, false);
  assert.equal(audit.meta.after.taxInclusive, true);
});

test('null puts a field back to its default', async () => {
  await bookInstall();
  await patch({ warrantyMonths: 12, unitWarrantyText: 'Custom text' });
  assert.equal(state.bookings[0].quotation.warrantyMonths, 12);
  await patch({ warrantyMonths: null, unitWarrantyText: null, exclusions: null });
  const terms = quotationOf({ ...state.bookings[0], service: install });
  assert.equal(terms.warranty.workmanshipMonths, 6);
  assert.equal(terms.warranty.workmanshipCustom, false);
  assert.match(terms.warranty.unitText, /Compressor 5 years/);
  assert.equal(terms.exclusions, null);
});

test('bad values are refused', async () => {
  await bookInstall();
  const bad = [
    { estimatedDays: { min: 0, max: 1 } }, { estimatedDays: { min: 3, max: 2 } }, { estimatedDays: { min: 1.5, max: 2 } }, { estimatedDays: { min: 1, max: 99 } },
    { exclusions: 'feeder line' }, { exclusions: Array(13).fill('x') }, { exclusions: ['x'.repeat(101)] },
    { warrantyMonths: -1 }, { warrantyMonths: 2.5 }, { warrantyMonths: 999 }, { unitWarrantyText: 'x'.repeat(201) },
    { taxInclusive: 'yes' }, { site: { building: 'x'.repeat(101) } }, { site: 'Tower A' }, {},
  ];
  for (const body of bad) assert.equal((await patch(body)).status, 400, JSON.stringify(body));
  assert.equal(state.audits.length, 0);
  assert.equal(!!state.bookings[0].taxInclusive, false);
});

test('only an admin can change them: customers and staff get 403', async () => {
  await bookInstall();
  assert.equal((await patch({ warrantyMonths: 1 }, 'CUS1', undefined)).status, 403);
  assert.equal((await patch({ warrantyMonths: 1 }, 'STF1', asStaff)).status, 403);
  assert.equal(state.bookings[0].quotation.warrantyMonths, undefined);
  assert.equal(state.audits.length, 0);
});

test('they can be changed while Pending, Approved or In Progress, not after Completed or Cancelled', async () => {
  await bookInstall();
  for (const status of ['Approved', 'In Progress']) {
    state.bookings[0].status = status;
    assert.equal((await patch({ estimatedDays: { min: 1, max: 1 } })).status, 200, status);
  }
  for (const status of ['Completed', 'Cancelled']) {
    state.bookings[0].status = status;
    assert.equal((await patch({ estimatedDays: { min: 1, max: 4 } })).status, 400, status);
  }
});

test('the duration, exclusions, warranty and VAT setting are for an installation; the site details work on any booking', async () => {
  await post({ service: 'S-CLEAN', date: goodDate(9) });
  assert.equal((await patch({ estimatedDays: { min: 1, max: 2 } })).status, 400);
  assert.equal((await patch({ taxInclusive: true })).status, 400);
  assert.equal((await patch({ site: { building: 'Block 3', floorRoom: '', attention: 'Mr. Cruz' } })).status, 200);
  assert.equal(state.bookings[0].site.attention, 'Mr. Cruz');
});

// ---- the customer
test('a change to the terms is told to the customer; a change to the site details is not', async () => {
  await bookInstall();
  await patch({ site: { building: 'Tower A', floorRoom: '', attention: '' } });
  assert.equal(state.notes.filter((n) => n.type === 'quotation_updated').length, 0);
  await patch({ exclusions: ['Feeder line'], estimatedDays: { min: 1, max: 3 } });
  const note = state.notes.find((n) => n.type === 'quotation_updated');
  assert.equal(note.user, 'CUS1');
  assert.match(note.message, /the estimated duration, what is not included/);
});

test('the customer sees the terms, the VAT setting and the site details; the raw settings stay out', async () => {
  await bookInstall({ siteBuilding: 'Tower A', siteFloorRoom: '5F', siteAttention: 'Ms. Reyes' });
  assert.deepEqual(state.bookings[0].site, { building: 'Tower A', floorRoom: '5F', attention: 'Ms. Reyes' });
  const { withWarranty } = require('../utils/bookingView');
  const view = toCustomerView(withWarranty({ ...state.bookings[0], service: install, toObject() { return JSON.parse(JSON.stringify({ ...state.bookings[0], service: install })); } }));
  assert.equal(view.quotationTerms.estimatedDays.max, 2);
  assert.equal(!!view.taxInclusive, false);
  assert.equal(view.site.attention, 'Ms. Reyes');
  assert.equal('quotation' in view, false);
});

test('the technician sees the site details and no prices', async () => {
  await bookInstall({ siteBuilding: 'Tower A', siteFloorRoom: '5F', siteAttention: 'Ms. Reyes' });
  const view = toTechnicianView({ ...state.bookings[0], service: install });
  assert.deepEqual(view.site, { building: 'Tower A', floorRoom: '5F', attention: 'Ms. Reyes' });
  assert.equal(JSON.stringify(view).includes('taxInclusive'), false);
});

test('site details are optional and short', async () => {
  assert.equal((await bookInstall()).status, 201);
  assert.equal(state.bookings[0].site, undefined);
  assert.equal((await bookInstall({ siteBuilding: 'x'.repeat(101) })).status, 400);
});

// ---- the warranty follows the months the admin set
test('the months the admin sets are the workmanship warranty that booking gets; the default is untouched for others', async () => {
  const completed = { service: install, clientSuppliedUnit: false, status: 'Completed', completedAt: '2026-01-10T00:00:00Z' };
  const at = new Date('2026-02-01T00:00:00Z');
  const date = (b) => new Date(getWarrantyStatus(b, at).workmanship.expiresAt).toISOString().slice(0, 10);
  assert.equal(date(completed), '2026-07-10');
  assert.equal(date({ ...completed, quotation: { warrantyMonths: 3 } }), '2026-04-10');
  assert.equal(date({ ...completed, quotation: {} }), '2026-07-10');
});

// ---- VAT included in the price
test('when the prices include VAT, the VAT of a commercial booking is the part inside the price, not 12% on top', async () => {
  await bookInstall({}, 'COM1');
  const b = state.bookings[0];
  assert.equal(b.isCommercial, true);
  const base = getBookingBasePrice({ ...b, service: install });
  assert.equal(b.vatAmount, Math.round(base * 0.12), 'by default 12% is added on top');
  await patch({ taxInclusive: true });
  assert.equal(state.bookings[0].vatAmount, Math.round((base * 12) / 112));
  assert.ok(state.bookings[0].vatAmount < Math.round(base * 0.12));
  await patch({ taxInclusive: false });
  assert.equal(state.bookings[0].vatAmount, Math.round(base * 0.12));
});

test('a residential booking is never charged VAT, whatever the flag says', async () => {
  await bookInstall();
  await patch({ taxInclusive: true });
  assert.equal(state.bookings[0].taxInclusive, true);
  assert.equal(state.bookings[0].vatAmount === undefined || state.bookings[0].vatAmount === 0, true);
});

// ---- payment terms in days
test('the agreed payment terms in days are stored on the booking for a commercial client and shown to the customer', async () => {
  harness.reset({ users: [...users, { _id: 'COM2', role: 'customer', isActive: true, clientType: 'Commercial', name: 'Company Two', agreedPaymentTermsDays: 7 }], services: [install, cleaning] });
  assert.equal((await bookInstall({ downPaymentPercent: 0 }, 'COM2')).status, 201);
  assert.equal(state.bookings[0].paymentTermsDays, 7);
  const { withWarranty } = require('../utils/bookingView');
  const view = toCustomerView(withWarranty({ ...state.bookings[0], service: install, toObject() { return JSON.parse(JSON.stringify({ ...state.bookings[0], service: install })); } }));
  assert.equal(view.paymentTermsDays, 7);
});

test('an existing booking with no quotation fields is not touched by an unrelated change', () => {
  const b = addBooking({ bookingId: 'CZ-OLD', customer: 'CUS1', service: install, status: 'Pending', units: [{ type: 'Split Type', quantity: 1 }], clientSuppliedUnit: false });
  assert.equal(b.quotation, undefined);
  assert.equal(b.taxInclusive, undefined);
  assert.equal(b.site, undefined);
});

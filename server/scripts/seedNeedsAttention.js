/* eslint-disable no-console -- a command-line script: printing is its output */
// Adds a few fake bookings in every "Needs attention" state to the audit database CZAMS_audit_test, so the admin dashboard panel can be checked
// by eye. It only ever connects through scripts/lib/auditDb.js (which refuses any database but CZAMS_audit_test), never reads server/.env, and
// never prints a connection string or a password.
//
//   node scripts/seedNeedsAttention.js            dry run: prints what it would add, never connects
//   node scripts/seedNeedsAttention.js --add      adds them (first removes the ones it added before: booking numbers CZ-2026-98xx)
//   node scripts/seedNeedsAttention.js --remove   removes only those
const mongoose = require('mongoose');
const { connectAudit } = require('./lib/auditDb');

const PREFIX = 'CZ-2026-98';
const day = (offset) => new Date(Date.now() + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
const ago = (days, hours = 0) => new Date(Date.now() - days * 86400000 - hours * 3600000);

const base = (n, over) => ({
  bookingId: `${PREFIX}${String(n).padStart(2, '0')}`, customer: 'CUS9001', service: 'S-CLEAN', status: 'Pending', date: day(10), time: 'Morning',
  units: [{ type: 'Split Type', quantity: 1 }], assignments: [], address: 'Quezon City', contactNumber: '09171234567', downPaymentPercent: 50,
  paymentMode: 'GCash', paymentMode2: 'GCash', paymentStatus: 'Unpaid', balancePaymentStatus: 'None', refund: { status: 'None' },
  createdAt: ago(0, 2), updatedAt: ago(0, 2), ...over,
});
const pair = [{ team: null, lead: 'STF9001', helper: 'STF9003' }];

const BOOKINGS = [
  base(1, { customer: 'CUS9001', date: day(0) }), // today_pending, due today
  base(2, { customer: 'CUS9002', date: day(1), service: 'S-INSTALL', units: [{ type: 'Split Type', quantity: 1, supplied: { source: 'requested', status: 'Pending', chosenAt: ago(2), request: { brand: 'Samsung', type: 'Split Type', hp: '2.0', notes: '' } } }] }), // today_pending + unit_confirmation
  base(3, { customer: 'CUS9003', status: 'Approved', date: day(0), assignments: [{ team: null, lead: 'STF9001', helper: null }], paymentStatus: 'partially_paid' }), // today_unstaffed
  base(4, { customer: 'CUS9004', status: 'Approved', date: day(1), assignments: pair, paymentStatus: 'to_verify', updatedAt: ago(1) }), // today_proof + payment_proof
  base(5, { customer: 'CUS9005', date: day(12), createdAt: ago(4) }), // pending_approval, waiting long enough to be "soon"
  base(6, { customer: 'CUS9006', date: day(15), service: 'S-INSTALL', unitDecline: { reason: 'We do not carry that brand', declinedAt: ago(1) } }), // cannot_supply
  base(7, { customer: 'CUS9001', status: 'Approved', date: day(9), assignments: pair, paymentStatus: 'partially_paid', discount: { type: 'Senior', status: 'Pending', requestedAt: ago(1) } }), // discount_review
  base(8, { customer: 'CUS9002', status: 'In Progress', date: day(0), assignments: pair, paymentStatus: 'partially_paid', extensionRequest: { status: 'Pending', reason: 'More work than planned', requestedDate: day(1), requestedTime: 'Morning', requestedAt: ago(0, 3) } }), // extension_request
  base(9, { customer: 'CUS9003', status: 'Approved', date: day(5), assignments: pair, paymentStatus: 'partially_paid', disruption: { status: 'Reported', reason: 'Rain', reportedAt: ago(0, 5), initiatedBy: 'technician' } }), // disruption_report
  base(10, { customer: 'CUS9004', status: 'Cancelled', date: day(6), paymentStatus: 'to_verify', paymentCheckAfterCancel: true, cancelledAt: ago(0, 4), refund: { status: 'Pending', paymentUnverified: true, downPaymentAmount: 1000, requestedAt: ago(0, 4) } }), // refund_waiting (unverified) + payment_proof
  base(11, { customer: 'CUS9005', status: 'Cancelled', date: day(8), paymentStatus: 'partially_paid', cancelledAt: ago(3), refund: { status: 'Pending', downPaymentAmount: 1000, requestedAt: ago(3) } }), // refund_waiting, waiting 3 days
  base(12, { customer: 'GONE-ACCOUNT', date: day(1) }), // a deleted customer
];
const BACK_JOBS = [{
  backJobId: 'BJ-2026-9801', originalBookingId: `${PREFIX}20`, customer: 'CUS9006', issueDescription: 'Test: back job to review', warrantyCheck: { withinWarranty: false, coverageType: 'Outside warranty', checkedAt: ago(2) },
  status: 'Not Covered', isOpen: true, reportedAt: ago(2), createdAt: ago(2), updatedAt: ago(2),
}];

(async () => {
  const mode = process.argv.slice(2).includes('--add') ? 'add' : process.argv.slice(2).includes('--remove') ? 'remove' : 'dry';
  if (mode === 'dry') {
    console.log(`Dry run: would add ${BOOKINGS.length} bookings (${PREFIX}01 to ${PREFIX}12) and ${BACK_JOBS.length} back job claim to CZAMS_audit_test.`);
    return;
  }
  await connectAudit(mongoose);
  const db = mongoose.connection.db;
  const pattern = new RegExp(`^${PREFIX}\\d\\d$`);
  const removed = await db.collection('bookings').deleteMany({ bookingId: pattern });
  const removedJobs = await db.collection('backjobs').deleteMany({ backJobId: /^BJ-2026-98\d\d$/ });
  console.log(`Removed ${removed.deletedCount} earlier fake bookings and ${removedJobs.deletedCount} fake claims.`);
  if (mode === 'add') {
    await db.collection('bookings').insertMany(BOOKINGS);
    await db.collection('backjobs').insertMany(BACK_JOBS);
    console.log(`Added ${BOOKINGS.length} bookings and ${BACK_JOBS.length} claim.`);
  }
  await mongoose.disconnect();
})().catch((err) => { console.error(err.message); process.exit(1); });

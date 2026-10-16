const test = require('node:test');
const assert = require('node:assert/strict');
const { toTechnicianView } = require('../utils/technicianView');

// A booking carrying every sensitive thing a booking can hold.
const fat = {
  _id: 'mongo1', bookingId: 'CZ-2026-1', status: 'Approved', createdAt: '2026-09-01T08:00:00Z', date: '2026-10-20', time: 'Morning',
  address: '1 Test St', contactNumber: '09123456789', problemDescription: 'not cooling', technicianInstructions: 'gate code 1234',
  service: { _id: 'S1', name: 'Repair', serviceType: 'Repair', category: 'Aircon', price: 1500, unitTypePricing: [{ unitType: 'Split Type', price: 900 }] },
  units: [{ type: 'Split Type', quantity: 2, brandModel: 'Carrier', _id: 'u1' }],
  customer: { _id: 'C1', name: 'Customer One', phone: '0917', email: 'customerone@email.com', clientType: 'Commercial', companyName: 'Acme' },
  technician: { _id: 'T1', name: 'Tech One', email: 'secret@x.com' },
  assignments: [{ team: null, lead: { _id: 'T1', name: 'Tech One', email: 'a@b.c' }, helper: { _id: 'T2', name: 'Tech Two' } }],
  assignmentHistory: [{ changedBy: 'ADM1', reason: 'because' }],
  discount: { type: 'Senior', idFile: '/uploads/proofs/abc.jpg', status: 'Approved', reviewedBy: { _id: 'ADM1', name: 'Admin Name' }, percent: 20, amount: 300 },
  proofFile: '/uploads/proofs/p1.png', balanceProofFile: '/uploads/proofs/p2.png', unitPurchaseProof: '/uploads/proofs/p3.png',
  referenceNumber: 'GC12345', balanceReferenceNumber: 'GC67890',
  paymentStatus: 'Fully Paid', paymentMode: 'GCash', paymentMode2: 'Cash', downPaymentPercent: 50, downPaymentPaidAmount: 750,
  refund: { status: 'Pending', proofFile: '/uploads/proofs/r.png', processedBy: 'ADM1', customerFlag: { message: 'where is my money' } },
  promo: { name: 'Promo', amount: 100 }, vatAmount: 180, poNumber: 'PO-1', distanceAdjustment: 200, mobilizationFee: 2500,
  queueRank: 1000, requestedTechnician: 'T9', unitWaiver: { customerName: 'Customer One' }, feedback: { rating: 5, text: 'great' },
  serviceAreaCheck: { withinArea: false }, isBackJob: false,
  disruption: { status: 'Reported', reason: 'part', reportedBy: 'T1' },
  extensionRequest: { status: 'Approved', reason: 'more time', decidedBy: 'ADM1' },
};

const FORBIDDEN_KEYS = [
  'discount', 'idFile', 'reviewedBy', 'proofFile', 'balanceProofFile', 'unitPurchaseProof', 'referenceNumber', 'balanceReferenceNumber',
  'paymentStatus', 'paymentMode', 'paymentMode2', 'downPaymentPercent', 'downPaymentPaidAmount', 'refund', 'customerFlag', 'processedBy',
  'promo', 'vatAmount', 'poNumber', 'distanceAdjustment', 'mobilizationFee', 'price', 'unitTypePricing', 'queueRank', 'requestedTechnician',
  'unitWaiver', 'feedback', 'assignmentHistory', 'email', 'clientType', 'companyName', 'reportedBy', 'decidedBy', 'serviceAreaCheck',
];

// Every key name anywhere in the value, however deep.
function allKeys(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, found));
  else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([k, v]) => { found.add(k); allKeys(v, found); });
  }
  return found;
}

test('a technician view contains none of the private or payment keys, at any depth', () => {
  const keys = allKeys(toTechnicianView(fat, { myRole: 'Lead' }));
  const leaked = FORBIDDEN_KEYS.filter((k) => keys.has(k));
  assert.deepEqual(leaked, []);
});

test('no private value survives either (file paths, references, admin names, emails)', () => {
  const text = JSON.stringify(toTechnicianView(fat, { myRole: 'Helper' }));
  ['/uploads/', 'GC12345', 'Admin Name', 'ADM1', 'customerone@email.com', 'secret@x.com', 'where is my money', 'because', 'Acme'].forEach((value) => {
    assert.equal(text.includes(value), false, `leaked: ${value}`);
  });
});

test('everything the technician screens use is still there', () => {
  const v = toTechnicianView(fat, { myRole: 'Lead' });
  assert.equal(v.bookingId, 'CZ-2026-1');
  assert.equal(v.status, 'Approved');
  assert.equal(v.createdAt, '2026-09-01T08:00:00Z');
  assert.equal(v.date, '2026-10-20');
  assert.equal(v.time, 'Morning');
  assert.equal(v.address, '1 Test St');
  assert.equal(v.contactNumber, '09123456789');
  assert.equal(v.service.name, 'Repair');
  assert.equal(v.service.serviceType, 'Repair');
  assert.deepEqual(v.units, [{ type: 'Split Type', quantity: 2, brandModel: 'Carrier' }]);
  assert.deepEqual(v.customer, { name: 'Customer One', phone: '0917' });
  assert.equal(v.technicianInstructions, 'gate code 1234');
  assert.equal(v.assignments[0].lead.name, 'Tech One');
  assert.equal(v.assignments[0].helper.name, 'Tech Two');
  assert.equal(v.myRole, 'Lead');
  assert.equal(v.disruption.reason, 'part');
  assert.equal(v.extensionRequest.status, 'Approved');
  assert.equal(v.isBackJob, false);
});

test('a field added to the booking later stays hidden until it is whitelisted', () => {
  const v = toTechnicianView({ ...fat, someNewSecret: 'x', nested: { deep: 'y' } });
  assert.equal('someNewSecret' in v, false);
  assert.equal('nested' in v, false);
});

test('empty or odd input does not throw', () => {
  assert.doesNotThrow(() => toTechnicianView(null));
  assert.doesNotThrow(() => toTechnicianView({ assignments: [{ lead: 'T1' }] }));
});

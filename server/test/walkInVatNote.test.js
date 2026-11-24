// Run with: npm test (inside server/). On the walk-in booking summary, a Commercial client gets one line under Remaining Balance saying the 12% VAT will be
// added to the billing and shown on the booking details. It changes no amount and no saved booking, and the customer's own booking summary never shows it.
// Reads the page sources; nothing connects.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startSsrServer } = require('./helpers/viteSsr');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', ...p), 'utf8');
const LINE = '12% VAT will be added to the billing and shown on the booking details.';

test('the summary shows the VAT line only when it is asked to, right under Remaining Balance, and changes nothing else on the page', async () => {
  const source = read('pages', 'customer', 'book_service.jsx');
  assert.equal(source.split(LINE).length - 1, 1, 'the sentence is written once');
  const root = path.join(__dirname, '..', '..');
  const React = require(path.join(root, 'node_modules', 'react'));
  const { renderToStaticMarkup } = require(path.join(root, 'node_modules', 'react-dom', 'server'));
  const { vite, close } = await startSsrServer();
  const { Step5 } = await vite.ssrLoadModule('/src/pages/customer/book_service.jsx').finally(close);
  const services = [{ id: 'S1', name: 'Regular Cleaning', price: 600, serviceType: 'Cleaning', unitTypePricing: [], minTechnicians: 2 }];
  const form = {
    service: 'S1', units: [{ type: 'Split Type', quantity: 1, hp: '1.0', brand: 'LG' }], date: '2026-12-10', time: 'Morning', address: 'x', contactNumber: '09171234567',
    addressParts: { houseLot: '1', street: 's', barangay: 'b', city: 'Quezon City', province: 'Metro Manila', zip: '1100' }, downPaymentPercent: 50, paymentMode: 'GCash', paymentMode2: 'GCash', technician: '',
  };
  const props = { form, services, technicians: [], downPaymentPercentages: [30, 50, 100] };
  const plain = renderToStaticMarkup(React.createElement(Step5, props));
  const withNote = renderToStaticMarkup(React.createElement(Step5, { ...props, vatNote: true }));
  assert.ok(!plain.includes(LINE), 'no note unless it is asked for');
  const noteAt = withNote.indexOf('<p class="summary-vat-note">');
  assert.ok(noteAt > 0 && withNote.slice(0, noteAt).endsWith('</div>') && withNote.slice(0, noteAt).includes('Remaining Balance'), 'the line comes right after the Remaining Balance row');
  assert.ok(withNote.slice(noteAt).startsWith(`<p class="summary-vat-note">${LINE}</p>`));
  assert.equal(withNote.slice(0, noteAt).lastIndexOf('Remaining Balance') > withNote.slice(0, noteAt).lastIndexOf('Payment Mode'), true, 'and before the Payment Mode row');
  assert.equal(withNote.replace('<p class="summary-vat-note">' + LINE + '</p>', ''), plain, 'every amount and every other line is exactly the same');
});

test('only the walk-in booking turns it on, and only for a Commercial customer; the customer booking page never does', () => {
  assert.match(read('pages', 'admin', 'walk_in_booking.jsx'), /<Step5 [^>]*vatNote=\{isCommercial\} \/>/);
  assert.match(read('pages', 'admin', 'walk_in_booking.jsx'), /const isCommercial = customer\?\.clientType === 'Commercial';/);
  assert.doesNotMatch(read('pages', 'customer', 'book_service.jsx'), /vatNote=/);
});

test('the amounts and the saved booking are untouched: the note is a line of text, outside the cost breakdown and the form data', () => {
  const walkIn = read('pages', 'admin', 'walk_in_booking.jsx');
  assert.doesNotMatch(walkIn, /vatNote[^;\n]*formData|formData[^;\n]*vatNote/);
  assert.match(walkIn, /formData\.append\('addressParts', JSON\.stringify\(form\.addressParts\)\);/);
});

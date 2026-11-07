// Run with: npm test (inside server/). Every picture a person picks to send is shown first, with a Remove button. No database; the client
// file is rendered to static markup through Vite. The accepted file types did not change.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { startSsrServer } = require('./helpers/viteSsr');

const root = path.join(__dirname, '..', '..');
const fromRoot = createRequire(path.join(root, 'package.json'));
let vite;
let closeVite;
before(async () => { ({ vite, close: closeVite } = await startSsrServer()); });
after(async () => { await closeVite(); });
const read = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');

test('nothing is shown until a file is picked, then its name and a Remove button', async () => {
  const React = fromRoot('react');
  const { renderToStaticMarkup } = fromRoot('react-dom/server');
  const FilePreview = (await vite.ssrLoadModule('/src/components/file_preview.jsx')).default;
  assert.equal(renderToStaticMarkup(React.createElement(FilePreview, { file: null })), '');
  const html = renderToStaticMarkup(React.createElement(FilePreview, { file: { name: 'proof.pdf', type: 'application/pdf' }, onRemove() {} }));
  assert.match(html, /proof\.pdf/);
  assert.match(html, /<button[^>]*>Remove<\/button>/);
});

test('each upload shows the picked file before sending', () => {
  [
    'components/payment_modal.jsx', // down payment proof and balance proof
    'components/discount_option.jsx', // Senior or PWD ID photo
    'pages/staff/reports.jsx', // signed paper form photo
    'pages/admin/payments.jsx', // refund proof
    'pages/admin/walk_in_booking.jsx', // walk-in proof
  ].forEach((f) => assert.match(read(f), /<FilePreview /, f));
  // the optional photo or video (booking, back job) goes through the media picker, which holds the preview
  ['pages/customer/book_service.jsx', 'components/back_job_modal.jsx'].forEach((f) => assert.match(read(f), /<MediaPicker\b/, f));
  assert.match(read('components/media_picker.jsx'), /<FilePreview /);
});

test('the allowed file types did not change', () => {
  assert.match(read('components/payment_modal.jsx'), /accept="image\/jpeg,image\/png"/);
  assert.match(read('components/discount_option.jsx'), /accept="image\/jpeg,image\/png,image\/webp,\.pdf"/);
  assert.match(read('pages/staff/reports.jsx'), /accept="image\/jpeg,image\/png"/);
});

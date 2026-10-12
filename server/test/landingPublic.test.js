// Run with: npm test (inside server/). Evidence for the landing page, no application code involved: what a
// logged-out visitor can get about technicians, and that the rating shown is the company-wide one.
// The real routes run in a tiny Express app; only the database calls are stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const { chain } = require('./helpers/memoryQueries');

let server;
let base;

test.before(async () => {
  // what the database holds for the technicians, including things a visitor must never get
  User.find = () => chain([
    { _id: 'STF1001', name: 'Tech One', position: 'Technician', email: 'one@example.com', phone: '0917', profileImage: '/uploads/profile-images/one.png', password: 'x' },
    { _id: 'STF1002', name: 'Tech Two', position: 'Secretary', email: 'two@example.com', phone: '0918', profileImage: '/uploads/profile-images/two.png', password: 'x' },
  ].map((u) => ({ ...u, toJSON() { return u; } })));
  Booking.aggregate = async () => [{ averageRating: 4.46, totalReviews: 12 }];
  Booking.find = () => chain([
    { feedback: { rating: 5, text: 'Very good work', createdAt: '2026-10-01T00:00:00Z' }, customer: 'CUS1', technician: 'STF1001', bookingId: 'CZ-1' },
    { feedback: { rating: 4, text: 'On time', createdAt: '2026-09-30T00:00:00Z' }, customer: 'CUS2', technician: 'STF1002', bookingId: 'CZ-2' },
  ]);

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/bookings', require('../routes/bookingRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());

const get = async (path_) => {
  const res = await fetch(`${base}${path_}`); // no Authorization header at all: a logged-out visitor
  return { status: res.status, text: await res.text() };
};

test('a logged-out visitor can load the technician list the landing search uses: names only', async () => {
  const res = await get('/api/auth/technicians');
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.text), [{ name: 'Tech One' }, { name: 'Tech Two' }]);
});

test('that list has no ids, positions, photos, emails, phone numbers or ratings', async () => {
  const { text } = await get('/api/auth/technicians');
  ['STF1001', 'STF1002', 'Technician"', 'Secretary', '.png', 'profileImage', '@example.com', '0917', '0918', 'rating', 'position', '_id', 'password'].forEach((needle) => {
    assert.equal(text.includes(needle), false, `the public list must not contain ${needle}`);
  });
});

test('the landing page shows the company-wide rating and recent reviews, with no name of a customer or technician', async () => {
  const res = await get('/api/bookings/public/feedback-summary');
  assert.equal(res.status, 200);
  const body = JSON.parse(res.text);
  assert.equal(body.averageRating, 4.5);
  assert.equal(body.totalReviews, 12);
  assert.equal(body.recentReviews.length, 2);
  body.recentReviews.forEach((r) => assert.deepEqual(Object.keys(r).sort(), ['createdAt', 'rating', 'text']));
  ['CUS1', 'CUS2', 'STF1001', 'STF1002', 'CZ-1', 'CZ-2', 'Tech One'].forEach((needle) => {
    assert.equal(res.text.includes(needle), false, `the public summary must not contain ${needle}`);
  });
});

test('the landing page calls the technician list with no login, and says individual ratings are not published', () => {
  const root = path.join(__dirname, '..', '..', 'src');
  const service = fs.readFileSync(path.join(root, 'services', 'authService.js'), 'utf8');
  assert.match(service, /listPublicTechnicians[\s\S]*?auth: false/);
  const landing = fs.readFileSync(path.join(root, 'pages', 'public', 'landing_page.jsx'), 'utf8');
  assert.match(landing, /listPublicTechnicians/);
  assert.match(landing, /Individual ratings are not published/);
  assert.equal(/technician[^\n]*rating|rating[^\n]*technician\._id/i.test(landing.replace(/Individual ratings are not published[^\n]*/, '')), false);
});

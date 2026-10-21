// Run with: npm test (inside server/). The health address for an uptime monitor, and the scheduled jobs on a host that sleeps: each job
// runs once as soon as it starts, so work due while the process was asleep is caught up. No database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cron = require('node-cron');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const ServiceReminder = require('../models/ServiceReminder');
const healthRoutes = require('../routes/healthRoutes');
const { chain } = require('./helpers/memoryQueries');

test.describe('GET /api/health', () => {
  let server;
  let base;
  test.before(async () => {
    const app = express();
    app.use('/api/health', healthRoutes);
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  test.after(() => server && server.close());
  test.beforeEach(() => healthRoutes.healthLimiter.reset());

  test('answers ok with the time and nothing else, with no login', async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ['status', 'time']);
    assert.equal(body.status, 'ok');
    assert.equal(new Date(body.time).toISOString(), body.time);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });

  test('says nothing about the database, the environment or the server', async () => {
    const text = JSON.stringify(await (await fetch(`${base}/api/health`)).json()).toLowerCase();
    ['mongo', 'database', 'version', 'node', 'env', 'uptime', 'memory', 'secret', 'render'].forEach((word) => assert.equal(text.includes(word), false, word));
  });

  test('is limited to 60 requests a minute per address', async () => {
    for (let i = 0; i < 60; i += 1) assert.equal((await fetch(`${base}/api/health`)).status, 200, `request ${i + 1}`);
    const refused = await fetch(`${base}/api/health`);
    assert.equal(refused.status, 429);
    assert.ok(Number(refused.headers.get('retry-after')) > 0);
  });
});

test.describe('scheduled jobs on a host that sleeps', () => {
  const realSchedule = cron.schedule;
  const scheduled = [];
  let reminderLookups;
  let approvedLookups;
  const tick = () => new Promise((resolve) => { setImmediate(resolve); });

  test.before(() => {
    cron.schedule = (expression, fn, options) => { scheduled.push({ expression, fn, options }); return { stop() {} }; };
    Service.find = () => { reminderLookups += 1; return chain([]); };
    ServiceReminder.find = () => chain([]);
    Booking.find = () => { approvedLookups += 1; return chain([]); };
  });
  test.after(() => { cron.schedule = realSchedule; });
  test.beforeEach(() => { scheduled.length = 0; reminderLookups = 0; approvedLookups = 0; });

  test('the service reminder check runs at midnight Manila time and once as soon as the server starts', async () => {
    const { startServiceReminderSchedule } = require('../jobs/serviceReminderJob');
    startServiceReminderSchedule();
    await tick();
    assert.deepEqual(scheduled.map((s) => [s.expression, s.options.timezone]), [['0 0 * * *', 'Asia/Manila']]);
    assert.equal(reminderLookups, 1, 'it ran once right away, so a missed midnight is caught up');
    await scheduled[0].fn();
    assert.equal(reminderLookups, 2, 'the scheduled run does the same work');
  });

  test('the booking status check runs every 10 minutes on Manila time and once as soon as the server starts', async () => {
    const { startBookingStatusSchedule } = require('../jobs/bookingStatusJob');
    startBookingStatusSchedule();
    await tick();
    assert.deepEqual(scheduled.map((s) => [s.expression, s.options.timezone]), [['*/10 * * * *', 'Asia/Manila']]);
    assert.equal(approvedLookups, 1);
  });

  test('no other job is scheduled anywhere in the server', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..');
    const found = [];
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      if (['node_modules', 'test', 'uploads'].includes(entry.name)) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js') && /cron\.schedule|setInterval/.test(fs.readFileSync(full, 'utf8'))) found.push(path.relative(root, full).replace(/\\/g, '/'));
    });
    walk(root);
    assert.deepEqual(found.sort(), ['jobs/bookingStatusJob.js', 'jobs/serviceReminderJob.js', 'utils/emailDelivery.js']);
  });
});

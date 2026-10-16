// Run with: npm test (inside server/). The singular and plural helper, the peso formatter's decimals, and the customer's "My Booking
// History" card rendered to static markup (empty state, one booking, many bookings, link targets). No database; the client files are
// loaded through Vite so the JSX compiles, and React comes from the project's own node_modules so there is one copy of it.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..', '..');
const fromRoot = createRequire(path.join(root, 'package.json'));
const load = (file) => import(pathToFileURL(path.join(root, 'src', file)).href);

let vite;
before(async () => {
  const { createServer } = await import(pathToFileURL(fromRoot.resolve('vite')).href);
  vite = await createServer({ root, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null } });
});
after(async () => { await vite.close(); });

test('pluralize picks the singular for exactly one and the plural otherwise', async () => {
  const { pluralize } = await load('utils/pluralize.js');
  assert.equal(pluralize(0, 'booking'), 'bookings');
  assert.equal(pluralize(1, 'booking'), 'booking');
  assert.equal(pluralize(2, 'booking'), 'bookings');
  assert.equal(pluralize(1500000, 'booking'), 'bookings');
  assert.equal(pluralize('1', 'booking'), 'booking');
  assert.equal(pluralize(1, 'child', 'children'), 'child');
  assert.equal(pluralize(3, 'child', 'children'), 'children');
});

test('formatPeso shows whole amounts plain and other amounts with two decimals', async () => {
  const { formatPeso } = await vite.ssrLoadModule('/src/utils/bookingPricing.js');
  assert.equal(formatPeso(0), '₱0');
  assert.equal(formatPeso(1234), '₱1,234');
  assert.equal(formatPeso(1234.5), '₱1,234.50');
  assert.equal(formatPeso(1234567.891), '₱1,234,567.89');
  assert.equal(formatPeso(-800), '-₱800');
});

const history = (counts, extra = {}) => ({
  counts: { total: 0, completed: 0, pending: 0, approved: 0, inProgress: 0, cancelled: 0, backJobs: 0, ...counts },
  totalPaid: 0,
  feedback: [],
  recent: [],
  ...extra,
});

test('the card: empty state, one booking, many bookings, and where the links go', async () => {
  const React = fromRoot('react');
  const { renderToStaticMarkup } = fromRoot('react-dom/server');
  const { MemoryRouter } = fromRoot('react-router-dom');
  const Card = (await vite.ssrLoadModule('/src/components/customer_history_summary.jsx')).default;
  const render = (h) => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Card, { history: h })));
  const linkTargets = (html) => [...html.matchAll(/<a href="([^"]+)"[^>]*>([^<]*(?:<!-- -->[^<]*)*)<\/a>/g)].map((m) => [m[1], m[2].replace(/<!-- -->/g, '')]);

  // no bookings: the message and the My Bookings link only
  const empty = render(history({}));
  assert.match(empty, /No bookings yet\./);
  assert.doesNotMatch(empty, /Completed|Cancelled|Total paid|<dl/);
  assert.deepEqual(linkTargets(empty), [['/customer/bookings', 'My Bookings']]);

  // one booking: "1 booking" for the accessible name, never "1 bookings", and the figures are labelled
  const one = render(history({ total: 1, pending: 1 }, { totalPaid: 0 }));
  assert.match(one, /aria-label="1 booking"/);
  assert.doesNotMatch(one, /1 bookings/);
  for (const label of ['Total', 'Completed', 'Open', 'Cancelled', 'Total paid']) assert.match(one, new RegExp(`<dt>${label}</dt>`));
  assert.match(one, /<dt>Open<\/dt><dd>1<\/dd>/);
  assert.match(one, /<dt>Total paid<\/dt><dd>₱0<\/dd>/);
  assert.doesNotMatch(one, /No bookings yet/);

  // many bookings: counts, the open figure adds Pending, Approved and In Progress, money through formatPeso
  const many = render(history(
    { total: 12, completed: 6, pending: 1, approved: 2, inProgress: 1, cancelled: 2 },
    { totalPaid: 15234.5, feedback: [{ bookingId: 'B1', service: 'Cleaning', rating: 5, text: '' }, { bookingId: 'B2', service: 'Repair', rating: null, text: 'ok' }] },
  ));
  assert.match(many, /aria-label="12 bookings"/);
  assert.match(many, /<dt>Completed<\/dt><dd>6<\/dd>/);
  assert.match(many, /<dt>Open<\/dt><dd>4<\/dd>/);
  assert.match(many, /<dt>Cancelled<\/dt><dd>2<\/dd>/);
  assert.match(many, /<dt>Total paid<\/dt><dd>₱15,234\.50<\/dd>/);
  assert.deepEqual(linkTargets(many), [
    ['/customer/bookings', 'My Bookings'],
    ['/customer/billings', 'Billings'],
    ['/customer/bookings', 'Feedback you gave (2)'],
  ]);
  assert.equal(/[\u2013\u2014]/.test(many + one + empty), false, 'no en or em dashes in the card');
});

// Run with: npm test (inside server/). Every amount of money is shown through one formatter: the peso sign, thousands separators and two
// decimals. The client and server copies agree, and no screen, email or report builds an amount by hand any more.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const server = require('../utils/money');

const root = path.join(__dirname, '..', '..');
const loadClient = () => import(pathToFileURL(path.join(root, 'src', 'utils', 'money.js')).href);

const SAMPLES = [0, 1, 99, 300, 1500, 1500.5, 12345.678, 1234567.89, -800, -0.001, '2500', null, undefined, 'abc', NaN];

test('the formatter shows two decimals and thousands separators', () => {
  assert.equal(server.formatMoney(1500), '₱1,500.00');
  assert.equal(server.formatMoney(0), '₱0.00');
  assert.equal(server.formatMoney(1234567.5), '₱1,234,567.50');
  assert.equal(server.formatMoney(-800), '-₱800.00');
  assert.equal(server.formatMoney('2500'), '₱2,500.00');
  assert.equal(server.formatMoney(undefined), '₱0.00');
  assert.equal(server.formatMoney(-0.001), '₱0.00');
  assert.equal(server.formatAmount(1500), '1,500.00');
});

test('the client and the server copies give the same text for every sample', async () => {
  const client = await loadClient();
  SAMPLES.forEach((n) => {
    assert.equal(client.formatMoney(n), server.formatMoney(n), String(n));
    assert.equal(client.formatAmount(n), server.formatAmount(n), String(n));
  });
});

test('the old helpers now give the same two-decimal text', async () => {
  const { peso2 } = await import(pathToFileURL(path.join(root, 'src', 'utils', 'billingCard.js')).href);
  assert.equal(peso2(3500), '₱3,500.00');
});

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name === 'test' || e.name === 'scripts' || e.name === 'uploads') return [];
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(jsx?|mjs)$/.test(e.name) ? [p] : [];
  });
}

test('no screen, email, report or message builds a peso amount by hand', () => {
  const files = [...walk(path.join(root, 'src')), ...walk(path.join(root, 'server'))].filter((f) => !/utils[\\/]money\.js$/.test(f));
  const offenders = [];
  files.forEach((f) => {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      const money = /₱\s*\$?\{[^}]*toLocaleString|₱['"`]?\s*\+[^;]*toLocaleString|toLocaleString\([^)]*\)\}\.00|PHP \{/.test(line);
      if (money) offenders.push(`${path.relative(root, f)}:${i + 1}`);
    });
  });
  assert.deepEqual(offenders, []);
});

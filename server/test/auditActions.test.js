// Run with: npm test (inside server/). The Action filter of the audit log is a list of plain words (src/constants/auditActions.js). Every action the server can
// write must be on that list, so a new action cannot be left out of the filter, and each code on the list must be one the filter accepts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const serverDir = path.join(__dirname, '..');
const filesIn = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name);
  return e.isDirectory() ? filesIn(full) : (/\.js$/.test(e.name) ? [full] : []);
});

// the codes written by recordAudit calls (action: 'a.b') and by the audited1('a.b', ...) route wrappers, and the codes in the lists of auditSpecs
function writtenActions() {
  const found = new Set();
  const files = ['routes', 'utils', 'jobs'].flatMap((d) => filesIn(path.join(serverDir, d)));
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:action:\s*|audited1\(\s*)'([a-z_]+(?:\.[a-z_]+)+)'/g)) found.add(m[1]);
  }
  return found;
}

test('every audit action the server writes is in the Action filter list', async () => {
  const { AUDIT_ACTION_CODES } = await import(pathToFileURL(path.join(serverDir, '..', 'src', 'constants', 'auditActions.js')).href);
  const missing = [...writtenActions()].filter((code) => !AUDIT_ACTION_CODES.includes(code));
  assert.deepEqual(missing, [], `add these to src/constants/auditActions.js: ${missing.join(', ')}`);
});

test('the list has no duplicates and every code is one the audit log route accepts', async () => {
  const { AUDIT_ACTION_CODES } = await import(pathToFileURL(path.join(serverDir, '..', 'src', 'constants', 'auditActions.js')).href);
  assert.equal(new Set(AUDIT_ACTION_CODES).size, AUDIT_ACTION_CODES.length);
  const { readFilter } = require('../routes/auditRoutes');
  AUDIT_ACTION_CODES.forEach((code) => assert.equal(readFilter({ action: code }).filter.action, code, code));
});

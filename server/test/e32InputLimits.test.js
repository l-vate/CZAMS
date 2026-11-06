// Run with: npm test (inside server/). Text boxes stop at the same number the server refuses at (constants/inputLimits.json). The first name
// limit is for new and changed names only: a longer name saved earlier is never refused or cut.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const limits = require('../constants/inputLimits.json');
const { lengthProblem } = require('../utils/inputLimits');
const { validateRegistration, validateProfileUpdate } = require('../utils/accountInput');

const root = path.join(__dirname, '..', '..');
const GOOD = { lastName: 'Cruz', email: 'a@b.co', phone: '09171234567', password: 'Str0ng!Passw0rd#1' };
const twenty = 'A'.repeat(20);

test('the first name limit is 20 for a new account', () => {
  assert.equal(limits.firstName, 20);
  assert.equal(validateRegistration({ ...GOOD, firstName: twenty }), null);
  const problem = validateRegistration({ ...GOOD, firstName: `${twenty}B` });
  assert.equal(problem.status, 400);
  assert.match(problem.message, /First name must be 20 characters or fewer/);
});

test('an edit keeps a longer first name that was saved earlier, but refuses a longer new one', () => {
  const old = 'Maria Cristina Magdalena Reyes'; // 30 characters, saved before the limit
  assert.equal(validateProfileUpdate({ ...GOOD, firstName: old, currentFirstName: old }), null);
  assert.match(validateProfileUpdate({ ...GOOD, firstName: `${old}x`, currentFirstName: old }).message, /20 characters/);
  assert.match(validateProfileUpdate({ ...GOOD, firstName: old, currentFirstName: 'Maria' }).message, /20 characters/);
});

test('a text over its limit is refused with a clear sentence, a text at the limit is not', () => {
  assert.equal(lengthProblem('x'.repeat(limits.address), 'address', 'The address'), null);
  assert.match(lengthProblem('x'.repeat(limits.address + 1), 'address', 'The address').message, /The address must be 300 characters or fewer/);
  assert.equal(lengthProblem(undefined, 'address', 'The address'), null);
});

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith('.jsx') ? [p] : [];
  });
}

test('every box that takes its limit from the shared file names a limit that exists', () => {
  const used = new Set();
  walk(path.join(root, 'src')).forEach((f) => {
    const text = fs.readFileSync(f, 'utf8');
    if (!text.includes('constants/inputLimits')) return; // another file's own LIMITS table
    for (const m of text.matchAll(/LIMITS\.(\w+)/g)) used.add(m[1]);
  });
  assert.ok(used.size > 15);
  used.forEach((key) => assert.ok(Number.isInteger(limits[key]), `${key} is not in inputLimits.json`));
});

test('the registration and profile first name boxes use the first name limit', () => {
  const register = fs.readFileSync(path.join(root, 'src', 'pages', 'public', 'register_page.jsx'), 'utf8');
  const profile = fs.readFileSync(path.join(root, 'src', 'pages', 'customer', 'profile.jsx'), 'utf8');
  assert.match(register, /name="firstName"\s+maxLength=\{LIMITS\.firstName\}/);
  assert.match(profile, /<input maxLength=\{LIMITS\.firstName\}/);
});

test('the long notes boxes show how many characters are left', () => {
  ['pages/customer/book_service.jsx', 'components/back_job_modal.jsx'].forEach((f) => {
    assert.match(fs.readFileSync(path.join(root, 'src', f), 'utf8'), /<CharsLeft /);
  });
});

test('the unit step needs the horsepower (or Not sure) before Next', () => {
  const src = fs.readFileSync(path.join(root, 'src', 'pages', 'customer', 'book_service.jsx'), 'utf8');
  assert.match(src, /Choose the horsepower \(HP\) of every unit, or Not sure/);
  assert.match(src, /value: HP_NOT_SURE/);
});

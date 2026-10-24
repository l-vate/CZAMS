// Run with: npm test (inside server/). Nothing that looks like a real secret may be committed: a MongoDB connection string with a real
// looking password, a JWT secret (or another secret, password, token or key) set to a real looking value, a private key, or an API key.
// Placeholders such as <password> are fine. A real .env file may not be tracked at all. When this fails it names the file, the line and
// the kind of finding, and never the value, so a failing run does not leak the secret into a log.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { findSecrets } = require('./helpers/secretScan');

const ROOT = path.join(__dirname, '..', '..');
const tracked = () => execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 1 << 28 }).toString().split('\0').filter(Boolean);
const BINARY = /\.(png|jpe?g|gif|webp|pdf|ico|woff2?|ttf|zip|mp4|mp3)$/i;

test('no tracked file holds a real looking secret (the report names the file and line, never the value)', () => {
  const problems = [];
  for (const file of tracked()) {
    if (BINARY.test(file) || /(^|\/)package-lock\.json$/.test(file)) continue;
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    const buffer = fs.readFileSync(full);
    if (buffer.subarray(0, 8000).includes(0)) continue;
    findSecrets(buffer.toString('utf8')).forEach((f) => problems.push(`${file}:${f.line} ${f.kind}`));
  }
  assert.equal(problems.length, 0, `Remove these and rotate the credential (do not just delete the line):\n${problems.join('\n')}`);
});

test('a real .env, a key file or a credentials file is never tracked; only the .env.example files are', () => {
  const bad = tracked().filter((f) => {
    const name = f.split('/').pop();
    if (/^\.env(\..+)?$/.test(name)) return name !== '.env.example';
    return /\.(pem|key|p12|pfx)$/i.test(name) || /credentials.*\.json$/i.test(name);
  });
  assert.equal(bad.length, 0, `Tracked secret files: ${bad.join(', ')}`);
});

test('the .env.example files hold placeholders only', () => {
  ['.env.example', 'server/.env.example'].forEach((file) => {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.deepEqual(findSecrets(text), [], `${file} must hold placeholders only`);
  });
  const server = fs.readFileSync(path.join(ROOT, 'server', '.env.example'), 'utf8');
  assert.match(server, /^MONGO_URI=mongodb\+srv:\/\/<user>:<password>@<cluster-host>\/<database>/m);
  assert.match(server, /^JWT_SECRET=<at-least-32-random-characters>\s*$/m);
  assert.match(server, /^SMTP_PASS=<[^>]+>\s*$/m);
});

test('the guard itself recognises the secrets it is there for, and leaves placeholders alone', () => {
  const realLooking = 'Zk3dQ9vLm2XpR7tW';
  const uri = ['mongodb+srv://', 'appuser:', realLooking, '@cluster0.abcde.mongodb.net/CZAMS'].join('');
  assert.equal(findSecrets(`MONGO_URI=${uri}`).length, 1);
  assert.equal(findSecrets('MONGO_URI=mongodb+srv://<user>:<password>@<cluster-host>/<database>?retryWrites=true&w=majority').length, 0);
  assert.equal(findSecrets('MONGO_URI=mongodb://localhost:27017/czams').length, 0);
  assert.equal(findSecrets(`JWT_SECRET=${realLooking}${realLooking}`).length, 1);
  assert.equal(findSecrets(`const JWT_SECRET = '${realLooking}${realLooking}';`).length, 1);
  assert.equal(findSecrets(`  SMTP_PASS: "${realLooking}"`).length, 1);
  assert.equal(findSecrets('JWT_SECRET=<at-least-32-random-characters>').length, 0);
  assert.equal(findSecrets('JWT_SECRET=process.env.JWT_SECRET').length, 0);
  assert.equal(findSecrets("const SECRET = 'a-test-secret-not-a-real-one';").length, 0, 'a test value is not a secret');
  assert.equal(findSecrets("const NOTICE_KEY = 'sessionNotice';").length, 0, 'the name of a storage key is not a secret');
  assert.equal(findSecrets('SMTP_PASS=<brevo-smtp-key>').length, 0);
  assert.equal(findSecrets(['-----BEGIN RSA ', 'PRIVATE KEY-----'].join('')).length, 1);
  assert.equal(findSecrets(['xkeysib-', 'a1b2c3d4e5f6a7b8c9d0e1f2'].join('')).length, 1);
});

test('a finding is reported without its value', () => {
  const realLooking = 'Zk3dQ9vLm2XpR7tW';
  const found = findSecrets(`\nJWT_SECRET=${realLooking}${realLooking}`);
  assert.deepEqual(found, [{ line: 2, key: 'JWT_SECRET', kind: 'JWT_SECRET set to a real looking value' }]);
  assert.equal(JSON.stringify(found).includes(realLooking), false);
});

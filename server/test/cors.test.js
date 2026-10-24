// Run with: npm test (inside server/). Which origins may call the API from a browser. No database.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { buildCors, isOriginAllowed, parseOrigins, patternToRegex } = require('../config/cors');

test('CORS_ORIGINS is split on commas, trimmed, and trailing slashes are dropped', () => {
  assert.deepEqual(parseOrigins(' https://a.example , https://b.example/ ,, '), ['https://a.example', 'https://b.example']);
  assert.deepEqual(parseOrigins(''), []);
  assert.deepEqual(parseOrigins(undefined), []);
});

test('an exact origin in the list is allowed, and only that exact origin', () => {
  const opts = { origins: ['https://czams.vercel.app'], production: true };
  assert.equal(isOriginAllowed('https://czams.vercel.app', opts), true);
  assert.equal(isOriginAllowed('https://CZAMS.vercel.app', opts), true); // host names are not case sensitive
  assert.equal(isOriginAllowed('http://czams.vercel.app', opts), false); // other scheme
  assert.equal(isOriginAllowed('https://czams.vercel.app:8443', opts), false); // other port
  assert.equal(isOriginAllowed('https://other.vercel.app', opts), false);
  assert.equal(isOriginAllowed('https://czams.vercel.app.evil.com', opts), false);
  assert.equal(isOriginAllowed('https://evil.com/https://czams.vercel.app', opts), false);
  assert.equal(isOriginAllowed('https://czams.vercel.app@evil.com', opts), false);
  assert.equal(isOriginAllowed('null', opts), false);
});

// The Vercel preview pattern, with made-up names.
const PREVIEW = { origins: ['https://myapp.vercel.app', 'https://myapp-*-myteam.vercel.app'], production: true };

test('a Vercel preview origin matches the wildcard entry', () => {
  assert.equal(isOriginAllowed('https://myapp-git-fix-batch-e2-myteam.vercel.app', PREVIEW), true); // branch preview
  assert.equal(isOriginAllowed('https://myapp-k3j9x2abc-myteam.vercel.app', PREVIEW), true); // deployment preview
  assert.equal(isOriginAllowed('https://myapp.vercel.app', PREVIEW), true); // production
});

test('look-alikes of the preview pattern do not match', () => {
  [
    'https://myapp-x-otherteam.vercel.app',
    'https://myapp-x-myteam.vercel.app.evil.com',
    'https://evil.com/myapp-x-myteam.vercel.app',
    'https://myapp-x-myteam.vercel.app@evil.com',
    'https://myapp--myteam.vercel.app', // nothing where the * is
    'https://myapp-a.b-myteam.vercel.app', // a dot is not part of *
    'http://myapp-x-myteam.vercel.app', // wrong scheme
    'https://xmyapp-x-myteam.vercel.app',
    'https://myapp-x-myteam.vercel.app:444',
  ].forEach((origin) => assert.equal(isOriginAllowed(origin, PREVIEW), false, origin));
});

test('a * never matches a dot or a slash, and regex characters in an entry are taken literally', () => {
  assert.equal(patternToRegex('https://a-*.example.com').test('https://a-b.example.com'), true);
  assert.equal(patternToRegex('https://a-*.example.com').test('https://a-b.c.example.com'), false);
  assert.equal(patternToRegex('https://a.example.com').test('https://aXexample.com'), false);
});

test('localhost origins work while not in production, and only then', () => {
  const dev = { origins: [], production: false };
  const prod = { origins: [], production: true };
  ['http://localhost:5173', 'http://localhost', 'http://127.0.0.1:3000'].forEach((o) => {
    assert.equal(isOriginAllowed(o, dev), true, o);
    assert.equal(isOriginAllowed(o, prod), false, o);
  });
  assert.equal(isOriginAllowed('https://localhost:5173', dev), false); // only plain http
  assert.equal(isOriginAllowed('http://localhost.evil.com', dev), false);
  assert.equal(isOriginAllowed('http://evil.com', dev), false);
});

test('a request with no Origin header is not a cross-origin browser request and is not blocked', () => {
  assert.equal(isOriginAllowed(undefined, { origins: [], production: true }), true);
});

test('production with CORS_ORIGINS missing warns exactly once and allows no other origin', () => {
  const warnings = [];
  const middleware = buildCors({ env: { NODE_ENV: 'production' }, warn: (m) => warnings.push(m) });
  assert.equal(typeof middleware, 'function');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /CORS_ORIGINS is not set in production/);
  assert.equal(warnings[0].includes('mongodb'), false);
});

test('a warning is not logged when it is set, or in development', () => {
  const warnings = [];
  buildCors({ env: { NODE_ENV: 'production', CORS_ORIGINS: 'https://myapp.vercel.app' }, warn: (m) => warnings.push(m) });
  buildCors({ env: { NODE_ENV: 'development' }, warn: (m) => warnings.push(m) });
  assert.deepEqual(warnings, []);
});

// ---- the real middleware answering real requests
async function withApp(env, run) {
  const app = express();
  app.use(buildCors({ env, warn: () => {} }));
  app.get('/ping', (req, res) => res.json({ ok: true }));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}
const allowOrigin = async (base, origin) => (await fetch(`${base}/ping`, { headers: { Origin: origin } })).headers.get('access-control-allow-origin');

test('listed origins get the CORS header, other origins do not', async () => {
  await withApp({ NODE_ENV: 'production', CORS_ORIGINS: 'https://myapp.vercel.app,https://myapp-*-myteam.vercel.app' }, async (base) => {
    assert.equal(await allowOrigin(base, 'https://myapp.vercel.app'), 'https://myapp.vercel.app');
    assert.equal(await allowOrigin(base, 'https://myapp-git-fix-x-myteam.vercel.app'), 'https://myapp-git-fix-x-myteam.vercel.app');
    assert.equal(await allowOrigin(base, 'https://evil.com'), null);
    assert.equal(await allowOrigin(base, 'http://localhost:5173'), null, 'localhost is closed in production');
  });
});

test('in production with no CORS_ORIGINS no origin gets the header (fail closed)', async () => {
  await withApp({ NODE_ENV: 'production' }, async (base) => {
    assert.equal(await allowOrigin(base, 'https://myapp.vercel.app'), null);
    assert.equal(await allowOrigin(base, 'http://localhost:5173'), null);
  });
});

test('in development localhost works with no setting', async () => {
  await withApp({ NODE_ENV: 'development' }, async (base) => {
    assert.equal(await allowOrigin(base, 'http://localhost:5173'), 'http://localhost:5173');
    assert.equal(await allowOrigin(base, 'https://evil.com'), null);
  });
});

test('a preflight request from an allowed origin is answered, from another origin it is not', async () => {
  await withApp({ NODE_ENV: 'production', CORS_ORIGINS: 'https://myapp.vercel.app' }, async (base) => {
    const preflight = (origin) => fetch(`${base}/ping`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
    const ok = await preflight('https://myapp.vercel.app');
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://myapp.vercel.app');
    assert.match(ok.headers.get('access-control-allow-headers') || '', /authorization/i);
    const no = await preflight('https://evil.com');
    assert.equal(no.headers.get('access-control-allow-origin'), null);
  });
});

// ---- E15-2: production refuses to start without a usable CORS_ORIGINS, and only the methods and headers the app uses are allowed
const { checkEnvironment } = require('../config/envCheck');
const GOOD_PROD = { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), MONGO_URI: 'present', CORS_ORIGINS: 'https://myapp.vercel.app' };

test('production without CORS_ORIGINS does not start, and the message names the variable only', () => {
  assert.deepEqual(checkEnvironment(GOOD_PROD).errors, []);
  const missing = checkEnvironment({ ...GOOD_PROD, CORS_ORIGINS: undefined }).errors;
  assert.equal(missing.length, 1);
  assert.match(missing[0], /CORS_ORIGINS is missing/);
  assert.equal(checkEnvironment({ ...GOOD_PROD, CORS_ORIGINS: '  , ,' }).errors.length, 1, 'blank entries are as good as nothing');
});

test('production refuses a wildcard origin, a bare host and an http origin, without printing them', () => {
  ['*', 'https://*', 'myapp.vercel.app', 'http://myapp.vercel.app', 'https://good.example,*'].forEach((value) => {
    const errors = checkEnvironment({ ...GOOD_PROD, CORS_ORIGINS: value }).errors;
    assert.equal(errors.length, 1, `${value} should be refused`);
    assert.match(errors[0], /CORS_ORIGINS/);
    assert.equal(errors[0].includes('myapp.vercel.app') || errors[0].includes('good.example'), false, 'the message does not repeat a value');
  });
  assert.deepEqual(checkEnvironment({ ...GOOD_PROD, CORS_ORIGINS: 'https://myapp.vercel.app,https://myapp-*-myteam.vercel.app' }).errors, [], 'the Vercel preview pattern is fine');
});

test('development does not need CORS_ORIGINS', () => {
  assert.deepEqual(checkEnvironment({ NODE_ENV: 'development', JWT_SECRET: 'x'.repeat(40) }).errors, []);
});

test('a preflight answer lists only the methods and headers the app uses, and never reflects an unlisted origin or a wildcard', async () => {
  await withApp({ NODE_ENV: 'production', CORS_ORIGINS: 'https://myapp.vercel.app' }, async (base) => {
    const res = await fetch(`${base}/ping`, { method: 'OPTIONS', headers: { Origin: 'https://myapp.vercel.app', 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://myapp.vercel.app');
    assert.equal(res.headers.get('access-control-allow-methods'), 'GET,POST,PUT,PATCH,DELETE');
    assert.equal(res.headers.get('access-control-allow-headers'), 'Authorization,Content-Type');
    assert.equal(res.headers.get('access-control-allow-credentials'), null, 'no cookies are involved, so no credentials');
    for (const origin of ['https://evil.com', 'null', 'https://myapp.vercel.app.evil.com']) {
      const refused = await fetch(`${base}/ping`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } });
      assert.equal(refused.headers.get('access-control-allow-origin'), null, `${origin} must not be answered`);
    }
  });
});

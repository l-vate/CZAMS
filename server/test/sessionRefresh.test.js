// Run with: npm test (inside server/). The logic that keeps the user saved in the browser in step with the
// server: pure functions, and the refresher with its browser parts (storage, fetch, navigation, clock) replaced
// by stand-ins. No browser and no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const src = (...p) => pathToFileURL(path.join(__dirname, '..', '..', 'src', ...p)).href;
const loadSession = () => import(src('utils', 'session.js'));
const loadRefresh = () => import(src('utils', 'sessionRefresh.js'));

// a tiny localStorage / sessionStorage
const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k), _data: data };
};

test.beforeEach(() => {
  global.localStorage = memoryStorage();
  global.sessionStorage = memoryStorage();
});
test.afterEach(() => {
  delete global.localStorage;
  delete global.sessionStorage;
});

const login = (user) => {
  global.localStorage.setItem('token', 'tok');
  global.localStorage.setItem('user', JSON.stringify(user));
};
const saved = () => JSON.parse(global.localStorage.getItem('user'));

// ---- pure: what a fresh /me answer does to the saved user
test('the saved user is updated from the fresh answer; fields the server did not send are kept', async () => {
  const { applyFreshUser } = await loadSession();
  const before = { id: 'CUS1', name: 'Old Name', email: 'a@b.c', role: 'customer', extra: 'keep me' };
  const r = applyFreshUser(before, { _id: 'CUS1', name: 'New Name', email: 'a@b.c', role: 'customer', phone: '0917' });
  assert.deepEqual(r.user, { id: 'CUS1', name: 'New Name', email: 'a@b.c', role: 'customer', extra: 'keep me', phone: '0917' });
  assert.equal(r.roleChanged, false);
  assert.equal(r.redirectTo, null);
});

test('a changed role is reported with the new role\'s home page, for every pair of roles', async () => {
  const { applyFreshUser } = await loadSession();
  const homes = { admin: '/admin/dashboard', staff: '/staff/dashboard', customer: '/customer/dashboard' };
  ['admin', 'staff', 'customer'].forEach((from) => {
    ['admin', 'staff', 'customer'].filter((to) => to !== from).forEach((to) => {
      const r = applyFreshUser({ id: 'X', role: from }, { _id: 'X', role: to });
      assert.equal(r.roleChanged, true, `${from} to ${to}`);
      assert.equal(r.redirectTo, homes[to]);
      assert.equal(r.user.role, to);
    });
  });
});

test('an answer with no role (an error body, an empty reply) changes nothing', async () => {
  const { applyFreshUser } = await loadSession();
  const before = { id: 'X', role: 'staff' };
  [null, undefined, {}, { message: 'Forbidden' }, 'text'].forEach((bad) => {
    const r = applyFreshUser(before, bad);
    assert.deepEqual(r.user, before);
    assert.equal(r.roleChanged, false);
  });
});

test('after a refresh the route guard uses the new role', async () => {
  const { applyFreshUser, redirectFor } = await loadSession();
  const before = { id: 'X', role: 'admin' };
  assert.equal(redirectFor({ token: 't', user: before }, 'admin'), null);
  const after = applyFreshUser(before, { _id: 'X', role: 'customer' }).user;
  assert.equal(redirectFor({ token: 't', user: after }, 'admin'), '/customer/dashboard');
  assert.equal(redirectFor({ token: 't', user: after }, 'customer'), null);
});

test('only a 403 that is not the deactivated message asks for a refresh, at most every 10 seconds', async () => {
  const { shouldRefreshAfterFailure } = await loadSession();
  assert.equal(shouldRefreshAfterFailure({ status: 403, message: 'Forbidden' }), true);
  assert.equal(shouldRefreshAfterFailure({ status: 403, message: 'This account has been deactivated. Please contact the administrator.' }), false);
  [200, 400, 401, 404, 409, 429, 500].forEach((status) => assert.equal(shouldRefreshAfterFailure({ status, message: 'x' }), false, String(status)));
  assert.equal(shouldRefreshAfterFailure({ status: 403, message: 'Forbidden', lastRefreshAt: 100000, now: 105000 }), false);
  assert.equal(shouldRefreshAfterFailure({ status: 403, message: 'Forbidden', lastRefreshAt: 100000, now: 110000 }), true);
});

// ---- the refresher
function setup(respond) {
  const calls = [];
  const moves = [];
  let clock = 1_000_000;
  const fetchFn = async (url, init) => {
    calls.push({ url, auth: init?.headers?.Authorization });
    return respond(url);
  };
  return { calls, moves, advance: (ms) => { clock += ms; }, deps: { storage: global.localStorage, fetchFn, apiBase: 'https://api.example', assign: (p) => moves.push(p), now: () => clock } };
}
const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('a changed role: the saved user and role are updated and the app moves to the new role\'s pages', async () => {
  const { createSessionRefresher } = await loadRefresh();
  login({ id: 'STF1', name: 'Tech', role: 'customer' });
  const { calls, moves, deps } = setup(() => reply(200, { _id: 'STF1', name: 'Tech', role: 'staff', email: 't@x.com' }));
  const user = await createSessionRefresher(deps)();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.example/api/users/me');
  assert.equal(calls[0].auth, 'Bearer tok');
  assert.equal(saved().role, 'staff');
  assert.equal(user.role, 'staff');
  assert.deepEqual(moves, ['/staff/dashboard']);
});

test('the same role: the saved user is refreshed and nobody is moved', async () => {
  const { createSessionRefresher } = await loadRefresh();
  login({ id: 'STF1', name: 'Old', role: 'staff' });
  const { moves, deps } = setup(() => reply(200, { _id: 'STF1', name: 'Renamed', role: 'staff' }));
  await createSessionRefresher(deps)();
  assert.equal(saved().name, 'Renamed');
  assert.deepEqual(moves, []);
});

test('an account that no longer exists (401) signs the person out with a message', async () => {
  const { createSessionRefresher } = await loadRefresh();
  login({ id: 'X', role: 'staff' });
  const { moves, deps } = setup(() => reply(401, { message: 'Account no longer exists' }));
  assert.equal(await createSessionRefresher(deps)(), null);
  assert.equal(global.localStorage.getItem('token'), null);
  assert.equal(global.localStorage.getItem('user'), null);
  assert.match(global.sessionStorage.getItem('sessionNotice'), /session has expired/);
  assert.deepEqual(moves, ['/login']);
});

test('a deactivated account (403) signs the person out with the server\'s message', async () => {
  const { createSessionRefresher } = await loadRefresh();
  login({ id: 'X', role: 'staff' });
  const message = 'This account has been deactivated. Please contact the administrator.';
  const { moves, deps } = setup(() => reply(403, { message }));
  await createSessionRefresher(deps)();
  assert.equal(global.localStorage.getItem('token'), null);
  assert.equal(global.sessionStorage.getItem('sessionNotice'), message);
  assert.deepEqual(moves, ['/login']);
});

test('a server error or no connection keeps what is saved and never throws', async () => {
  const { createSessionRefresher } = await loadRefresh();
  login({ id: 'X', role: 'staff', name: 'Keep' });
  const failing = setup(() => reply(500, { message: 'Server error' }));
  assert.equal(await createSessionRefresher(failing.deps)(), null);
  const offline = setup(() => { throw new Error('network down'); });
  assert.equal(await createSessionRefresher(offline.deps)(), null);
  assert.equal(saved().name, 'Keep');
  assert.equal(global.localStorage.getItem('token'), 'tok');
  assert.deepEqual([...failing.moves, ...offline.moves], []);
});

test('with no saved login nothing is asked', async () => {
  const { createSessionRefresher } = await loadRefresh();
  const { calls, deps } = setup(() => reply(200, {}));
  assert.equal(await createSessionRefresher(deps)(), null);
  assert.equal(calls.length, 0);
});

test('it asks at most once every 10 seconds, unless forced, and two calls at once make one request', async () => {
  const { createSessionRefresher } = await loadRefresh();
  login({ id: 'X', role: 'staff' });
  const { calls, advance, deps } = setup(() => reply(200, { _id: 'X', role: 'staff' }));
  const refresh = createSessionRefresher(deps);
  await Promise.all([refresh(), refresh(), refresh()]);
  assert.equal(calls.length, 1, 'three calls at the same moment make one request');
  await refresh();
  assert.equal(calls.length, 1, 'too soon after the last one');
  advance(9000);
  await refresh();
  assert.equal(calls.length, 1);
  advance(1500);
  await refresh();
  assert.equal(calls.length, 2, 'after 10 seconds it asks again');
  await refresh({ force: true });
  assert.equal(calls.length, 3, 'force skips the wait (used when the app starts)');
});

test('the role in the browser changes again after a second role change', async () => {
  const { createSessionRefresher } = await loadRefresh();
  login({ id: 'X', role: 'admin' });
  let role = 'customer';
  const { moves, advance, deps } = setup(() => reply(200, { _id: 'X', role }));
  const refresh = createSessionRefresher(deps);
  await refresh();
  assert.equal(saved().role, 'customer');
  role = 'staff';
  advance(20000);
  await refresh();
  assert.equal(saved().role, 'staff');
  assert.deepEqual(moves, ['/customer/dashboard', '/staff/dashboard']);
});

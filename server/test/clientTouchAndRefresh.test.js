// Run with: npm test (inside server/). Checks that need no browser: the signature pad registers its touch handlers
// as non-passive native listeners (React's own touch props are passive, so preventDefault in them only logs a
// warning and the page scrolls while signing), and the technician calendar refreshes itself every 2 minutes and
// when the tab is shown again. Whether it feels right on a phone still needs a real device.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const src = (...p) => path.join(__dirname, '..', '..', 'src', ...p);
const read = (...p) => fs.readFileSync(src(...p), 'utf8');

test('the signature pad has no React touch props and adds non-passive native touch listeners', () => {
  const pad = read('components', 'signature_pad.jsx');
  assert.doesNotMatch(pad, /onTouch(Start|Move|End)=/, 'React touch props are passive');
  ['touchstart', 'touchmove'].forEach((name) => {
    assert.ok(pad.includes(`canvas.addEventListener('${name}', `) && pad.includes(`'${name}', ${name === 'touchstart' ? 'startDraw' : 'draw'}, options)`), name);
    assert.ok(pad.includes(`canvas.removeEventListener('${name}', `), `${name} is removed on unmount`);
  });
  assert.match(pad, /const options = \{ passive: false \}/);
  assert.match(pad, /touchcancel/, 'a cancelled touch ends the stroke');
});

test('the signature canvas keeps touch-action: none', () => {
  const css = read('css', 'staff.css');
  const block = css.slice(css.indexOf('.signature-pad-canvas'));
  assert.match(block.slice(0, block.indexOf('}')), /touch-action:\s*none/);
});

test('the refresh interval is 2 minutes', async () => {
  const { REFRESH_EVERY_MS } = await import(pathToFileURL(src('hooks', 'useRefreshOnFocus.js')).href);
  assert.equal(REFRESH_EVERY_MS, 120000);
});

test('the hook refreshes on the timer, on tab visibility and on window focus, and cleans up', () => {
  const hook = read('hooks', 'useRefreshOnFocus.js');
  assert.match(hook, /setInterval\(run, everyMs\)/);
  assert.match(hook, /addEventListener\('visibilitychange', run\)/);
  assert.match(hook, /addEventListener\('focus', run\)/);
  assert.match(hook, /clearInterval\(timer\)/);
  assert.match(hook, /removeEventListener\('visibilitychange', run\)/);
  assert.match(hook, /removeEventListener\('focus', run\)/);
  assert.match(hook, /visibilityState === 'visible'/, 'a hidden tab does not poll');
});

test('the technician calendar uses the hook and keeps what is on screen if a refresh fails', () => {
  const cal = read('pages', 'staff', 'calendar.jsx');
  assert.match(cal, /useRefreshOnFocus\(/);
  const refresh = cal.slice(cal.indexOf('useRefreshOnFocus('));
  assert.doesNotMatch(refresh.slice(0, refresh.indexOf('});')), /setFailed|setLoading/);
});

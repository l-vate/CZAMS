// Run with: npm test (inside server/). E31, the findings of the evaluator: the chat scroll, the password field and the login link, the profile
// address and buttons, View File, the duplicate reference warning and a second approval of a payment. The rules are read from the source files
// and the pure helpers are loaded through Vite; nothing here needs a database or the real clock.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startSsrServer } = require('./helpers/viteSsr');

let vite;
let closeVite;
before(async () => { ({ vite, close: closeVite } = await startSsrServer()); });
after(async () => { await closeVite(); });

const src = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', ...parts), 'utf8');

// ---- 1: the chat list

test('chat scroll: follows a new message only near the bottom or after the reader sent one; otherwise it offers the button', async () => {
  const { scrollDecision, isNearBottom } = await vite.ssrLoadModule('/src/utils/chatScroll.js');
  assert.equal(scrollDecision({ arrived: true, wasNearBottom: true, sentByMe: false }), 'bottom');
  assert.equal(scrollDecision({ arrived: true, wasNearBottom: false, sentByMe: false }), 'notify', 'scrolled up: the list does not move');
  assert.equal(scrollDecision({ arrived: true, wasNearBottom: false, sentByMe: true }), 'bottom', 'sending always goes down');
  assert.equal(scrollDecision({ arrived: false, wasNearBottom: true, sentByMe: false }), 'none', 'a refresh with nothing new does nothing');
  assert.equal(scrollDecision({ arrived: false, wasNearBottom: false, sentByMe: false }), 'none');
  assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 520, clientHeight: 400 }), true, '80 px from the end');
  assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 500, clientHeight: 400 }), false, '100 px from the end');
  assert.equal(isNearBottom(null), true);
});

test('chat scroll: the panel scrolls its own list (not the page), shows New messages, and the list can scroll at every width', () => {
  const panel = src('components', 'chat_panel.jsx');
  assert.doesNotMatch(panel, /scrollIntoView/, 'scrollIntoView on every refresh was what pulled the list down');
  assert.match(panel, /scrollDecision\(/);
  assert.match(panel, /New messages/);
  assert.match(panel, /onScroll=/);
  const css = src('index.css');
  assert.match(css, /\.chat-messages \{[^}]*min-height: 0;[^}]*overflow-y: auto;/);
  assert.match(css, /\.chat-new-messages \{/);
});

// ---- 2 and 3: the eye button and the Forgot password link

const ruleOf = (css, selector) => {
  const at = css.indexOf(`
${selector} {`);
  assert.notEqual(at, -1, `${selector} is styled`);
  return css.slice(at, css.indexOf('}', at));
};

test('password field: the eye button sits inside the border of the field, rounded to match, in one shared rule', () => {
  const css = src('css', 'auth.css');
  const rule = ruleOf(css, '.ap-toggle');
  assert.match(rule, /top: 1\.5px;/);
  assert.match(rule, /bottom: 1\.5px;/);
  assert.match(rule, /right: 1\.5px;/);
  assert.match(rule, /border-radius: 0 8\.5px 8\.5px 0;/, 'the corner of the field (10px) minus its border');
  assert.doesNotMatch(rule, /height: 44px|translateY/, 'no fixed 44 px height that outgrows a 38 px field');
  assert.match(css, /\.ap-card \.ap-toggle:focus-visible \{ outline-offset: -3px;/, 'the focus ring is drawn inside the button');
  assert.match(css, /\.ap-card--wide \.ap-input--password \{ padding-right: 42px; \}/, 'the typed text stops before the eye');
  assert.match(css, /\.ap-card--wide \.ap-toggle::after \{/, 'a 44 px target on a phone without a taller field');
  // every password field uses the one component
  ['login_page', 'register_page', 'reset_password_page'].forEach((page) => assert.match(src('pages', 'public', `${page}.jsx`), /PasswordField/));
  assert.match(src('components', 'auth_fields.jsx'), /className="ap-toggle"/);
});

test('login: the Forgot password link keeps a visible focus style drawn inside its own box, which stays inside the label row', () => {
  const css = src('css', 'auth.css');
  assert.match(css, /\.ap-card \.ap-link--tap:focus-visible \{ outline-offset: -3px;/);
  const rule = ruleOf(css, '.ap-link--tap');
  assert.match(rule, /min-height: 28px;/);
  assert.doesNotMatch(rule, /margin: -10px/, 'the old box reached 10 px past the row');
  assert.match(css, /\.ap-link--tap::after \{[^}]*top: -8px;[^}]*bottom: -8px;/, 'the 44 px target is invisible');
});

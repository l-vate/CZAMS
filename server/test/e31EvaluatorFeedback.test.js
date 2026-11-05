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

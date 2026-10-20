// Run with: npm test (inside server/). The public top bar: the menu state rules (only the button opens it; Escape, a chosen link, a route
// change, growing past the tablet width and a press outside all close it), and the bar rendered closed and open (the hamburger's name,
// aria-expanded and aria-controls, the icon, the four links, the search box and LOG IN inside the menu). The click, key and focus
// behaviour in a real browser is covered by the audit browser check. No database; the client files are loaded through Vite so JSX compiles.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { startSsrServer } = require('./helpers/viteSsr');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..', '..');
const fromRoot = createRequire(path.join(root, 'package.json'));

let vite;
let closeVite;
let nav;
let rules;
test.before(async () => {
  ({ vite, close: closeVite } = await startSsrServer());
  nav = await vite.ssrLoadModule('/src/components/public_navbar.jsx');
  rules = await vite.ssrLoadModule('/src/utils/navMenu.js');
});
test.after(async () => { await closeVite(); });

test('the menu opens only by the button and closes on every other event', () => {
  const { navMenuReducer } = rules;
  assert.equal(navMenuReducer(false, 'toggle'), true);
  assert.equal(navMenuReducer(true, 'toggle'), false);
  for (const event of ['escape', 'link', 'route', 'resize', 'outside']) {
    assert.equal(navMenuReducer(true, event), false, `${event} closes an open menu`);
    assert.equal(navMenuReducer(false, event), false, `${event} leaves a closed menu closed`);
  }
});

test('a press inside the bar or inside the search results popup is not outside the menu', () => {
  const { isOutsideMenu } = rules;
  const inBar = { closest: () => null };
  const bar = { contains: (t) => t === inBar };
  const plain = { closest: () => null };
  const popup = { closest: (sel) => (sel === '.nav-search-modal-overlay' ? {} : null) };
  assert.equal(isOutsideMenu(inBar, bar), false);
  assert.equal(isOutsideMenu(popup, bar), false);
  assert.equal(isOutsideMenu(plain, bar), true);
  assert.equal(isOutsideMenu(null, bar), true);
});

function render(props) {
  const React = fromRoot('react');
  const { renderToStaticMarkup } = fromRoot('react-dom/server');
  const { MemoryRouter } = fromRoot('react-router-dom');
  const search = React.createElement('div', { className: 'nav-search-wrapper' }, React.createElement('input', { type: 'search', className: 'search' }));
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(nav.default, { search, onLogin: () => {}, ...props })));
}

test('closed: a hamburger named Open menu, not expanded, controlling the menu that holds the links, search and LOG IN', () => {
  const html = render({});
  assert.match(html, /<button type="button" class="nav-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="public-nav-menu">/);
  assert.match(html, /id="public-nav-menu"/);
  assert.doesNotMatch(html, /nav-open/);
  for (const label of ['HOME', 'ABOUT US', 'SERVICES', 'AVAILABLE DATES']) assert.match(html, new RegExp(`>${label}</a>`));
  assert.match(html, /href="#home"/);
  assert.match(html, /href="#availability"/);
  assert.match(html, /type="search"/);
  assert.match(html, /<button type="button" class="login-btn">LOG IN<\/button>/);
  assert.match(html, /COOLING ZONE AIRCON MAINTENANCE SERVICES/);
});

test('open: the button says Close menu, is expanded, and the bar carries the open class', () => {
  const html = render({ initialOpen: true });
  assert.match(html, /<header class="navbar nav-open">/);
  assert.match(html, /aria-label="Close menu" aria-expanded="true" aria-controls="public-nav-menu"/);
  assert.doesNotMatch(html, /aria-label="Open menu"/);
  assert.notEqual(html, render({}), 'the open icon differs from the closed one');
  assert.equal([0x2013, 0x2014].some((c) => html.includes(String.fromCharCode(c))), false, 'no en or em dashes');
});

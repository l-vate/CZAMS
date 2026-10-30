// Run with: npm test (inside server/). E26C, behaviour on every screen: a new page starts at the top, anything that covers the page holds the page
// behind it still, toasts sit where they cover nothing, the payment window shows errors only after the person has acted, a bill whose proof is
// waiting never offers Pay Now, and Log Out is pinned in the phone menu. The pure rules are loaded through Vite with fake window and document
// objects; the rest is read from the source. No database, no real clock.
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

// ---- C1: scroll to the top

test('a new path starts at the top; a query change, a back or forward move and the same hash do not', async () => {
  const { routeScrollAction } = await vite.ssrLoadModule('/src/utils/scrollReset.js');
  const at = (pathname, hash = '') => ({ pathname, hash });
  assert.equal(routeScrollAction(at('/customer/billings'), at('/customer/bookings'), 'PUSH'), 'top');
  assert.equal(routeScrollAction(at('/customer/billings'), at('/customer/bookings'), 'REPLACE'), 'top');
  assert.equal(routeScrollAction(at('/customer/bookings'), at('/customer/bookings'), 'PUSH'), 'none', 'a filter change keeps the position');
  assert.equal(routeScrollAction(at('/customer/billings'), at('/customer/bookings'), 'POP'), 'none', 'Back and Forward stay with the browser');
  assert.equal(routeScrollAction(at('/'), at('/', '#units'), 'PUSH'), 'hash');
  assert.equal(routeScrollAction(at('/login'), at('/', '#units'), 'PUSH'), 'hash');
  assert.equal(routeScrollAction(at('/', '#units'), at('/', '#units'), 'PUSH'), 'none');
});

test('the reset scrolls the window and every inner scroller to the top, instantly', async () => {
  const { resetScroll } = await vite.ssrLoadModule('/src/utils/scrollReset.js');
  const calls = [];
  const inner = [{ scrollTop: 340 }, { scrollTop: 0 }];
  resetScroll({ scrollTo: (options) => calls.push(options) }, { querySelectorAll: () => inner });
  assert.deepEqual(calls, [{ top: 0, left: 0, behavior: 'instant' }]);
  assert.deepEqual(inner.map((el) => el.scrollTop), [0, 0]);
});

test('a hash link goes to its element, and says when there is none', async () => {
  const { scrollToHash } = await vite.ssrLoadModule('/src/utils/scrollReset.js');
  const seen = [];
  const doc = { getElementById: (id) => (id === 'units' ? { scrollIntoView: (o) => seen.push(o) } : null) };
  assert.equal(scrollToHash('#units', doc), true);
  assert.deepEqual(seen, [{ behavior: 'instant', block: 'start' }]);
  assert.equal(scrollToHash('#nothing', doc), false);
  assert.equal(scrollToHash('', doc), false);
});

test('ScrollToTop is mounted once, and the booking wizard scrolls and focuses the step heading', () => {
  const app = src('App.jsx');
  assert.equal((app.match(/<ScrollToTop \/>/g) || []).length, 1);
  assert.match(src('components', 'scroll_to_top.jsx'), /useNavigationType/);
  const wizard = src('pages', 'customer', 'book_service.jsx');
  assert.match(wizard, /\}, \[step\]\);/);
  assert.match(wizard, /scrollIntoView\(\{ behavior: 'instant', block: 'start' \}\)/);
  assert.match(wizard, /heading\.focus\(\{ preventScroll: true \}\)/);
});

// ---- C2a: the scroll lock

const fakePage = (scrollY = 480) => {
  const body = { style: { position: '', top: '', width: '', paddingRight: '' } };
  const classes = new Set();
  const scrolls = [];
  return {
    body, classes, scrolls,
    win: { scrollY, innerWidth: 1440, scrollTo: (o) => scrolls.push(o) },
    doc: { body, documentElement: { clientWidth: 1425, scrollTop: 0, classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) } } },
  };
};

test('the lock holds the page, keeps the scrollbar width, and gives back the exact position', async () => {
  const { createScrollLock } = await vite.ssrLoadModule('/src/utils/scrollLock.js');
  const page = fakePage(480);
  const lock = createScrollLock({ win: page.win, doc: page.doc });
  lock.lock();
  assert.equal(page.body.style.position, 'fixed');
  assert.equal(page.body.style.top, '-480px');
  assert.equal(page.body.style.paddingRight, '15px', 'no jump sideways when the scrollbar goes');
  assert.ok(page.classes.has('scroll-locked'));
  lock.unlock();
  assert.equal(page.body.style.position, '');
  assert.equal(page.body.style.top, '');
  assert.equal(page.body.style.paddingRight, '');
  assert.ok(!page.classes.has('scroll-locked'));
  assert.deepEqual(page.scrolls, [{ top: 480, left: 0, behavior: 'instant' }]);
});

test('stacked modals keep the lock until the last one closes, and an extra release changes nothing', async () => {
  const { createScrollLock } = await vite.ssrLoadModule('/src/utils/scrollLock.js');
  const page = fakePage(120);
  const lock = createScrollLock({ win: page.win, doc: page.doc });
  lock.lock();
  lock.lock();
  lock.unlock();
  assert.equal(page.body.style.position, 'fixed', 'one is still open');
  assert.equal(page.scrolls.length, 0);
  lock.unlock();
  assert.equal(page.body.style.position, '');
  assert.equal(page.scrolls.length, 1);
  lock.unlock();
  assert.equal(lock.count, 0);
  assert.equal(page.scrolls.length, 1);
});

test('Tab stays inside the modal, in both directions', async () => {
  const { trapTab } = await vite.ssrLoadModule('/src/utils/scrollLock.js');
  const control = () => ({ focused: false, getAttribute: () => null, focus() { this.focused = true; } });
  const first = control();
  const last = control();
  const modal = { querySelectorAll: () => [first, last], contains: (el) => el === first || el === last };
  const event = (shiftKey) => ({ shiftKey, prevented: false, preventDefault() { this.prevented = true; } });
  const forward = event(false);
  assert.equal(trapTab(forward, modal, { activeElement: last }), true);
  assert.ok(first.focused && forward.prevented, 'from the last control to the first');
  const backward = event(true);
  assert.equal(trapTab(backward, modal, { activeElement: first }), true);
  assert.ok(last.focused && backward.prevented, 'from the first control to the last');
  assert.equal(trapTab(event(false), modal, { activeElement: first }), false, 'in the middle nothing is changed');
});

test('the modal manager is mounted once, watches every kind of cover, and leaves Escape to each modal', () => {
  assert.equal((src('App.jsx').match(/<ModalManager \/>/g) || []).length, 1);
  const lock = src('utils', 'scrollLock.js');
  for (const selector of ['.modal-overlay', '.cbd-overlay', '.sdm-overlay', '.ann-modal-overlay', '.svc-modal-overlay', '[role="dialog"][aria-modal="true"]', '.dashboard-shell.sidebar-open', '.navbar.nav-open']) {
    assert.ok(lock.includes(selector), `${selector} is watched`);
  }
  const manager = src('components', 'modal_manager.jsx');
  assert.doesNotMatch(manager, /key === 'Escape'/);
  assert.match(manager, /opener\.focus/, 'the focus goes back to what opened it');
  assert.match(manager, /scroll\.unlock\(\)/);
});

// ---- C2b: toasts

test('a toast sits at the top, full width on a phone, closes after about 5 seconds and is in a live region', () => {
  const notice = src('components', 'notice.jsx');
  assert.match(notice, /AUTO_CLOSE_MS = 5000/);
  assert.match(notice, /role="status" aria-live="polite"/);
  assert.match(notice, /aria-label="Close message"/);
  const css = src('css', 'components', 'notice.css');
  assert.match(css, /\.notice-region \{[^}]*top: calc\(env\(safe-area-inset-top, 0px\) \+ 12px\)[^}]*left: 12px[^}]*right: 12px/s);
  assert.doesNotMatch(css, /bottom: 24px/);
  assert.match(css, /\.notice-toast-close \{[^}]*min-width: 44px[^}]*min-height: 44px/s);
});

// ---- C2c: the payment window and Pay Now

test('the payment window shows a field error only after the person left the field or pressed SUBMIT', () => {
  const modal = src('components', 'payment_modal.jsx');
  assert.match(modal, /const showProofError = submitted \|\| proofTouched;/);
  assert.match(modal, /const showReferenceError = submitted \|\| referenceTouched;/);
  assert.match(modal, /proofRequired && !proof && !fileError && showProofError/);
  assert.match(modal, /referenceNumber === '' && showReferenceError/);
  assert.match(modal, /if \(!canSubmit\) \{ setSubmitted\(true\); return; \}/);
  assert.match(modal, /disabled=\{preparing\}/, 'SUBMIT can be pressed, so the errors can show');
  assert.match(modal, /role="dialog" aria-modal="true"/);
});

test('a bill whose proof is waiting is not in Due now and has no Pay Now, but says it is waiting and offers View Details', () => {
  const billings = src('pages', 'customer', 'billings.jsx');
  assert.match(billings, /!bill\.awaitingConfirmation && !bill\.isToVerify && !bill\.isBalanceToVerify\)/);
  assert.match(billings, /const proofWaiting = \(bill\.isToVerify \|\| bill\.isBalanceToVerify\) && !bill\.isCancelled;/);
  assert.match(billings, /const canPay = \(payDown \|\| payBalance\) && !waitingForConfirmation && !proofWaiting;/);
  assert.match(billings, /billing-badge billing-badge--\$\{badgeKey\}/, 'the badge says Waiting for verification');
  assert.match(src('pages', 'customer', 'book_details.jsx'), /const balanceDue = !balanceProofWaiting && \(/);
});

// ---- C3: Log Out pinned in the phone menu

test('Log Out is outside the scrolling part of the drawer for every role, with an icon, and the drawer is as tall as the visible screen', () => {
  for (const role of ['customer', 'staff', 'admin']) {
    const sidebar = src('components', 'sidebars', `${role}_sidebar.jsx`);
    assert.match(sidebar, /<div className="sidebar-logout">\s*<button type="button" className="sidebar-link" onClick=\{handleLogout\}>\s*<FiLogOut aria-hidden="true" \/> Log Out/, role);
  }
  const css = src('css', 'components', 'sidebar.css');
  assert.match(css, /\.dashboard-shell \.sidebar \{[^}]*height: 100dvh[^}]*overflow: hidden/s);
  assert.match(css, /\.dashboard-shell \.sidebar > div:first-child \{[^}]*overflow-y: auto/s);
  assert.match(css, /\.sidebar-logout \{[^}]*flex: none[^}]*safe-area-inset-bottom[^}]*border-top[^}]*background: var\(--white\)/s);
  assert.match(css, /\.sidebar-logout \.sidebar-link \{ min-height: 44px; \}/);
});

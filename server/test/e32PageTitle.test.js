// Run with: npm test (inside server/). On a wide screen the admin pages whose heading repeats the top bar title do not show it twice. The
// heading stays in the page for screen readers and stays visible on a phone. Pages whose heading says something else are untouched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const adminPages = fs.readdirSync(path.join(root, 'src', 'pages', 'admin')).filter((f) => f.endsWith('.jsx') && f !== 'admin_layout.jsx');

function titleAndHeading(source) {
  const title = /<AdminLayout[^>]*?\btitle="([^"]+)"/s.exec(source)?.[1];
  const heading = /<h1 className="dashboard-welcome([^"]*)">([^<]+)<\/h1>/.exec(source);
  return { title, heading: heading?.[2], classes: heading?.[1] || '' };
}

test('a heading that repeats the top bar title is marked, any other heading is not', () => {
  let marked = 0;
  adminPages.forEach((page) => {
    const { title, heading, classes } = titleAndHeading(read(`pages/admin/${page}`));
    if (!title || !heading) return;
    const same = title.trim() === heading.trim();
    assert.equal(classes.includes('page-title-in-topbar'), same, `${page}: "${title}" / "${heading}"`);
    if (same) marked += 1;
  });
  assert.equal(marked, 11);
});

test('the dashboard, analytics and new booking headings say something different and stay', () => {
  [['dashboard.jsx', 'Welcome, Admin'], ['analytics.jsx', 'Analytics Dashboard'], ['walk_in_booking.jsx', 'Create a Walk-in Booking']].forEach(([page, heading]) => {
    const source = read(`pages/admin/${page}`);
    assert.match(source, new RegExp(`<h1 className="dashboard-welcome">${heading}</h1>`));
  });
});

test('the hidden heading is only for wide screens and is kept for screen readers', () => {
  const css = read('css/admin.css');
  const block = /@media \(min-width: 769px\) \{\s*\.page-title-in-topbar \{([^}]*)\}/.exec(css);
  assert.ok(block, 'the wide-screen rule is there');
  assert.match(block[1], /clip: rect\(0, 0, 0, 0\)/);
  assert.doesNotMatch(block[1], /display: none/);
  assert.equal(/\n\.page-title-in-topbar\s*\{/.test(css), false, 'no rule outside the wide-screen media query');
});

test('the customer and technician pages have no repeated heading', () => {
  ['customer/billings.jsx', 'customer/my_bookings.jsx', 'staff/my_jobs.jsx', 'staff/calendar.jsx'].forEach((page) => {
    assert.doesNotMatch(read(`pages/${page}`), /<h1 className="dashboard-welcome/);
  });
});

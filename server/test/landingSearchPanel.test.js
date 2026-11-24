const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'public', 'landing_page.jsx'), 'utf8');

test('the landing search panel is not reopened by focus, so closing it sticks', () => {
  // the modal manager returns focus to the search input when the panel closes; an onFocus opener reopened it at once
  assert.doesNotMatch(src, /onFocus=\{\(\) => setOpen\(true\)\}/);
  assert.match(src, /onChange=\{\(e\) => \{ setQuery\(e\.target\.value\); setOpen\(true\); \}\}/);
  assert.match(src, /onClick=\{\(\) => setOpen\(true\)\}/);
});

test('the X, Escape and a click outside all close the panel', () => {
  assert.match(src, /className="modal-close-btn" onClick=\{\(\) => setOpen\(false\)\}/);
  assert.match(src, /e\.key === 'Escape'\) setOpen\(false\)/);
  assert.match(src, /nav-search-modal-overlay" onClick=\{\(\) => setOpen\(false\)\}/);
});

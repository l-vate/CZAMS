// Run with: npm test (inside server/). The search box in the top bar of the admin and customer pages: nothing is filtered until 2 or more letters are typed (and only
// after a short pause), and closing the box or pressing Escape clears the search instead of leaving the list filtered. Both layouts use the same hook.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startSsrServer } = require('./helpers/viteSsr');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', ...p), 'utf8');

test('what the page filters by: nothing for one letter or spaces, the trimmed text from two letters on', async () => {
  const { vite, close } = await startSsrServer();
  const { appliedSearch, MIN_SEARCH_CHARS, SEARCH_DELAY_MS } = await vite.ssrLoadModule('/src/hooks/useTopbarSearch.js').finally(close);
  assert.equal(MIN_SEARCH_CHARS, 2);
  assert.ok(SEARCH_DELAY_MS >= 200 && SEARCH_DELAY_MS <= 500, 'a short pause, not an instant filter');
  assert.equal(appliedSearch(''), '');
  assert.equal(appliedSearch('a'), '', 'one letter does not filter');
  assert.equal(appliedSearch(' a '), '', 'spaces do not count');
  assert.equal(appliedSearch('ab'), 'ab');
  assert.equal(appliedSearch('  CZ-2026  '), 'CZ-2026');
  assert.equal(appliedSearch(undefined), '');
});

test('both layouts use the hook: the page gets only the applied text, and the X and Escape clear the search', () => {
  ['admin/admin_layout.jsx', 'customer/customer_layout.jsx'].forEach((file) => {
    const source = read('pages', ...file.split('/'));
    assert.match(source, /useTopbarSearch\(searchValue, onSearchChange\)/, file);
    assert.match(source, /value=\{search\.text\}/, file);
    assert.match(source, /onChange=\{\(e\) => search\.setText\(e\.target\.value\)\}/, file);
    assert.doesNotMatch(source, /onChange=\{\(e\) => onSearchChange\(e\.target\.value\)\}/, `${file} must not filter on every key`);
    assert.match(source, /const closeSearch = \(\) => \{\s*(\/\/[^\n]*\n\s*)?search\.clear\(\);/, `${file}: closing clears the search`);
    assert.match(source, /e\.key === 'Escape' && \(searchOpen \|\| search\.hasText\)/, `${file}: Escape works on a wide screen too`);
    assert.match(source, /topbar-search--has-text/, `${file}: the clear button shows when there is text`);
  });
  assert.match(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'css', 'admin.css'), 'utf8'), /\.topbar-search--has-text \.topbar-search-close \{\s*display: inline-flex/);
});

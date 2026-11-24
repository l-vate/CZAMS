const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'public', 'landing_page.jsx'), 'utf8');

test('the landing search panel is not reopened by focus, so closing it sticks', () => {
  // the modal manager returns focus to the search input when the panel closes; an onFocus opener reopened it at once
  assert.doesNotMatch(src, /onFocus=\{\(\) => setOpen\(true\)\}/);
});

test('the X, Escape and a click outside all close the panel', () => {
  assert.match(src, /className="modal-close-btn" onClick=\{\(\) => setOpen\(false\)\}/);
  assert.match(src, /e\.key === 'Escape'\) setOpen\(false\)/);
  assert.match(src, /nav-search-modal-overlay" onClick=\{\(\) => setOpen\(false\)\}/);
});

test('typing never opens the panel; Enter or the search button does, and the title shows the typed text', () => {
  assert.match(src, /onChange=\{\(e\) => setQuery\(e\.target\.value\)\}/);
  assert.doesNotMatch(src, /setQuery\(e\.target\.value\); setOpen\(true\)/);
  assert.match(src, /e\.key === 'Enter'\) \{ e\.preventDefault\(\); openSearch\(\); \}/);
  assert.match(src, /<button type="button" className="nav-search-icon" aria-label="Search" onClick=\{openSearch\}>/);
  assert.match(src, /const openSearch = \(\) => \{ if \(query\.trim\(\)\) setOpen\(true\); \};/);
  assert.match(src, /`Results for "\$\{query\.trim\(\)\}"`/);
});

// the matching itself, run for real: the two small functions are cut out of the page source
const grab = (name) => src.slice(src.indexOf(`
function ${name}`)).split(/\r?\n}\r?\n/)[0] + '\n}';
const { searchTerms, matchesAllTerms } = new Function(`${grab('searchTerms')}\n${grab('matchesAllTerms')}\nreturn { searchTerms, matchesAllTerms };`.replace(/export /g, ''))();

test('every word of the query must match: "technician one" finds Technician One, "clean" finds Cleaning', () => {
  const find = (q, names) => names.filter((n) => matchesAllTerms(searchTerms(q), n));
  const techs = ['Technician One', 'Technician Two', 'Technician  Four', 'Technician Three'];
  assert.deepEqual(find('technician one', techs), ['Technician One']);
  assert.deepEqual(find('  TECHNICIAN   One ', techs), ['Technician One']);
  assert.deepEqual(find('one technician', techs), ['Technician One']);
  assert.deepEqual(find('technician four', techs), ['Technician  Four']);
  assert.deepEqual(find('technician three', techs), ['Technician Three']);
  assert.equal(find('technician', techs).length, 4);
  assert.deepEqual(find('technician five', techs), []);
  assert.equal(matchesAllTerms(searchTerms('clean'), 'Aircon Cleaning', 'Cleaning'), true);
  assert.equal(matchesAllTerms(searchTerms('clean split'), 'Aircon Cleaning', 'Cleaning', 'Deep clean of a split type'), true);
  assert.equal(matchesAllTerms(searchTerms('   '), 'anything'), false);
});

test('a technician result lists only the name and the company-wide rating, no individual profile', () => {
  assert.match(src, /Individual ratings are not published/);
  assert.match(src, /key=\{t\._id \|\| t\.name\}>\{t\.name\}<\/span>/);
});

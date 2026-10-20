// Run with: npm test (inside server/). The public landing page: its words live in one file (src/config/landingContent.js), the facts in it
// are the true ones, the warranty numbers come from the one shared file the server also reads, and the page has no invented claims.
// Files are read as text; nothing connects to a database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const content = read('src', 'config', 'landingContent.js');
// the words the page shows, without the comment lines that explain the rules
const copy = content.split(String.fromCharCode(10)).filter((line) => !line.trim().startsWith('//')).join(' ');
const warranty = require('../constants/warrantyWindows.json');

test('the warranty windows are one shared file: the server and the landing page read the same numbers', () => {
  const { WARRANTY_WINDOWS } = require('../utils/warranty');
  assert.deepEqual(JSON.parse(JSON.stringify(WARRANTY_WINDOWS)), warranty);
  assert.match(content, /server\/constants\/warrantyWindows\.json/);
  assert.doesNotMatch(content, /\b(7|6|3|1) (days|months)\b/, 'no second copy of a warranty number typed into the content file');
});

test('the price switch is off until the owner enters real prices', () => {
  assert.match(content, /export const SHOW_PUBLIC_PRICES = false;/);
});

test('the content file carries only allowed facts: no counts, ratings, testimonials, awards, licenses or response promises', () => {
  const banned = [/\d[\d,]*\+?\s*(happy\s+)?(customers|clients|jobs|units)/i, /\bstars?\b/i, /testimonial/i, /\baward/i, /certified/i, /licensed/i, /\bfree (quote|estimate|inspection)/i, /within \d+ (minutes|hours)/i, /same[- ]day/i, /guarantee/i];
  banned.forEach((pattern) => assert.doesNotMatch(copy, pattern, String(pattern)));
});

test('no em dashes anywhere in the landing files', () => {
  const files = ['src/config/landingContent.js', 'src/css/landing.css', 'src/pages/public/landing_page.jsx', 'src/components/availability_calendar.jsx', 'index.html'];
  fs.readdirSync(path.join(root, 'src', 'components', 'landing')).forEach((f) => files.push(`src/components/landing/${f}`));
  files.forEach((file) => assert.equal(read(...file.split('/')).includes('—'), false, file));
});

test('index.html carries the same description as SEO in the content file, plus a theme color and link preview text', () => {
  const html = read('index.html');
  const description = html.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.match(description, /^Cooling Zone Aircon Maintenance Services: aircon cleaning, repair, installation and check-ups for homes and businesses in Metro Manila and nearby areas, since 2009\. Mon to Sat, 8:00 AM to 6:00 PM\.$/);
  assert.match(html, /<meta property="og:title"/);
  assert.ok(html.includes(`<meta property="og:description" content="${description}"`));
  assert.match(html, /<meta name="theme-color" content="#0b2545"/);
  assert.ok(content.includes('description: `${BRAND_NAME}: aircon cleaning, repair, installation and check-ups for homes and businesses in ${AREA_SERVED}, since ${SINCE_YEAR}. ${HOURS_TEXT}.`'));
});

test('the page has one h1, a skip link, a main landmark, and every section anchor the navigation points to', () => {
  const page = read('src', 'pages', 'public', 'landing_page.jsx');
  const all = ['hero.jsx', 'trust_and_about.jsx', 'services_section.jsx', 'units_and_why.jsx', 'how_faq_cta.jsx', 'landing_footer.jsx', 'section_heading.jsx']
    .map((f) => read('src', 'components', 'landing', f)).join('\n') + page;
  assert.equal((all.match(/<h1[ >]/g) || []).length, 1);
  assert.match(page, /href="#main"/);
  assert.match(page, /<main id="main"/);
  ['home', 'about', 'services', 'availability'].forEach((id) => assert.match(all, new RegExp(`id="${id}"`), id));
});

test('every optional photo slot is hidden or replaced when no image is set, never an empty box', () => {
  const slot = read('src', 'components', 'landing', 'photo_slot.jsx');
  assert.match(slot, /if \(!photo \|\| !photo\.src \|\| failed\) return fallback;/);
  assert.match(slot, /onError=/);
});

test('the FAQ cancellation answer is the customer cancel note from config/cancellation.js: on or after the booked date', () => {
  assert.match(content, /import \{ CANCEL_POLICY_NOTE \} from '\.\/cancellation';/);
  assert.match(content, /a: CANCEL_POLICY_NOTE,/);
  assert.doesNotMatch(copy, /on the booked date/);
  const note = read('src', 'config', 'cancellation.js');
  assert.match(note, /Cancelling on or after the booked date may result in a transportation fee/);
});

test('How It Works step 1 says a preferred technician is subject to availability', () => {
  assert.match(content, /preferred technician, subject to availability/);
});

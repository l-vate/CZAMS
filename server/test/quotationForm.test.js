// Run with: npm test (inside server/). The quotation terms as the pages show them (src/utils/quotationTerms.js, components/quotation_terms.jsx):
// the standard terms agree with what the server writes for a new installation, the words are right, and nothing shows when there is
// nothing to say. No database; the client files are loaded through Vite and React comes from the project's own node_modules.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { startSsrServer } = require('./helpers/viteSsr');
const { quotationOf, startingQuotation } = require('../utils/quotation');

const root = path.join(__dirname, '..', '..');
const fromRoot = createRequire(path.join(root, 'package.json'));

let vite;
let closeVite;
before(async () => { ({ vite, close: closeVite } = await startSsrServer()); });
after(async () => { await closeVite(); });

const install = { serviceType: 'Installation' };

test('the standard terms a customer sees before paying are the ones the server writes on a new installation', async () => {
  const { standardTerms } = await vite.ssrLoadModule('/src/utils/quotationTerms.js');
  for (const clientSuppliedUnit of [false, true]) {
    const page = standardTerms({ clientSuppliedUnit });
    const saved = { service: install, clientSuppliedUnit, quotation: startingQuotation('Installation') };
    const server = quotationOf(saved);
    assert.deepEqual(page.estimatedDays, server.estimatedDays, `days, own unit ${clientSuppliedUnit}`);
    assert.deepEqual(page.exclusions, server.exclusions, `exclusions, own unit ${clientSuppliedUnit}`);
    assert.equal(page.warranty.workmanshipMonths, server.warranty.workmanshipMonths, `months, own unit ${clientSuppliedUnit}`);
    assert.equal(page.warranty.unitText, server.warranty.unitText, `unit text, own unit ${clientSuppliedUnit}`);
  }
});

test('days, months and the VAT inside a price read right', async () => {
  const { formatDays, formatMonths, vatInside } = await vite.ssrLoadModule('/src/utils/quotationTerms.js');
  assert.equal(formatDays({ min: 1, max: 2 }), '1 to 2 days');
  assert.equal(formatDays({ min: 1, max: 1 }), '1 day');
  assert.equal(formatDays({ min: 3 }), '3 days');
  assert.equal(formatDays(null), '');
  assert.equal(formatMonths(1), '1 month');
  assert.equal(formatMonths(6), '6 months');
  assert.equal(vatInside(11200), 1200);
});

test('the terms card shows the duration, the exclusions, the warranty and the VAT statement, and nothing when there is nothing', async () => {
  const React = fromRoot('react');
  const { renderToStaticMarkup } = fromRoot('react-dom/server');
  const Card = (await vite.ssrLoadModule('/src/components/quotation_terms.jsx')).default;
  const { standardTerms } = await vite.ssrLoadModule('/src/utils/quotationTerms.js');
  const render = (props) => renderToStaticMarkup(React.createElement(Card, props));

  const html = render({ terms: standardTerms({ clientSuppliedUnit: false }), site: { building: 'Tower A', floorRoom: '', attention: 'Ms. Reyes' } });
  assert.match(html, /Estimated time:<\/strong> 1 to 2 days/);
  for (const line of ['Feeder line', 'Carpentry works', 'Masonry works', 'Electrical works']) assert.match(html, new RegExp(`<li>${line}</li>`));
  assert.match(html, /Workmanship: 6 months/);
  assert.match(html, /Unit: Compressor 5 years, minor parts 1 year/);
  assert.match(html, /Building: Tower A/);
  assert.match(html, /Attention: Ms\. Reyes/);
  assert.doesNotMatch(html, /Floor or room/, 'an empty site detail is not listed');
  assert.doesNotMatch(html, /VAT/, 'a residential booking says nothing about VAT');

  const own = render({ terms: standardTerms({ clientSuppliedUnit: true }) });
  assert.match(own, /Workmanship: 3 months/);
  assert.match(own, /No warranty on the unit itself/);

  assert.match(render({ terms: { ...standardTerms({ clientSuppliedUnit: false }), taxInclusive: true } }), /The prices already include VAT\./);
  assert.match(render({ terms: standardTerms({ clientSuppliedUnit: false }), isCommercial: true }), /VAT \(12%\) is added on top of the prices\./);

  assert.equal(render({ terms: null }), '');
  assert.equal(render({ terms: { estimatedDays: null, exclusions: null, warranty: null, taxInclusive: false } }), '');
});

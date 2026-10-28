// Run with: npm test (inside server/). When a customer asked for a unit we do not have and the owner settled it with a different one, the booking
// summary says what was asked for and what we supply instead (src/utils/suppliedUnitChoice.js, unitChangeOf).
const test = require('node:test');
const assert = require('node:assert/strict');
const { startSsrServer } = require('./helpers/viteSsr');

let vite;
let close;
test.before(async () => { ({ vite, close } = await startSsrServer()); });
test.after(async () => { if (close) await close(); });

const settled = (asked, got, hp) => ({
  hp,
  supplied: { source: 'manual', status: 'Resolved', brand: got.brand, model: got.model || '', hp: String(hp), request: { brand: asked.brand, type: 'Split Type', hp: asked.hp, notes: '' } },
});

test('a different brand or horsepower is shown as requested and changed to; the same unit shows nothing', async () => {
  const { unitChangeOf } = await vite.ssrLoadModule('/src/utils/suppliedUnitChoice.js');
  assert.deepEqual(unitChangeOf(settled({ brand: 'Samsung', hp: '2.0' }, { brand: 'Samsung', model: '2.5 hp' }, 2.5)), { requested: 'Samsung 2.0 HP', changedTo: 'Samsung 2.5 hp, 2.5 HP' });
  assert.deepEqual(unitChangeOf(settled({ brand: 'Samsung', hp: '2.0' }, { brand: 'Samsung', model: '2.5 hp' }, 2)), { requested: 'Samsung 2.0 HP', changedTo: 'Samsung 2.5 hp, 2 HP' }, 'a model that was not asked for counts as a change');
  assert.deepEqual(unitChangeOf(settled({ brand: 'LG', hp: '1' }, { brand: 'Carrier' }, 1)), { requested: 'LG 1 HP', changedTo: 'Carrier, 1 HP' });
  assert.equal(unitChangeOf(settled({ brand: 'Samsung', hp: '2.0' }, { brand: 'samsung' }, 2)), null, 'the same brand and horsepower');
  assert.equal(unitChangeOf({ supplied: { source: 'requested', status: 'Pending', request: { brand: 'LG' } } }), null, 'still open');
  assert.equal(unitChangeOf({ supplied: { source: 'catalog', brand: 'Carrier' } }), null, 'a catalog choice that was never a request');
  assert.equal(unitChangeOf({}), null);
});

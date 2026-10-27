// The brand of a unit on a new booking. It is chosen from a list (the brands Cooling Zone supplies, common brands, or Other) and
// Other needs the brand typed in. The legacy `brandModel` text is read as the brand when no `brand` is sent, so older callers keep working.
// Pure: returns { problem, brand } and never touches the database.
const { invalid } = require('./validation');

const BRAND_MAX = 60;
const OTHER = 'other';
const clean = (v) => (typeof v === 'string' ? v.trim() : '');

function readUnitBrand(unit = {}) {
  const chosen = clean(unit.brand) || clean(unit.brandModel);
  if (!chosen) return { problem: invalid('Choose the brand of each unit.') };
  if (chosen.toLowerCase() === OTHER) {
    const typed = clean(unit.brandOther);
    if (!typed) return { problem: invalid('Type the brand when you choose Other.') };
    if (typed.length > BRAND_MAX) return { problem: invalid(`Keep the brand to ${BRAND_MAX} characters or fewer.`) };
    return { problem: null, brand: typed };
  }
  if (chosen.length > BRAND_MAX) return { problem: invalid(`Keep the brand to ${BRAND_MAX} characters or fewer.`) };
  return { problem: null, brand: chosen };
}

module.exports = { readUnitBrand, BRAND_MAX };

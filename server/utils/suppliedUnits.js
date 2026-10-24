// The supplied unit catalog and a booking's unit choices: the pure rules. The routes load and save; this decides what is valid.
//
// On a booking each unit entry of an Installation with a Cooling Zone unit carries `supplied`:
//   source 'catalog'   a catalog item the customer chose: its brand, model, type, hp, inverter flag and price are copied (frozen) then
//   source 'requested' "Not listed, ask the owner": the customer's free text, no price yet, status 'Pending' until the admin resolves it
//   source 'manual'    the admin resolved a request by entering a unit price and a short note instead of picking a catalog item
// A request is 'Pending' (the booking cannot be approved), 'Resolved' or 'Declined' (still cannot be approved, the customer is told why).
const { invalid } = require('./validation');

const LIMITS = Object.freeze({ brand: 40, model: 40, hpText: 10, requestBrand: 40, requestType: 40, requestHp: 10, notes: 300, note: 200, reason: 200, maxPrice: 10000000 });
const REASON_MIN = 3;

const HP_PATTERN = /^\d+(\.\d+)?$/;
const hpNumber = (hp) => (HP_PATTERN.test(String(hp ?? '').trim()) ? Number(String(hp).trim()) : NaN);
// "1", "1.0" and "1.00" are the same horsepower
const sameHp = (a, b) => Number.isFinite(hpNumber(a)) && hpNumber(a) === hpNumber(b);
const clean = (v) => (typeof v === 'string' ? v.trim() : '');

// What an admin may send for a catalog item. `unitTypes` are the allowed unit types. Returns { problem, values }.
function readCatalogInput(body = {}, unitTypes = []) {
  const brand = clean(body.brand);
  if (!brand) return { problem: invalid('Enter the brand.') };
  if (brand.length > LIMITS.brand) return { problem: invalid(`Keep the brand to ${LIMITS.brand} characters or fewer.`) };
  const model = clean(body.model);
  if (model.length > LIMITS.model) return { problem: invalid(`Keep the model to ${LIMITS.model} characters or fewer.`) };
  if (!unitTypes.includes(body.type)) return { problem: invalid(`Choose the unit type: ${unitTypes.join(', ')}.`) };
  const hp = clean(String(body.hp ?? ''));
  if (!HP_PATTERN.test(hp) || hp.length > LIMITS.hpText || !(Number(hp) > 0)) return { problem: invalid('Enter the horsepower as a number such as 1 or 1.5.') };
  if (typeof body.inverter !== 'boolean') return { problem: invalid('Say whether the unit is inverter or non-inverter.') };
  const price = body.price === undefined || body.price === null || body.price === '' ? NaN : Number(body.price);
  if (!Number.isFinite(price) || price < 0 || price > LIMITS.maxPrice) return { problem: invalid('Enter the price of one unit in pesos, 0 or more.') };
  return { problem: null, values: { brand, model, type: body.type, hp: String(Number(hp)), inverter: body.inverter, price: Math.round(price * 100) / 100 } };
}

// The same item twice would only confuse the customer's list.
const sameItem = (a, b) => a.brand.toLowerCase() === b.brand.toLowerCase() && (a.model || '').toLowerCase() === (b.model || '').toLowerCase()
  && a.type === b.type && sameHp(a.hp, b.hp) && a.inverter === b.inverter;

// A catalog item as the booking keeps it: a copy of what it said when it was chosen.
function snapshotOf(item, at = new Date()) {
  return {
    source: 'catalog', catalogId: String(item._id), brand: item.brand, model: item.model || '', type: item.type, hp: item.hp, inverter: item.inverter,
    price: item.price, chosenAt: at,
  };
}

const brandModelText = (s) => [s.brand, s.model].filter(Boolean).join(' ');

// What a customer's list of choices for the units of an installation comes to. `choices[i]` is what was sent for unit entry i:
//   { catalogId }                                       a catalog item
//   { notListed: true, brand, type, hp, notes }         "Not listed, ask the owner"
// `units` are the validated unit entries, `findItem(id)` returns the catalog item (or null). Only an Installation with a Cooling Zone
// unit needs a choice for every entry; any other booking keeps no supplied unit. Returns { problem, supplied } where supplied[i] is the
// snapshot (or request) to store on unit entry i.
async function readUnitChoices({ units, choices, needsChoice, findItem, now = new Date() }) {
  if (!needsChoice) return { problem: null, supplied: units.map(() => undefined) };
  const supplied = [];
  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    const choice = Array.isArray(choices) ? choices[i] : undefined;
    if (!choice || typeof choice !== 'object') {
      return { problem: invalid('Choose a unit from the list for each unit you want Cooling Zone to supply, or ask the owner if yours is not listed.') };
    }
    if (choice.notListed === true) {
      const brand = clean(choice.brand);
      const type = clean(choice.type) || unit.type;
      const hp = clean(String(choice.hp ?? '')) || clean(String(unit.hp ?? ''));
      const notes = clean(choice.notes);
      if (!brand && !notes) return { problem: invalid('Tell the owner the brand you want, or describe the unit in the notes.') };
      if (brand.length > LIMITS.requestBrand || type.length > LIMITS.requestType || hp.length > LIMITS.requestHp || notes.length > LIMITS.notes) {
        return { problem: invalid(`Keep the brand to ${LIMITS.requestBrand} characters and the notes to ${LIMITS.notes} or fewer.`) };
      }
      supplied.push({ source: 'requested', status: 'Pending', request: { brand, type, hp, notes }, chosenAt: now });
      continue;
    }
    if (typeof choice.catalogId !== 'string' || !choice.catalogId) {
      return { problem: invalid('Choose a unit from the list for each unit you want Cooling Zone to supply, or ask the owner if yours is not listed.') };
    }
    const item = await findItem(choice.catalogId);
    if (!item || item.isDeleted || item.isActive === false) {
      return { problem: invalid('That unit is no longer on the list. Choose another one, or ask the owner.') };
    }
    if (item.type !== unit.type || !sameHp(item.hp, unit.hp)) {
      return { problem: invalid('That unit does not match the type and horsepower you chose. Choose one from the list for this unit.') };
    }
    supplied.push(snapshotOf(item, now));
  }
  return { problem: null, supplied };
}

// The brand and model text kept on the unit entry (brandModel, which every screen already shows), from its chosen unit.
function brandModelOf(unit) {
  const s = unit.supplied;
  if (!s) return unit.brandModel || '';
  if (s.source === 'requested') return s.request?.brand || unit.brandModel || '';
  return brandModelText(s) + (s.inverter ? ' (inverter)' : '');
}

// Which unit entries still need the owner: a request not yet resolved, or one that was declined.
function unitsNeedingOwner(units) {
  return (units || []).map((u, index) => ({ u, index })).filter(({ u }) => u.supplied && u.supplied.source === 'requested' && ['Pending', 'Declined'].includes(u.supplied.status));
}

// null when every unit request is settled, otherwise { status, message }: the booking cannot be approved yet.
function unitConfirmationProblem(units) {
  const open = unitsNeedingOwner(units);
  if (open.length === 0) return null;
  if (open.some(({ u }) => u.supplied.status === 'Declined')) {
    return invalid('A unit request on this booking was declined. Choose another unit for it, or cancel the booking, before approving.', 409);
  }
  return invalid('A unit on this booking needs owner confirmation. Pick a unit from the catalog or enter a unit price, or decline the request, before approving.', 409);
}

// What an admin may send to settle one request: { catalogId } or { price, note } or { decline: true, reason }.
async function readResolution(body = {}, unit, findItem, now = new Date()) {
  if (body.decline === true) {
    const reason = clean(body.reason);
    if (reason.length < REASON_MIN || reason.length > LIMITS.reason) return { problem: invalid(`Give a short reason of ${REASON_MIN} to ${LIMITS.reason} characters for declining.`) };
    return { problem: null, kind: 'declined', reason };
  }
  if (typeof body.catalogId === 'string' && body.catalogId) {
    const item = await findItem(body.catalogId);
    if (!item || item.isDeleted || item.isActive === false) return { problem: invalid('That catalog unit does not exist or is not active.') };
    if (item.type !== unit.type || !sameHp(item.hp, unit.hp)) {
      return { problem: invalid('That catalog unit is a different type or horsepower from the unit on the booking.') };
    }
    return { problem: null, kind: 'catalog', snapshot: snapshotOf(item, now) };
  }
  const price = body.price === undefined || body.price === null || body.price === '' ? NaN : Number(body.price);
  const note = clean(body.note);
  if (!Number.isFinite(price) || price < 0 || price > LIMITS.maxPrice) return { problem: invalid('Pick a catalog unit, enter the price of one unit, or decline the request.') };
  if (note.length < REASON_MIN || note.length > LIMITS.note) return { problem: invalid(`Add a short note of ${REASON_MIN} to ${LIMITS.note} characters about this price.`) };
  return { problem: null, kind: 'manual', price: Math.round(price * 100) / 100, note };
}

module.exports = {
  LIMITS, REASON_MIN, hpNumber, sameHp, readCatalogInput, sameItem, snapshotOf, readUnitChoices, brandModelOf, brandModelText,
  unitsNeedingOwner, unitConfirmationProblem, readResolution,
};

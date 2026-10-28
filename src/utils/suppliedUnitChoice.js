// What a customer (or the admin booking for a walk-in) chose for each unit entry of an Installation with a unit from the company: a unit
// from the catalog, or "Not listed, ask the owner". The server re-checks everything (utils/suppliedUnits.js); this only lets the form
// narrow the list, price the booking and refuse to go on without a choice.
export const NOT_LISTED_NOTES_MAX = 300;
export const NOT_LISTED_BRAND_MAX = 40;

// Horsepower is compared as a number, so "1" and "1.0" are the same.
const hpNumber = (hp) => (/^\d+(\.\d+)?$/.test(String(hp ?? '').trim()) ? Number(String(hp).trim()) : NaN);
export const sameHp = (a, b) => Number.isFinite(hpNumber(a)) && hpNumber(a) === hpNumber(b);

// The horsepower choice that equals a stored value: the server keeps "1.0" as "1", but the horsepower box lists "1.0". The stored text
// itself when no choice equals it.
export const hpChoiceFor = (options, hp) => (options || []).find((o) => sameHp(o, hp)) ?? String(hp ?? '');

// The brand chosen for a unit entry: the list choice, or the text typed after Other ('' while it is still empty).
export const chosenBrand = (unit) => String(unit?.brandModel || '').trim();

// The catalog items that fit a unit entry: its type and its horsepower, and its brand once one is chosen.
export function matchingUnits(items, unit) {
  if (!unit?.type || !unit?.hp) return [];
  const brand = chosenBrand(unit).toLowerCase();
  return (items || []).filter((i) => i.type === unit.type && sameHp(i.hp, unit.hp) && (!brand || String(i.brand).toLowerCase() === brand));
}

// The brands to offer in the Brand dropdown: the active catalog brands first (for a unit the company supplies), then the common brands
// not already listed. "Other" is added by the form.
export function brandChoices(catalogItems, commonBrands) {
  const fromCatalog = [...new Set((catalogItems || []).map((i) => i.brand))].sort((a, b) => a.localeCompare(b));
  const seen = new Set(fromCatalog.map((b) => b.toLowerCase()));
  return [...fromCatalog, ...commonBrands.filter((b) => !seen.has(b.toLowerCase()))];
}

// The matching items grouped by brand, brands in order: [{ brand, items }].
export function groupByBrand(items) {
  const groups = new Map();
  (items || []).forEach((i) => {
    if (!groups.has(i.brand)) groups.set(i.brand, []);
    groups.get(i.brand).push(i);
  });
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([brand, list]) => ({ brand, items: list }));
}

// The short readable line of brands the company supplies, or '' when it supplies none right now.
export function brandsLine(items) {
  const brands = [...new Set((items || []).map((i) => i.brand))].sort((a, b) => a.localeCompare(b));
  return brands.length > 0 ? `Brands we supply: ${brands.join(', ')}.` : '';
}

export const unitLabel = (item) => `${[item.brand, item.model].filter(Boolean).join(' ')}${item.inverter ? ' (inverter)' : ' (non-inverter)'}`;

// The form's choice for one unit entry as it is sent to the server: { catalogId } or { notListed, brand, notes }.
export function choiceToSend(supplied) {
  if (!supplied) return undefined;
  if (supplied.notListed) return { notListed: true, brand: (supplied.brand || '').trim(), notes: (supplied.notes || '').trim() };
  return supplied.catalogId ? { catalogId: supplied.catalogId } : undefined;
}

// The units as the server wants them. A customer's own unit carries no choice, whatever the form still holds.
export function unitsForSubmit(units, clientSuppliedUnit) {
  return (units || []).map((u) => {
    const { supplied, brandOther, ...rest } = u; // brandOther says the brand was typed after choosing Other
    const choice = clientSuppliedUnit ? undefined : choiceToSend(supplied);
    // the brand as the server reads it: a list choice as it is, or "Other" with the typed text
    const brand = brandOther ? { brand: 'Other', brandOther: rest.brandModel } : { brand: rest.brandModel };
    return choice ? { ...rest, ...brand, supplied: choice } : { ...rest, ...brand };
  });
}

// true when the unit entry has what it needs: a catalog unit, or a request that says which brand or describes the unit.
export function hasChoice(unit) {
  const s = unit?.supplied;
  if (!s) return false;
  if (s.notListed) return Boolean((s.brand || '').trim() || (s.notes || '').trim());
  return Boolean(s.catalogId);
}

// The price of the chosen catalog units for the whole booking: [{ label, quantity, unitPrice, subtotal }].
export function equipmentLines(units) {
  return (units || [])
    .filter((u) => u.supplied && !u.supplied.notListed && Number.isFinite(u.supplied.price))
    .map((u) => ({ label: unitLabel(u.supplied), quantity: u.quantity || 0, unitPrice: u.supplied.price, subtotal: u.supplied.price * (u.quantity || 0) }));
}

// When a customer asked for a unit we do not have and the owner settled it with a different one: what was asked for and what we supply
// instead, for the booking summary ("Requested: ... (not available)", "Changed to: ..."). null when nothing changed.
export function unitChangeOf(unit) {
  const s = unit?.supplied;
  const asked = s?.request;
  if (!s || s.status !== 'Resolved' || !asked) return null;
  const hpText = (hp) => (hp ? `${hp} HP` : '');
  const requested = [asked.brand, hpText(asked.hp)].filter(Boolean).join(' ') || 'the unit asked for';
  const changedTo = [[s.brand, s.model].filter(Boolean).join(' '), hpText(s.hp || unit.hp)].filter(Boolean).join(', ');
  // shown whenever what was asked for and what we supply are not the same thing: a different brand, a model that was not asked for, or another horsepower
  const words = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();
  const askedHp = Number(asked.hp);
  const gotHp = Number(s.hp || unit.hp);
  const hpSame = !(askedHp > 0) || !(gotHp > 0) || askedHp === gotHp;
  const sameThing = words(asked.brand) === words([s.brand, s.model].filter(Boolean).join(' ')) && hpSame;
  if (!changedTo || sameThing) return null;
  return { requested, changedTo };
}

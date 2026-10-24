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

// The catalog items that fit a unit entry: its type and its horsepower.
export function matchingUnits(items, unit) {
  if (!unit?.type || !unit?.hp) return [];
  return (items || []).filter((i) => i.type === unit.type && sameHp(i.hp, unit.hp));
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
    const { supplied, brandOther, ...rest } = u; // brandOther is only for the brand box
    void brandOther;
    const choice = clientSuppliedUnit ? undefined : choiceToSend(supplied);
    return choice ? { ...rest, supplied: choice } : rest;
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

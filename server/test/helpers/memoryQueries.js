// A small stand-in for the Mongo filters the booking code builds, so route tests can run with no database.
// It understands what those filters use: equality, $in, $ne, $or, and dotted paths through arrays.
// It checks that the code asks for the right thing; it does not prove how Atlas evaluates the same filter.
function valuesAt(doc, pathStr) {
  let current = [doc];
  for (const part of pathStr.split('.')) {
    current = current
      .flatMap((v) => (v == null ? [] : Array.isArray(v) ? v.map((x) => x?.[part]) : [v[part]]))
      .flatMap((v) => (Array.isArray(v) ? v : [v]));
  }
  return current;
}

function matches(doc, filter) {
  return Object.entries(filter || {}).every(([key, cond]) => {
    if (key === '$or') return cond.some((f) => matches(doc, f));
    if (key === '$and') return cond.every((f) => matches(doc, f));
    const values = valuesAt(doc, key);
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      if ('$elemMatch' in cond) {
        // some element of the array at this path satisfies every condition in $elemMatch
        const list = doc && doc[key];
        return Array.isArray(list) && list.some((item) => matches(item, cond.$elemMatch));
      }
      if ('$exists' in cond) return cond.$exists ? values.some((v) => v !== undefined) : values.every((v) => v === undefined);
      if ('$in' in cond) return values.some((v) => cond.$in.includes(v));
      if ('$ne' in cond) return !values.includes(cond.$ne);
      if ('$gte' in cond || '$lte' in cond) {
        return values.some((v) => (!('$gte' in cond) || v >= cond.$gte) && (!('$lte' in cond) || v <= cond.$lte));
      }
    }
    return values.includes(cond);
  });
}

// What a Mongoose query gives back: awaitable and chainable the way the routes chain it.
// Sorts the way a query's sort({ field: 1 | -1 }) does, for arrays whose items have those fields. A field no item has leaves the
// order alone, so fixtures that never set it keep their order.
const sorted = (value, spec) => {
  if (!Array.isArray(value) || !spec || typeof spec !== 'object') return value;
  const keys = Object.entries(spec).filter(([key]) => value.some((v) => v && v[key] !== undefined));
  if (keys.length === 0) return value;
  return [...value].sort((a, b) => {
    for (const [key, dir] of keys) {
      const x = a && a[key];
      const y = b && b[key];
      if (x === y || (x === undefined && y === undefined)) continue;
      if (x === undefined) return 1;
      if (y === undefined) return -1;
      return (x < y ? -1 : 1) * (dir < 0 ? -1 : 1);
    }
    return 0;
  });
};

const chain = (value) => ({
  select() { return this; },
  sort(spec) { return chain(sorted(value, spec)); },
  populate() { return this; },
  lean() { return this; },
  limit() { return this; },
  distinct(field) { return chain(Array.isArray(value) ? [...new Set(value.map((v) => v[field]))] : []); },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

module.exports = { matches, chain };

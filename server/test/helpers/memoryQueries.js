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
    const values = valuesAt(doc, key);
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      if ('$in' in cond) return values.some((v) => cond.$in.includes(v));
      if ('$ne' in cond) return !values.includes(cond.$ne);
    }
    return values.includes(cond);
  });
}

// What a Mongoose query gives back: awaitable and chainable the way the routes chain it.
const chain = (value) => ({
  select() { return this; },
  sort() { return this; },
  populate() { return this; },
  lean() { return this; },
  distinct(field) { return chain(Array.isArray(value) ? [...new Set(value.map((v) => v[field]))] : []); },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

module.exports = { matches, chain };

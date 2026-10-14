// At start-up, finds out whether a collection's indexes could be built, and says so once, plainly, when one could not. A unique index that
// fails to build (an older plain index of the same name is in the way, or the data already has duplicates) leaves the application running
// without the guarantee it relies on, and Mongoose only reports that to a promise nobody reads. This reads it. The warning names the collection
// and the index and nothing else: no connection string, no data. The server keeps running either way.
const fixHints = Object.freeze({
  reports: 'Run: node scripts/fixReportsIndex.js (a dry run first).',
});

// The index name an index build error is about, when the driver's message says it; otherwise null.
function indexNameFrom(err) {
  const text = String((err && err.message) || '');
  const named = text.match(/name:\s*"([^"]+)"/);
  if (named) return named[1];
  if (err && err.keyPattern) return Object.keys(err.keyPattern).map((k) => `${k}_1`).join('_');
  return null;
}

// `models` are Mongoose models. `warn` is how the warning is written (console.warn by default). Resolves once every model has settled.
async function watchIndexes(models, { warn = console.warn } = {}) {
  const warned = new Set();
  await Promise.all(models.map(async (model) => {
    try {
      await model.init();
    } catch (err) {
      const collection = model.collection && model.collection.name ? model.collection.name : model.modelName;
      if (warned.has(collection)) return;
      warned.add(collection);
      const index = indexNameFrom(err);
      const hint = fixHints[collection] ? ` ${fixHints[collection]}` : '';
      warn(`Index warning: an index on the collection "${collection}"${index ? ` (${index})` : ''} could not be built, so the database may not be enforcing it. The server is running anyway.${hint}`);
    }
  }));
  return [...warned];
}

module.exports = { watchIndexes, indexNameFrom };

// Read only export of every collection of a database to JSON files (EJSON, so dates and ids survive). Used by scripts/backupToJson.js.
// It only ever calls listCollections and find on the database it is given; nothing is written to the database.
const fs = require('fs');
const path = require('path');
const { EJSON } = require('bson');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function isInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// 2026-10-16T09:05:03.123Z becomes 2026-10-16_09-05-03
function stamp(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
}

// the folder this run writes to; refuses anything inside the project folder
function backupFolder(baseDir, date = new Date(), projectRoot = PROJECT_ROOT) {
  const folder = path.resolve(baseDir, `CZAMS-${stamp(date)}`);
  if (isInside(projectRoot, folder)) {
    throw new Error('Refusing to write a backup inside the project folder. Choose a folder outside it.');
  }
  return folder;
}

// streams one collection to a file as a JSON array, one document at a time, so large GridFS chunks never sit in memory together
async function exportCollection(collection, file) {
  const fd = fs.openSync(file, 'wx');
  let count = 0;
  try {
    fs.writeSync(fd, '[');
    for await (const doc of collection.find({})) {
      fs.writeSync(fd, `${count ? ',' : ''}\n${EJSON.stringify(doc, { relaxed: false })}`);
      count += 1;
    }
    fs.writeSync(fd, count ? '\n]\n' : ']\n');
  } finally {
    fs.closeSync(fd);
  }
  return count;
}

// db: a native driver Db. Returns { folder, collections: [{ name, count }] }.
async function backupDatabase(db, { baseDir, date, projectRoot, log = () => {} }) {
  const folder = backupFolder(baseDir, date, projectRoot);
  const infos = await db.listCollections({}, { nameOnly: false }).toArray();
  const names = infos
    .filter((c) => c.type !== 'view' && !c.name.startsWith('system.'))
    .map((c) => c.name)
    .sort();
  fs.mkdirSync(folder, { recursive: true });
  const collections = [];
  for (const name of names) {
    const count = await exportCollection(db.collection(name), path.join(folder, `${name}.json`));
    collections.push({ name, count });
    log(`${name}: ${count}`);
  }
  return { folder, collections };
}

module.exports = { backupDatabase, backupFolder, exportCollection, isInside, stamp, PROJECT_ROOT };

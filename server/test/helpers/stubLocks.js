// The stand-in for the Lock collection (utils/slotLock.js), for tests that build their own small Express app instead of using createBooking.js.
// Creating a lock that exists fails with a duplicate key error, like the unique _id does in MongoDB.
const Lock = require('../../models/Lock');

function installLockStub() {
  const held = new Map();
  Lock.create = async (doc) => {
    if (held.has(doc._id)) throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
    held.set(doc._id, doc); // taken at once: the database decides who is first in one step
    await new Promise((resolve) => { setImmediate(resolve); }); // and the answer still takes a moment to come back, so requests overlap
    return doc;
  };
  Lock.deleteOne = async (filter) => {
    const lock = held.get(filter._id);
    if (lock && (!filter.expiresAt || lock.expiresAt < filter.expiresAt.$lt)) held.delete(filter._id);
    return { acknowledged: true };
  };
  return held;
}

module.exports = { installLockStub };

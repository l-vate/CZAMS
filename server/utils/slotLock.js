// Makes "check, then write" safe when two requests arrive at the same moment. A request takes a lock on a key (a document with that unique
// _id), does its check and its write, and lets go; a second request for the same key waits its turn and then sees what the first wrote.
// It works across server processes because the lock lives in the database, and it needs no clean-up of old data: a lock only exists while
// a request is working (and expires by itself if the request died).
const Lock = require('../models/Lock');

const HOLD_MS = 15000; // the longest a lock can survive a request that never let go
const WAIT_MS = 6000; // the longest a request waits for its turn
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

class LockBusyError extends Error {
  constructor() {
    super('This is being processed for someone else at the moment. Please try again in a few seconds.');
    this.name = 'LockBusyError';
  }
}

async function acquire(key, { holdMs = HOLD_MS, waitMs = WAIT_MS } = {}) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      await Lock.create({ _id: key, expiresAt: new Date(Date.now() + holdMs) });
      return;
    } catch (err) {
      if (err.code !== 11000) throw err;
      await Lock.deleteOne({ _id: key, expiresAt: { $lt: new Date() } }); // the holder died: take it over
      if (Date.now() >= deadline) throw new LockBusyError();
      await sleep(30 + Math.floor(Math.random() * 40));
    }
  }
}

// Runs fn() while holding every key (taken in sorted order, so two requests wanting the same keys cannot wait on each other forever).
async function withLocks(keys, fn, options) {
  const ordered = [...new Set(keys)].sort();
  const held = [];
  try {
    for (const key of ordered) {
      await acquire(key, options);
      held.push(key);
    }
    return await fn();
  } finally {
    await Promise.all(held.map((key) => Lock.deleteOne({ _id: key }).catch(() => {})));
  }
}

module.exports = { withLocks, LockBusyError, HOLD_MS, WAIT_MS };

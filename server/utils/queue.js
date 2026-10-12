// The Pending queue: first come, first served by default, and the admin can move a request up,
// down or to the top. Only Pending bookings are in the queue; approving one simply takes it out
// and the rest keep their relative order. The queue position is for admins only (queueRank is
// not selected by default, so customers never receive it).
const { ROLE } = require('../constants/roles');
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const Booking = require('../models/Booking');
const Counter = require('../models/Counter');
const User = require('../models/User');
const { activeStatuses, getMemberIds, getMinTechnicians, ASSIGNMENT_POPULATE } = require('./assignments');
const { slotsOf } = require('./extensionDays');

const RANK_GAP = 1000;
const COUNTER_ID = 'queueRank';

// A rank higher than every rank handed out so far. Atomic, so two bookings created at the
// same instant still get different ranks.
async function nextQueueRank() {
  const counter = await Counter.findOneAndUpdate(
    { _id: COUNTER_ID },
    { $inc: { seq: RANK_GAP } },
    { upsert: true, returnDocument: 'after' }
  );
  return counter.seq;
}

// One reorder at a time. This server is a single process, so a promise chain is enough to
// make two quick clicks run one after the other instead of interleaving their writes.
let chain = Promise.resolve();
function serialized(task) {
  const run = chain.then(task, task);
  chain = run.catch(() => {});
  return run;
}

const POPULATE = [
  { path: 'service' },
  { path: 'customer', select: 'name email phone clientType companyName representativeName' },
  { path: 'technician', select: 'name' },
  ...ASSIGNMENT_POPULATE,
];

// Pending bookings in queue order: rank, then who asked first. Bookings with no rank yet
// (made before the queue existed) are ranked now in the order they were requested, so
// nothing is lost and the first-come order is kept.
async function loadOrderedPending() {
  const unranked = await Booking.find({ status: BOOKING_STATUS.PENDING, queueRank: { $exists: false } })
    .select('_id createdAt').sort({ createdAt: 1, _id: 1 });
  if (unranked.length > 0) {
    // Older than anything already ranked, so they go first, in the order they were requested.
    const ranked = await Booking.find({ status: BOOKING_STATUS.PENDING, queueRank: { $exists: true } })
      .select('_id +queueRank').sort({ queueRank: 1, createdAt: 1, _id: 1 });
    await renumber([...unranked, ...ranked].map((b) => b._id));
  }

  const pending = await Booking.find({ status: BOOKING_STATUS.PENDING })
    .select('+queueRank')
    .sort({ queueRank: 1, createdAt: 1, _id: 1 })
    .populate(POPULATE);

  // Repair duplicate ranks (should not happen, but a clean read is worth a check).
  const ranks = pending.map((b) => b.queueRank);
  if (new Set(ranks).size !== ranks.length) {
    await renumber(pending.map((b) => b._id));
    return Booking.find({ status: BOOKING_STATUS.PENDING }).select('+queueRank').sort({ queueRank: 1 }).populate(POPULATE);
  }
  return pending;
}

// Give the bookings ranks 1000, 2000, ... in the order given, in one bulk write, and make
// sure the counter is never behind them.
async function renumber(orderedIds) {
  if (orderedIds.length === 0) return;
  await Booking.bulkWrite(
    orderedIds.map((id, index) => ({
      updateOne: { filter: { _id: id }, update: { $set: { queueRank: (index + 1) * RANK_GAP } } },
    })),
    { ordered: true }
  );
  await Counter.updateOne({ _id: COUNTER_ID }, { $max: { seq: orderedIds.length * RANK_GAP } }, { upsert: true });
}

// action: 'up' | 'down' | 'top'. Returns { error } for a booking that cannot be moved.
function reorder(bookingId, action) {
  return serialized(async () => {
    const pending = await loadOrderedPending();
    const index = pending.findIndex((b) => b.bookingId === bookingId);
    if (index === -1) return { error: 'Only a pending booking can be moved in the queue.' };

    const order = pending.map((b) => b._id);
    const [moved] = order.splice(index, 1);
    let target;
    if (action === 'top') target = 0;
    else if (action === 'up') target = Math.max(0, index - 1);
    else if (action === 'down') target = Math.min(pending.length - 1, index + 1);
    else return { error: 'Choose up, down or top.' };
    order.splice(target, 0, moved);

    await renumber(order);
    return { ok: true };
  });
}

// The queue for the admin screen: each Pending booking with its position and a capacity
// hint. "Free" counts technicians (or, for a two-person service, pairs of technicians) not
// already on an assigned booking in that date and time block; other unassigned requests do
// not use anyone up yet. positionInBlock is how far down the queue this request is among the
// still-unassigned ones for the same block, and overCapacity says there are more of them
// than free technicians or pairs, so someone in that block will not get anyone.
async function getQueue() {
  const pending = await loadOrderedPending();

  const [technicians, occupying] = await Promise.all([
    User.find({ role: ROLE.STAFF, isActive: true }).select('_id'),
    Booking.find({ status: { $in: activeStatuses() } }).select('bookingId date time technician assignments extensionDays'),
  ]);

  const busyIn = (date, time, ownId) => {
    const busy = new Set();
    occupying.forEach((b) => {
      if (b.bookingId !== ownId && slotsOf(b).some((s) => s.date === date && s.time === time)) getMemberIds(b).forEach((id) => busy.add(id));
    });
    return busy;
  };

  const seenInBlock = new Map();
  return pending.map((b, index) => {
    const solo = getMinTechnicians(b.service) === 1;
    const busy = busyIn(b.date, b.time, b.bookingId);
    const freeTechnicians = technicians.filter((t) => !busy.has(t._id)).length;
    const free = solo ? freeTechnicians : Math.floor(freeTechnicians / 2);

    const assigned = getMemberIds(b).length > 0;
    const blockKey = `${b.date}|${b.time}`;
    const positionInBlock = assigned ? null : (seenInBlock.get(blockKey) || 0) + 1;
    if (!assigned) seenInBlock.set(blockKey, positionInBlock);

    return {
      booking: b,
      position: index + 1,
      free,
      unit: solo ? 'technician' : 'pair',
      positionInBlock,
      overCapacity: !assigned && positionInBlock > free,
    };
  });
}

module.exports = { nextQueueRank, reorder, getQueue };

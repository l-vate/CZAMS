// The trail of who was assigned to a booking. Each entry records what the assignment was before
// and after one admin change. Entries are only ever appended; older bookings simply have none.
const { invalid } = require('./validation');

const REASON_MAX = 200;

const pairOf = (a) => ({ lead: a.lead || null, helper: a.helper || null });

// An optional reason. Returns { problem, reason }: problem is null or { status, message }.
function readReason(raw) {
  if (raw === undefined || raw === null || raw === '') return { problem: null, reason: undefined };
  if (typeof raw !== 'string') return { problem: invalid('The reason must be text.') };
  const text = raw.trim();
  if (text.length > REASON_MAX) return { problem: invalid(`The reason must be ${REASON_MAX} characters or fewer.`) };
  return { problem: null, reason: text || undefined };
}

// `before` and `after` are lists of { lead, helper } (extra keys such as team are ignored).
function buildHistoryEntry({ before, after, changedBy, reason, now = new Date() }) {
  return {
    previous: before.map(pairOf),
    next: after.map(pairOf),
    changedBy,
    changedAt: now,
    ...(reason ? { reason } : {}),
  };
}

// The list as shown to someone. `names` maps a user id to a name. An admin also sees who made the
// change and why; a technician sees only what changed and when.
function viewHistory(entries, names, { admin }) {
  const nameOf = (id) => (id ? names.get(id) || 'Unknown' : null);
  const people = (list) => list.map((p) => ({ lead: nameOf(p.lead), helper: nameOf(p.helper) }));
  return (entries || []).map((e) => ({
    changedAt: e.changedAt,
    previous: people(e.previous || []),
    next: people(e.next || []),
    ...(admin ? { changedBy: nameOf(e.changedBy), reason: e.reason || null } : {}),
  }));
}

// Every user id mentioned in the entries, so the names can be looked up once.
function idsIn(entries) {
  const ids = new Set();
  (entries || []).forEach((e) => {
    [...(e.previous || []), ...(e.next || [])].forEach((p) => { if (p.lead) ids.add(p.lead); if (p.helper) ids.add(p.helper); });
    if (e.changedBy) ids.add(e.changedBy);
  });
  return [...ids];
}

module.exports = { REASON_MAX, readReason, buildHistoryEntry, viewHistory, idsIn };

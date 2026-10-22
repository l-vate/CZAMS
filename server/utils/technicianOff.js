// Days off for technicians: the pure rules plus the small lookups the booking code shares. An entry says one technician is not
// available on a date in one or both time blocks (see models/TechnicianOff.js).
const { invalid } = require('./validation');
const { manilaTodayKey, TIME_BLOCKS } = require('./timeBlocks');
const { isRealDateKey } = require('./closures');

const REASON_MAX = 200;
const MAX_TECHNICIANS_AT_ONCE = 50;

// What an admin is allowed to add. `fieldIds` is the list of ids of the active field technicians. Returns { problem, values }:
// problem is null or { status, message }; values are { technicians, date, blocks, reason }. `today` is a Manila date key.
function readOffInput({ technicians, date, blocks, reason }, fieldIds, today = manilaTodayKey()) {
  if (!isRealDateKey(date)) return { problem: invalid('Choose a valid date (YYYY-MM-DD).') };
  if (date < today) return { problem: invalid('A day off cannot be on a date that has already passed.') };
  const ids = [...new Set((Array.isArray(technicians) ? technicians : []).map(String))];
  if (ids.length === 0) return { problem: invalid('Choose at least one technician.') };
  if (ids.length > MAX_TECHNICIANS_AT_ONCE) return { problem: invalid(`Choose at most ${MAX_TECHNICIANS_AT_ONCE} technicians at a time.`) };
  const unknown = ids.filter((id) => !fieldIds.includes(id));
  if (unknown.length > 0) return { problem: invalid('Only active field technicians can be marked as off.') };
  const wanted = [...new Set(Array.isArray(blocks) ? blocks : [])];
  if (wanted.length === 0 || wanted.some((b) => !TIME_BLOCKS.includes(b))) {
    return { problem: invalid('Choose Morning, Afternoon or both.') };
  }
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length > REASON_MAX) return { problem: invalid(`Keep the reason to ${REASON_MAX} characters or fewer.`) };
  return { problem: null, values: { technicians: ids, date, blocks: TIME_BLOCKS.filter((b) => wanted.includes(b)), reason: text } };
}

// The ids of the technicians off on `date` in `time`, from a list of entries.
function offIdsAt(rows, date, time) {
  const ids = new Set();
  (rows || []).forEach((r) => { if (r.date === date && r.blocks.includes(time)) ids.add(String(r.technician)); });
  return ids;
}

// Maps a date key to the set of technician ids off in `time` that day (the shape auto-assign uses for busy technicians).
function offByDate(rows, time) {
  const byDate = new Map();
  (rows || []).forEach((r) => {
    if (!r.blocks.includes(time)) return;
    if (!byDate.has(r.date)) byDate.set(r.date, new Set());
    byDate.get(r.date).add(String(r.technician));
  });
  return byDate;
}

// The entries from `from` to `to` (inclusive), read from the TechnicianOff model passed in.
function offRowsBetween(TechnicianOff, from, to) {
  return TechnicianOff.find({ date: { $gte: from, $lte: to } }).select('technician date blocks').lean();
}

module.exports = { REASON_MAX, readOffInput, offIdsAt, offByDate, offRowsBetween };

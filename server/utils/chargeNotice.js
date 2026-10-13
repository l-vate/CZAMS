// The words the customer is sent when the admin changes the distance-based charge or the mobilization fee on their booking: what
// actually happened (added, increased, lowered or removed), for each charge that changed, in ONE message. "Outside Quezon City" is
// only said when the address really is outside. Pure, so it is tested on its own.
const CHARGES = [
  { key: 'distanceAdjustment', name: 'distance-based charge' },
  { key: 'mobilizationFee', name: 'mobilization fee' },
];

const peso = (n) => `₱${Number(n).toLocaleString()}`;

function phrase(name, before, after) {
  if (!before && after) return `a ${name} of ${peso(after)} was added`;
  if (before && !after) return `the ${name} was removed`;
  return after > before
    ? `the ${name} was increased from ${peso(before)} to ${peso(after)}`
    : `the ${name} was lowered from ${peso(before)} to ${peso(after)}`;
}

// `before` and `after` hold the two charges as numbers (a missing one counts as 0). Returns the message, or null when neither charge
// changed.
function describeChargeChanges({ bookingId, before, after, outsideArea }) {
  const parts = CHARGES
    .map(({ key, name }) => ({ name, was: before[key] || 0, now: after[key] || 0 }))
    .filter((c) => c.was !== c.now)
    .map((c) => phrase(c.name, c.was, c.now));
  if (parts.length === 0) return null;
  const joined = parts.length === 2 ? `${parts[0]}, and ${parts[1]}` : parts[0];
  const sentence = `On booking ${bookingId}, ${joined}${outsideArea ? ' because the address is outside Quezon City' : ''}.`;
  return `${sentence} This has been reflected in your total.`;
}

module.exports = { describeChargeChanges };
